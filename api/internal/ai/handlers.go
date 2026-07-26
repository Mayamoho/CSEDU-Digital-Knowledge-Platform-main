package ai

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

type Handler struct {
	db         *pgxpool.Pool
	redis      *redis.Client
	ragURL     string
	httpClient *http.Client
}

func NewHandler(db *pgxpool.Pool, redis *redis.Client) *Handler {
	ragURL := os.Getenv("RAG_SERVICE_URL")
	if ragURL == "" {
		ragURL = "http://rag:8001"
	}

	return &Handler{
		db:     db,
		redis:  redis,
		ragURL: ragURL,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

type ChatRequest struct {
	Query        string `json:"query"`
	SessionID    string `json:"session_id,omitempty"`
	Language     string `json:"language,omitempty"`
	RewriteQuery bool   `json:"rewrite_query,omitempty"`
}

type ChatResponse struct {
	Response         string     `json:"response"`
	Sources          []Citation `json:"sources"`
	ModelUsed        string     `json:"model_used"`
	ResponseTime     string     `json:"response_time"`
	SessionID        string     `json:"session_id"`
	MessageID        string     `json:"message_id,omitempty"`
	DetectedLanguage string     `json:"detected_language,omitempty"`
	QueryRewritten   bool       `json:"query_rewritten,omitempty"`
}

type Citation struct {
	ItemID    string `json:"item_id"`
	Title     string `json:"title"`
	ChunkText string `json:"chunk_text,omitempty"`
}

// RAG Service request/response types
type ragQueryRequest struct {
	Query        string        `json:"query"`
	UserRole     string        `json:"user_role"`
	Language     string        `json:"language"`
	SessionID    string        `json:"session_id,omitempty"`
	RewriteQuery bool          `json:"rewrite_query"`
	History      []historyTurn `json:"history,omitempty"`
}

// historyTurn is one prior exchange in the session (FR-AI-008).
type historyTurn struct {
	Query    string `json:"query"`
	Response string `json:"response"`
}

type ragQueryResponse struct {
	Response         string              `json:"response"`
	Citations        []map[string]string `json:"citations"`
	SourceDocIDs     []string            `json:"source_doc_ids"`
	ModelUsed        string              `json:"model_used"`
	DetectedLanguage string              `json:"detected_language,omitempty"`
	QueryRewritten   bool                `json:"query_rewritten"`
}

// POST /api/v1/ai/chat
func (h *Handler) Chat(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}

	// FR-AI-018 / SDD §6.4: reject obvious instruction-override attempts before
	// they reach the LLM. Defence in depth — the grounded prompt is the real
	// mitigation, but there is no reason to spend a Groq call on a jailbreak.
	if detectPromptInjection(req.Query) {
		aiBlockedQueries.Inc()
		writeError(w, http.StatusBadRequest,
			"This request looks like an attempt to change the assistant's instructions. Ask about the platform's resources instead.")
		return
	}

	// Generate session ID if not provided
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = uuid.New().String()
	}

	// Default language to auto-detect
	language := req.Language
	if language == "" {
		language = "auto"
	}

	startTime := time.Now()

	// Get user role for access control
	roleTier, _ := authpkg.GetRoleTier(r)

	// FR-AI-008: multi-turn context — up to the 10 most recent exchanges
	// in this session are forwarded to the RAG service.
	history := h.recentHistory(r.Context(), sessionID, userID, 10)

	// SDD §3.2 / R-03: cache AI responses for 5 minutes so repeated
	// identical queries skip the LLM call entirely. Only context-free
	// (no-history) queries are cacheable — a follow-up depends on the
	// conversation so far.
	cacheKey := ""
	var ragResp *ragQueryResponse
	var err error
	if len(history) == 0 {
		sum := sha256.Sum256([]byte(req.Query + "|" + roleTier + "|" + language))
		cacheKey = "ai_cache:" + hex.EncodeToString(sum[:])
		if h.redis != nil {
			if cached, cerr := h.redis.Get(r.Context(), cacheKey).Result(); cerr == nil {
				var cr ragQueryResponse
				if json.Unmarshal([]byte(cached), &cr) == nil {
					ragResp = &cr
					aiCacheHits.Inc()
				}
			}
		}
	}

	if ragResp == nil {
		ragResp, err = h.callRAGService(r.Context(), req.Query, roleTier, language, sessionID, req.RewriteQuery, history)
		if err != nil {
			log.Printf("RAG service call failed: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to process query")
			return
		}
		if cacheKey != "" && h.redis != nil {
			if blob, merr := json.Marshal(ragResp); merr == nil {
				h.redis.Set(r.Context(), cacheKey, blob, 5*time.Minute)
			}
		}
	}

	// Convert RAG citations to our Citation format with titles
	citations := make([]Citation, 0, len(ragResp.Citations))
	for _, cit := range ragResp.Citations {
		citation := Citation{
			ItemID:    cit["item_id"],
			ChunkText: cit["chunk_text"],
		}
		// Fetch title from database
		if title, err := h.getItemTitle(r.Context(), citation.ItemID); err == nil {
			citation.Title = title
		}
		citations = append(citations, citation)
	}

	elapsed := time.Since(startTime)

	// Store chat message for history
	messageID, err := h.storeChatMessage(r.Context(), sessionID, userID, req.Query,
		ragResp.Response, ragResp.SourceDocIDs, ragResp.ModelUsed, int(elapsed.Milliseconds()))
	if err != nil {
		log.Printf("Failed to store chat message: %v", err)
		// Don't fail the request, just log it
	}

	// FR-AI-015: response time and per-model usage are exported to Prometheus.
	observeQuery(ragResp.ModelUsed, elapsed)

	writeJSON(w, http.StatusOK, ChatResponse{
		Response:         ragResp.Response,
		Sources:          citations,
		ModelUsed:        ragResp.ModelUsed,
		ResponseTime:     elapsed.String(),
		SessionID:        sessionID,
		MessageID:        messageID,
		DetectedLanguage: ragResp.DetectedLanguage,
		QueryRewritten:   ragResp.QueryRewritten,
	})
}

