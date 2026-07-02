package library

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

type HoldHandler struct {
	db *pgxpool.Pool
}

func NewHoldHandler(db *pgxpool.Pool) *HoldHandler {
	return &HoldHandler{db: db}
}

func holdWriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func holdWriteError(w http.ResponseWriter, status int, msg string) {
	holdWriteJSON(w, status, map[string]string{"message": msg})
}

type holdItemResponse struct {
	HoldID    string  `json:"hold_id"`
	CatalogID string  `json:"catalog_id"`
	Title     string  `json:"title"`
	PlacedAt  string  `json:"placed_at"`
	ExpiresAt *string `json:"expires_at"`
	Status    string  `json:"status"`
}

// PlaceHold handles POST /library/holds
func (h *HoldHandler) PlaceHold(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authpkg.UserIDKey).(string)

	var req struct {
		CatalogID string `json:"catalog_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		holdWriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CatalogID == "" {
		holdWriteError(w, http.StatusBadRequest, "catalog_id is required")
		return
	}

	// Check catalog item exists
	var availableCopies int
	var title string
	err := h.db.QueryRow(r.Context(),
		`SELECT title, available_copies FROM library_catalog WHERE catalog_id = $1`,
		req.CatalogID).Scan(&title, &availableCopies)
	if err != nil {
		holdWriteError(w, http.StatusNotFound, "catalog item not found")
		return
	}

	// Cannot place hold on an available item — just borrow it
	if availableCopies > 0 {
		holdWriteError(w, http.StatusBadRequest, "item is currently available, please borrow it directly")
		return
	}

	// Check if user already has an active hold on this item
	var existingHold int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM holds WHERE user_id = $1 AND catalog_id = $2 AND status = 'active'`,
		userID, req.CatalogID).Scan(&existingHold)
	if existingHold > 0 {
		holdWriteError(w, http.StatusConflict, "you already have an active hold on this item")
		return
	}

	holdID := uuid.New().String()
	expiresAt := time.Now().Add(30 * 24 * time.Hour) // 30 days to fulfill

	_, err = h.db.Exec(r.Context(),
		`INSERT INTO holds (hold_id, user_id, catalog_id, status, placed_at, expires_at)
		 VALUES ($1, $2, $3, 'active', now(), $4)`,
		holdID, userID, req.CatalogID, expiresAt)
	if err != nil {
		holdWriteError(w, http.StatusInternalServerError, "failed to place hold")
		return
	}

	holdWriteJSON(w, http.StatusCreated, map[string]string{
		"message": "hold placed successfully",
		"hold_id": holdID,
	})
}

// ListHolds handles GET /library/holds
func (h *HoldHandler) ListHolds(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(authpkg.UserIDKey).(string)

	page := 1
	perPage := 20
	offset := (page - 1) * perPage

	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM holds WHERE user_id = $1`, userID).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT h.hold_id, h.catalog_id, c.title, h.placed_at, h.expires_at, h.status
		 FROM holds h
		 JOIN library_catalog c ON h.catalog_id = c.catalog_id
		 WHERE h.user_id = $1
		 ORDER BY h.placed_at DESC
		 LIMIT $2 OFFSET $3`, userID, perPage, offset)
	if err != nil {
		holdWriteError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	var items []holdItemResponse
	for rows.Next() {
		var item holdItemResponse
		if err := rows.Scan(&item.HoldID, &item.CatalogID, &item.Title,
			&item.PlacedAt, &item.ExpiresAt, &item.Status); err != nil {
			continue
		}
		items = append(items, item)
	}

	holdWriteJSON(w, http.StatusOK, map[string]any{
		"data":        items,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
	})
}

// CancelHold handles DELETE /library/holds/{holdId}
func (h *HoldHandler) CancelHold(w http.ResponseWriter, r *http.Request) {
	holdID := chi.URLParam(r, "holdId")
	userID := r.Context().Value(authpkg.UserIDKey).(string)

	var status string
	err := h.db.QueryRow(r.Context(),
		`SELECT status FROM holds WHERE hold_id = $1 AND user_id = $2`,
		holdID, userID).Scan(&status)
	if err != nil {
		holdWriteError(w, http.StatusNotFound, "hold not found")
		return
	}

	if status != "active" {
		holdWriteError(w, http.StatusBadRequest, "only active holds can be cancelled")
		return
	}

	_, err = h.db.Exec(r.Context(),
		`UPDATE holds SET status = 'cancelled' WHERE hold_id = $1`, holdID)
	if err != nil {
		holdWriteError(w, http.StatusInternalServerError, "failed to cancel hold")
		return
	}

	holdWriteJSON(w, http.StatusOK, map[string]string{"message": "hold cancelled successfully"})
}
