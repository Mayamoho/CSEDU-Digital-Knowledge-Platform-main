package ai

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// FR-AI-016 (User Feedback): "users can rate" an AI answer.
//
// A rating is stored on the ai_chat_messages row it belongs to, so the feedback
// always travels with the exact query/answer/model it refers to. Users may only
// rate their own messages, and re-rating overwrites — a rating is an opinion,
// not an append-only log.

// POST /api/v1/ai/feedback
func (h *Handler) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		MessageID string `json:"message_id"`
		Rating    int    `json:"rating"` // 1 = helpful, -1 = unhelpful
		Note      string `json:"note,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MessageID == "" {
		writeError(w, http.StatusBadRequest, "message_id is required")
		return
	}
	if req.Rating != 1 && req.Rating != -1 {
		writeError(w, http.StatusBadRequest, "rating must be 1 (helpful) or -1 (unhelpful)")
		return
	}

	note := strings.TrimSpace(req.Note)
	if len(note) > 1000 {
		note = note[:1000]
	}
	var notePtr *string
	if note != "" {
		notePtr = &note
	}

	ct, err := h.db.Exec(r.Context(),
		`UPDATE ai_chat_messages
		    SET rating = $1, feedback_note = COALESCE($2, feedback_note)
		  WHERE message_id = $3 AND user_id = $4`,
		req.Rating, notePtr, req.MessageID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not save feedback")
		return
	}
	if ct.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "message not found")
		return
	}

	aiFeedback.WithLabelValues(strconv.Itoa(req.Rating)).Inc()

	writeJSON(w, http.StatusOK, map[string]any{
		"message":    "feedback recorded",
		"message_id": req.MessageID,
		"rating":     req.Rating,
	})
}
