package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// FR-AI-003 / FR-AI-009 / FR-AI-010 — structured extraction over one item.
//
// The RAG service does the language work and returns a fixed schema; this
// handler owns access control (FR-AI-007: a user must be allowed to open the
// item before the assistant will analyse it for them) and caching, since these
// calls hit the expensive 120B tier and an item's content rarely changes.

type insightsResult struct {
	ItemID   string `json:"item_id"`
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	ItemType string `json:"item_type"`

	Summary   string   `json:"summary"`
	WordCount int      `json:"word_count"`
	KeyPoints []string `json:"key_points"`

	// research
	KeyFindings []string `json:"key_findings,omitempty"`
	Methodology string   `json:"methodology,omitempty"`
	Conclusion  string   `json:"conclusion,omitempty"`

	// project
	Technologies []string `json:"technologies,omitempty"`
	Skills       []string `json:"skills,omitempty"`
	Outcome      string   `json:"outcome,omitempty"`

	ModelUsed string `json:"model_used"`
	Cached    bool   `json:"cached,omitempty"`
}

// canReadItem enforces the same access-tier rules as GET /media/{itemId}.
func (h *Handler) canReadItem(ctx context.Context, itemID, roleTier string) (accessTier string, ok bool, found bool) {
	if err := h.db.QueryRow(ctx,
		`SELECT access_tier::text FROM media_items WHERE item_id = $1`, itemID,
	).Scan(&accessTier); err != nil {
		return "", false, false
	}
	switch accessTier {
	case "student":
		return accessTier, roleTier != "" && roleTier != "public", true
	case "researcher":
		return accessTier, roleTier == "researcher" || roleTier == "librarian" || roleTier == "administrator", true
	case "librarian":
		return accessTier, roleTier == "librarian" || roleTier == "administrator", true
	case "restricted":
		return accessTier, roleTier == "administrator", true
	}
	return accessTier, true, true
}

// POST /api/v1/ai/insights  {"item_id": "...", "kind": "auto|summary|research|project"}
func (h *Handler) Insights(w http.ResponseWriter, r *http.Request) {
	if _, ok := authpkg.GetUserID(r); !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		ItemID   string `json:"item_id"`
		Kind     string `json:"kind,omitempty"`
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

	roleTier, _ := authpkg.GetRoleTier(r)
	result, status, err := h.itemInsights(r.Context(), req.ItemID, req.Kind, req.Language, roleTier)
	if err != nil {
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// itemInsights resolves access, serves from cache when possible, and otherwise
// calls the RAG service. Returns the HTTP status to use on error.
func (h *Handler) itemInsights(ctx context.Context, itemID, kind, language, roleTier string) (*insightsResult, int, error) {
	if kind == "" {
		kind = "auto"
	}
	if language == "" {
		language = "auto"
	}

	_, allowed, found := h.canReadItem(ctx, itemID, roleTier)
	if !found {
		return nil, http.StatusNotFound, fmt.Errorf("document not found")
	}
	if !allowed {
		return nil, http.StatusForbidden, fmt.Errorf("you do not have access to this document")
	}

	// Insights are deterministic per (item, kind, language) until the document
	// itself changes, so a long cache is safe and keeps the 120B tier calls
	// well inside the free-tier budget.
	cacheKey := fmt.Sprintf("ai_insights:%s:%s:%s", itemID, kind, language)
	if h.redis != nil {
		if cached, err := h.redis.Get(ctx, cacheKey).Result(); err == nil {
			var out insightsResult
			if json.Unmarshal([]byte(cached), &out) == nil {
				out.Cached = true
				return &out, http.StatusOK, nil
			}
		}
	}

	body, _ := json.Marshal(map[string]string{
		"item_id": itemID, "kind": kind, "language": language,
	})
	httpReq, err := http.NewRequestWithContext(ctx, "POST", h.ragURL+"/insights", bytes.NewReader(body))
	if err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to build request")
	}
	httpReq.Header.Set("Content-Type", "application/json")

	start := time.Now()
	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		log.Printf("RAG insights call failed: %v", err)
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to generate insights")
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, http.StatusNotFound, fmt.Errorf("this document has not been indexed yet — try again in a moment")
	}
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		log.Printf("RAG insights returned %d: %s", resp.StatusCode, string(raw))
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to generate insights")
	}

	var out insightsResult
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, http.StatusInternalServerError, fmt.Errorf("failed to decode insights")
	}

	observeQuery(out.ModelUsed, time.Since(start))

	if h.redis != nil {
		if blob, merr := json.Marshal(out); merr == nil {
			h.redis.Set(ctx, cacheKey, blob, 24*time.Hour)
		}
	}
	return &out, http.StatusOK, nil
}
