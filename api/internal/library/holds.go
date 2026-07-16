package library

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// ──────────────────────────────────────────────────────────────────────────────
// Hold / reservation system (SDD §4.1 holds table, Flow 3 "Hold request offered")
// ──────────────────────────────────────────────────────────────────────────────

type holdResponse struct {
	HoldID    string  `json:"hold_id"`
	CatalogID string  `json:"catalog_id"`
	Title     string  `json:"title"`
	Author    string  `json:"author"`
	PlacedAt  string  `json:"placed_at"`
	ExpiresAt *string `json:"expires_at"`
	Status    string  `json:"status"`
	Position  int     `json:"queue_position"`
}

// POST /api/v1/library/holds  {catalog_id}
// Place a hold on an item that currently has no available copies.
func (h *Handler) PlaceHold(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier == "librarian" {
		writeError(w, http.StatusForbidden, "librarians cannot place holds")
		return
	}

	var req struct {
		CatalogID string `json:"catalog_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CatalogID == "" {
		writeError(w, http.StatusBadRequest, "catalog_id is required")
		return
	}

	var available int
	var title string
	if err := h.db.QueryRow(r.Context(),
		`SELECT available_copies, title FROM library_catalog WHERE catalog_id = $1`,
		req.CatalogID,
	).Scan(&available, &title); err != nil {
		writeError(w, http.StatusNotFound, "catalog item not found")
		return
	}
	if available > 0 {
		writeError(w, http.StatusConflict, "copies are available — borrow the item instead of placing a hold")
		return
	}

	// No duplicate active hold; no hold while already borrowing the same item.
	var exists bool
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS (
			SELECT 1 FROM holds
			WHERE user_id = $1 AND catalog_id = $2 AND status = 'active'
		 )`, userID, req.CatalogID).Scan(&exists)
	if exists {
		writeError(w, http.StatusConflict, "you already have an active hold on this item")
		return
	}
	_ = h.db.QueryRow(r.Context(),
		`SELECT EXISTS (
			SELECT 1 FROM loans
			WHERE user_id = $1 AND catalog_id = $2 AND return_date IS NULL
		 )`, userID, req.CatalogID).Scan(&exists)
	if exists {
		writeError(w, http.StatusConflict, "you currently have this item on loan")
		return
	}

	var holdID, placedAt string
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO holds (user_id, catalog_id, expires_at)
		 VALUES ($1, $2, now() + interval '7 days')
		 RETURNING hold_id, to_char(placed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		userID, req.CatalogID,
	).Scan(&holdID, &placedAt)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not place hold")
		return
	}

	var position int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM holds
		 WHERE catalog_id = $1 AND status = 'active' AND placed_at <= now()`,
		req.CatalogID).Scan(&position)

	writeJSON(w, http.StatusCreated, map[string]any{
		"message":        "hold placed — you will be notified when a copy becomes available",
		"hold_id":        holdID,
		"catalog_id":     req.CatalogID,
		"title":          title,
		"placed_at":      placedAt,
		"queue_position": position,
	})
}

// GET /api/v1/library/holds — the caller's holds with queue positions.
func (h *Handler) ListMyHolds(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT h.hold_id, h.catalog_id, c.title, c.author,
		        to_char(h.placed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(h.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        h.status,
		        CASE WHEN h.status = 'active' THEN (
		            SELECT COUNT(*) FROM holds q
		            WHERE q.catalog_id = h.catalog_id AND q.status = 'active'
		              AND q.placed_at <= h.placed_at
		        ) ELSE 0 END
		 FROM holds h
		 JOIN library_catalog c ON c.catalog_id = h.catalog_id
		 WHERE h.user_id = $1
		 ORDER BY h.placed_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list holds")
		return
	}
	defer rows.Close()

	holds := []holdResponse{}
	for rows.Next() {
		var hr holdResponse
		if err := rows.Scan(&hr.HoldID, &hr.CatalogID, &hr.Title, &hr.Author,
			&hr.PlacedAt, &hr.ExpiresAt, &hr.Status, &hr.Position); err == nil {
			holds = append(holds, hr)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"holds": holds})
}

// DELETE /api/v1/library/holds/{holdId} — cancel own active hold.
func (h *Handler) CancelHold(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	holdID := strings.TrimSpace(chi.URLParam(r, "holdId"))

	tag, err := h.db.Exec(r.Context(),
		`UPDATE holds SET status = 'cancelled'
		 WHERE hold_id = $1 AND user_id = $2 AND status = 'active'`,
		holdID, userID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "active hold not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "hold cancelled"})
}

// GET /api/v1/library/holds/all — librarian/admin queue view.
func (h *Handler) ListAllHolds(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT h.hold_id, h.catalog_id, c.title, c.author,
		        to_char(h.placed_at,  'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(h.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        h.status, u.name, u.email
		 FROM holds h
		 JOIN library_catalog c ON c.catalog_id = h.catalog_id
		 JOIN users u          ON u.user_id    = h.user_id
		 WHERE h.status = 'active'
		 ORDER BY h.placed_at ASC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not list holds")
		return
	}
	defer rows.Close()

	type row struct {
		holdResponse
		UserName  string `json:"user_name"`
		UserEmail string `json:"user_email"`
	}
	holds := []row{}
	for rows.Next() {
		var hr row
		if err := rows.Scan(&hr.HoldID, &hr.CatalogID, &hr.Title, &hr.Author,
			&hr.PlacedAt, &hr.ExpiresAt, &hr.Status, &hr.UserName, &hr.UserEmail); err == nil {
			holds = append(holds, hr)
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"holds": holds})
}

// fulfillOldestHold marks the oldest active hold on an item as fulfilled.
// Called when a copy is returned. Returns the fulfilled user's id ("" if none).
func (h *Handler) fulfillOldestHold(r *http.Request, catalogID string) string {
	var userID string
	if err := h.db.QueryRow(r.Context(),
		`UPDATE holds SET status = 'fulfilled'
		 WHERE hold_id = (
		     SELECT hold_id FROM holds
		     WHERE catalog_id = $1 AND status = 'active'
		     ORDER BY placed_at ASC LIMIT 1
		 )
		 RETURNING user_id`, catalogID,
	).Scan(&userID); err != nil {
		return ""
	}
	return userID
}
