package ai

import (
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

	// Store chat message for history
	if err := h.storeChatMessage(r.Context(), sessionID, userID, req.Query, ragResp.Response, ragResp.SourceDocIDs, ragResp.ModelUsed); err != nil {
		log.Printf("Failed to store chat message: %v", err)
		// Don't fail the request, just log it
	}

	responseTime := time.Since(startTime).String()

	writeJSON(w, http.StatusOK, ChatResponse{
		Response:         ragResp.Response,
		Sources:          citations,
		ModelUsed:        ragResp.ModelUsed,
		ResponseTime:     responseTime,
		SessionID:        sessionID,
		DetectedLanguage: ragResp.DetectedLanguage,
		QueryRewritten:   ragResp.QueryRewritten,
	})
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

	// Get document title
	title, err := h.getItemTitle(r.Context(), req.ItemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "document not found")
		return
	}

	// Create a summarization query
	summaryQuery := fmt.Sprintf("Please provide a comprehensive summary of the document titled '%s'", title)

	// Call RAG service with the item context
	ragResp, err := h.callRAGService(r.Context(), summaryQuery, roleTier, language, "", false, nil)
	if err != nil {
		log.Printf("RAG service call failed for summarization: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to generate summary")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"item_id":           req.ItemID,
		"summary":           ragResp.Response,
		"model_used":        ragResp.ModelUsed,
		"detected_language": ragResp.DetectedLanguage,
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

// storeChatMessage stores chat interaction in database
func (h *Handler) storeChatMessage(ctx context.Context, sessionID, userID, query, response string, sourceDocIDs []string, modelUsed string) error {
	_, err := h.db.Exec(ctx,
		`INSERT INTO ai_chat_messages (session_id, user_id, query, response, source_doc_ids, model_used, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		sessionID, userID, query, response, sourceDocIDs, modelUsed,
	)
	return err
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
