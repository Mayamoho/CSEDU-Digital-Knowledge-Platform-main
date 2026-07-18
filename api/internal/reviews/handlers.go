package reviews

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/notify"
)

type Handler struct {
	db *pgxpool.Pool
}

func NewHandler(db *pgxpool.Pool) *Handler {
	return &Handler{db: db}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

type Review struct {
	ReviewID  string `json:"review_id"`
	ItemID    string `json:"item_id"`
	UserID    string `json:"user_id"`
	UserName  string `json:"user_name"`
	Rating    int    `json:"rating"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

// GET /api/v1/reviews/{itemId}
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		writeError(w, http.StatusBadRequest, "item id required")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT rv.review_id, rv.item_id, rv.user_id, COALESCE(u.name, 'User'),
		        rv.rating, rv.body, to_char(rv.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM resource_reviews rv
		 LEFT JOIN users u ON u.user_id = rv.user_id
		 WHERE rv.item_id = $1
		 ORDER BY rv.created_at DESC`, itemID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load reviews")
		return
	}
	defer rows.Close()

	reviews := make([]Review, 0)
	sum := 0
	for rows.Next() {
		var rv Review
		if err := rows.Scan(&rv.ReviewID, &rv.ItemID, &rv.UserID, &rv.UserName, &rv.Rating, &rv.Body, &rv.CreatedAt); err != nil {
			continue
		}
		sum += rv.Rating
		reviews = append(reviews, rv)
	}

	var average float64
	if len(reviews) > 0 {
		average = float64(sum) / float64(len(reviews))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"reviews": reviews,
		"average": average,
		"count":   len(reviews),
	})
}

// POST /api/v1/reviews/{itemId}  { rating, body }  — upsert (one review per user).
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	itemID := chi.URLParam(r, "itemId")
	if itemID == "" {
		writeError(w, http.StatusBadRequest, "item id required")
		return
	}

	var req struct {
		Rating int    `json:"rating"`
		Body   string `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be 1-5")
		return
	}

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO resource_reviews (item_id, user_id, rating, body)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (item_id, user_id)
		 DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()`,
		itemID, userID, req.Rating, strings.TrimSpace(req.Body))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save review")
		return
	}

	// Notify the item's owner that their resource was reviewed.
	var owner, title string
	_ = h.db.QueryRow(r.Context(),
		`SELECT created_by, COALESCE(title, 'your item') FROM media_items WHERE item_id = $1`, itemID,
	).Scan(&owner, &title)
	if owner != "" && owner != userID {
		notify.Push(r.Context(), h.db, owner, "New review",
			"Someone reviewed \""+title+"\".", "/archive/"+itemID)
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "review saved"})
}