// POST /api/v1/ai/chat/stream
// Server-Sent Events proxy: forwards the RAG service's token stream straight to
// the browser (so the answer types out live), while accumulating the full text
// to persist once the stream completes. Falls back to nothing special — if the
// RAG stream can't be opened, returns an error and the client retries the
// non-streaming /ai/chat endpoint.
func (h *Handler) ChatStream(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Query == "" {
		writeError(w, http.StatusBadRequest, "query is required")
		return
	}

	// FR-AI-018 / SDD §6.4: reject obvious instruction-override attempts before
	// they reach the LLM. Defence in depth — the grounded prompt is the real
	// mitigation, but there is no reason to spend a Groq call on a jailbreak.
	if detectPromptInjection(req.Query) {
		aiBlockedQueries.Inc()
		writeError(w, http.StatusBadRequest,
			"This request looks like an attempt to change the assistant's instructions. Ask about the platform's resources instead.")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = uuid.New().String()
	}
	language := req.Language
	if language == "" {
		language = "auto"
	}
	roleTier, _ := authpkg.GetRoleTier(r)
	history := h.recentHistory(r.Context(), sessionID, userID, 10)
	startTime := time.Now()

	// Open the RAG stream.
	ragReq := ragQueryRequest{
		Query:        req.Query,
		UserRole:     roleTier,
		Language:     language,
		SessionID:    sessionID,
		RewriteQuery: req.RewriteQuery,
		History:      history,
	}
	body, _ := json.Marshal(ragReq)
	upstreamReq, err := http.NewRequestWithContext(r.Context(), "POST", h.ragURL+"/query/stream", bytes.NewReader(body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build stream request")
		return
	}
	upstreamReq.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(upstreamReq)
	if err != nil {
		log.Printf("RAG stream call failed: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to open stream")
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("RAG stream returned %d: %s", resp.StatusCode, string(b))
		writeError(w, http.StatusInternalServerError, "stream unavailable")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // stop nginx from buffering the stream
	w.WriteHeader(http.StatusOK)

	// Tell the client its session id up front.
	fmt.Fprintf(w, "event: session\ndata: {\"session_id\":%q}\n\n", sessionID)
	flusher.Flush()

	// Forward every SSE line verbatim while parsing tokens/meta for persistence.
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	var curEvent string
	var full strings.Builder
	var sourceIDs []string
	var modelUsed string
	for scanner.Scan() {
		line := scanner.Text()
		fmt.Fprintf(w, "%s\n", line)
		if line == "" {
			curEvent = ""
			flusher.Flush()
			continue
		}
		switch {
		case strings.HasPrefix(line, "event:"):
			curEvent = strings.TrimSpace(line[len("event:"):])
		case strings.HasPrefix(line, "data:"):
			data := strings.TrimSpace(line[len("data:"):])
			switch curEvent {
			case "meta":
				var m struct {
					SourceDocIDs []string `json:"source_doc_ids"`
					ModelUsed    string   `json:"model_used"`
				}
				if json.Unmarshal([]byte(data), &m) == nil {
					sourceIDs = m.SourceDocIDs
					modelUsed = m.ModelUsed
				}
			case "token":
				var tk struct {
					Text string `json:"text"`
				}
				if json.Unmarshal([]byte(data), &tk) == nil {
					full.WriteString(tk.Text)
				}
			}
		}
		flusher.Flush()
	}

	// Persist the assembled exchange (best-effort — never fail the request).
	if answer := full.String(); answer != "" {
		elapsed := time.Since(startTime)
		messageID, err := h.storeChatMessage(r.Context(), sessionID, userID, req.Query,
			answer, sourceIDs, modelUsed, int(elapsed.Milliseconds()))
		if err != nil {
			log.Printf("Failed to store streamed chat message: %v", err)
		}
		observeQuery(modelUsed, elapsed)
		// Trailing event so the widget knows which row to attach a rating to
		// (FR-AI-016). Sent after `done`; clients that ignore it are unaffected.
		if messageID != "" {
			fmt.Fprintf(w, "event: stored\ndata: {\"message_id\":%q}\n\n", messageID)
			flusher.Flush()
		}
	}
}

// GET /api/v1/ai/chat/history/{sessionId}
func (h *Handler) GetChatHistory(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	sessionID := chi.URLParam(r, "sessionId")
	if sessionID == "" {
		writeError(w, http.StatusBadRequest, "session_id is required")
		return
	}

	// Retrieve chat history
	messages, err := h.getChatHistory(r.Context(), sessionID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to retrieve chat history")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id": sessionID,
		"messages":   messages,
	})
}

// POST /api/v1/ai/summarize
func (h *Handler) Summarize(w http.ResponseWriter, r *http.Request) {
	_, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		ItemID   string `json:"item_id"`
		Language string `json:"language,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.ItemID == "" {
		writeError(w, http.StatusBadRequest, "item_id is required")
		return
	}

	// Default language
	language := req.Language
	if language == "" {
		language = "auto"
	}

	// Get user role for access control
	roleTier, _ := authpkg.GetRoleTier(r)

	// FR-AI-003 requires a 100-300 word summary carrying at least 3 key points,
	// so summarisation runs through the structured insights path rather than a
	// free-form RAG question. `key_points` is additive — existing callers that
	// only read `summary` are unaffected.
	result, status, err := h.itemInsights(r.Context(), req.ItemID, "summary", language, roleTier)
	if err != nil {
		if status >= 500 {
			log.Printf("Summarization failed for %s: %v", req.ItemID, err)
		}
		writeError(w, status, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"item_id":    req.ItemID,
		"summary":    result.Summary,
		"key_points": result.KeyPoints,
		"word_count": result.WordCount,
		"model_used": result.ModelUsed,
		"cached":     result.Cached,
	})
}

// callRAGService makes HTTP request to RAG service /query endpoint
func (h *Handler) callRAGService(ctx context.Context, query, userRole, language, sessionID string, rewriteQuery bool, history []historyTurn) (*ragQueryResponse, error) {
	// Prepare request
	ragReq := ragQueryRequest{
		Query:        query,
		UserRole:     userRole,
		Language:     language,
		SessionID:    sessionID,
		RewriteQuery: rewriteQuery,
		History:      history,
	}

	reqBody, err := json.Marshal(ragReq)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	// Make HTTP request
	url := fmt.Sprintf("%s/query", h.ragURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call RAG service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("RAG service returned status %d: %s", resp.StatusCode, string(body))
	}

	// Parse response
	var ragResp ragQueryResponse
	if err := json.NewDecoder(resp.Body).Decode(&ragResp); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &ragResp, nil
}

// getItemTitle fetches the title of a media item
func (h *Handler) getItemTitle(ctx context.Context, itemID string) (string, error) {
	var title string
	err := h.db.QueryRow(ctx,
		`SELECT title FROM media_items WHERE item_id = $1`,
		itemID,
	).Scan(&title)
	if err != nil {
		return "", err
	}
	return title, nil
}

// recentHistory returns up to `limit` prior exchanges for a session, oldest
// first, for multi-turn context (FR-AI-008).
func (h *Handler) recentHistory(ctx context.Context, sessionID, userID string, limit int) []historyTurn {
	rows, err := h.db.Query(ctx,
		`SELECT query, response FROM (
		     SELECT query, response, created_at
		     FROM ai_chat_messages
		     WHERE session_id = $1 AND user_id = $2
		     ORDER BY created_at DESC
		     LIMIT $3
		 ) recent ORDER BY created_at ASC`,
		sessionID, userID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var turns []historyTurn
	for rows.Next() {
		var t historyTurn
		if err := rows.Scan(&t.Query, &t.Response); err == nil {
			turns = append(turns, t)
		}
	}
	return turns
}

// realDocIDs keeps only genuine media_items UUIDs.
//
// The retriever answers inventory questions ("how many books are in the
// catalog?") with a synthesised chunk whose item_id is a label like
// "inventory-catalog" rather than a row id. Passing that straight into the
// UUID[] column fails the whole INSERT, which silently dropped every
// inventory-backed answer from the history and the metrics. The citation still
// reaches the client — only the stored provenance list is filtered.
func realDocIDs(ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if _, err := uuid.Parse(id); err == nil {
			out = append(out, id)
		}
	}
	return out
}

// storeChatMessage stores a chat interaction and returns its message_id, which
// the client needs in order to rate the answer later (FR-AI-016). latencyMS is
// the end-to-end time this answer took, kept for the AI metrics view
// (FR-AI-015).
func (h *Handler) storeChatMessage(ctx context.Context, sessionID, userID, query, response string, sourceDocIDs []string, modelUsed string, latencyMS int) (string, error) {
	var messageID string
	err := h.db.QueryRow(ctx,
		`INSERT INTO ai_chat_messages (session_id, user_id, query, response, source_doc_ids, model_used, latency_ms, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
		 RETURNING message_id::text`,
		sessionID, userID, query, response, realDocIDs(sourceDocIDs), modelUsed, latencyMS,
	).Scan(&messageID)
	return messageID, err
}

// getChatHistory retrieves chat history for a session
func (h *Handler) getChatHistory(ctx context.Context, sessionID, userID string) ([]map[string]any, error) {
	rows, err := h.db.Query(ctx,
		`SELECT query, response, source_doc_ids, model_used, created_at
		 FROM ai_chat_messages
		 WHERE session_id = $1 AND user_id = $2
		 ORDER BY created_at ASC`,
		sessionID, userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []map[string]any
	for rows.Next() {
		var query, response, modelUsed string
		var createdAt time.Time
		var sourceIDs []string
		err := rows.Scan(&query, &response, &sourceIDs, &modelUsed, &createdAt)
		if err != nil {
			continue
		}

		messages = append(messages, map[string]any{
			"query":      query,
			"response":   response,
			"source_ids": sourceIDs,
			"model_used": modelUsed,
			"timestamp":  createdAt.Format(time.RFC3339),
		})
	}

	return messages, nil
}
