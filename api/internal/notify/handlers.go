package notify

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

type Handler struct{ db *pgxpool.Pool }

func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

// GET /api/v1/notifications — current user's notifications (newest first) plus
// the unread count.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT notification_id, title, body, COALESCE(link, ''), read,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM notifications
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT 50`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type item struct {
		NotificationID string `json:"notification_id"`
		Title          string `json:"title"`
		Body           string `json:"body"`
		Link           string `json:"link"`
		Read           bool   `json:"read"`
		CreatedAt      string `json:"created_at"`
	}
	items := []item{}
	unread := 0
	for rows.Next() {
		var n item
		if err := rows.Scan(&n.NotificationID, &n.Title, &n.Body, &n.Link, &n.Read, &n.CreatedAt); err != nil {
			continue
		}
		if !n.Read {
			unread++
		}
		items = append(items, n)
	}

	writeJSON(w, http.StatusOK, map[string]any{"data": items, "unread": unread})
}

// POST /api/v1/notifications/{id}/read — mark one notification read.
func (h *Handler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	id := chi.URLParam(r, "id")
	_, _ = h.db.Exec(r.Context(),
		`UPDATE notifications SET read = true WHERE notification_id = $1 AND user_id = $2`,
		id, userID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
}

// POST /api/v1/notifications/read-all — mark all of the user's notifications read.
func (h *Handler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_, _ = h.db.Exec(r.Context(),
		`UPDATE notifications SET read = true WHERE user_id = $1 AND read = false`,
		userID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "ok"})
}
