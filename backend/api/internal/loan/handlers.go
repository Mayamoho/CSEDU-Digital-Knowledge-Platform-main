package loan

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/storage"
)

type Handler struct {
	db    *pgxpool.Pool
	minio *storage.MinioClient
}

func NewHandler(db *pgxpool.Pool, minio *storage.MinioClient) *Handler {
	return &Handler{db: db, minio: minio}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

type loanRequest struct {
	CatalogID string `json:"catalog_id"`
}

type loanResponse struct {
	LoanID       string  `json:"loan_id"`
	UserID       string  `json:"user_id"`
	CatalogID    string  `json:"catalog_id"`
	CheckoutDate string  `json:"checkout_date"`
	DueDate      string  `json:"due_date"`
	ReturnDate   *string `json:"return_date"`
	Status       string  `json:"status"`
	Title        string  `json:"title"`
	Author       string  `json:"author"`
	ISBN         string  `json:"isbn"`
}

// POST /api/v1/loans/checkout
func (h *Handler) Checkout(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req loanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.CatalogID == "" {
		writeError(w, http.StatusBadRequest, "catalog_id is required")
		return
	}

	// Check if user already has active loans
	var activeLoans int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM loans WHERE user_id = $1 AND return_date IS NULL`,
		userID,
	).Scan(&activeLoans)

	if activeLoans > 0 {
		writeError(w, http.StatusBadRequest, "user already has active loans")
		return
	}

	// Check if book is available
	var availableCopies int
	var title, author, isbn string
	err := h.db.QueryRow(r.Context(),
		`SELECT available_copies, title, author, isbn 
		 FROM library_catalog 
		 WHERE catalog_id = $1`,
		req.CatalogID,
	).Scan(&availableCopies, &title, &author, &isbn)

	if err != nil {
		writeError(w, http.StatusNotFound, "book not found")
		return
	}

	if availableCopies <= 0 {
		writeError(w, http.StatusBadRequest, "book is not available")
		return
	}

	// Create loan record
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var loanID string
	dueDate := time.Now().AddDate(0, 0, 14) // 14 days loan period

	if err := tx.QueryRow(r.Context(),
		`INSERT INTO loans (user_id, catalog_id, checkout_date, due_date, status)
		 VALUES ($1, $2, NOW(), $3, 'active')
		 RETURNING loan_id, to_char(checkout_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 
		          to_char(due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		userID, req.CatalogID, dueDate,
	).Scan(&loanID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create loan")
		return
	}

	// Update available copies
	if _, err := tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies - 1 WHERE catalog_id = $1`,
		req.CatalogID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update book availability")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusCreated, loanResponse{
		LoanID:       loanID,
		UserID:       userID,
		CatalogID:    req.CatalogID,
		CheckoutDate: time.Now().Format(time.RFC3339),
		DueDate:      dueDate.Format(time.RFC3339),
		ReturnDate:   nil,
		Status:       "active",
		Title:        title,
		Author:       author,
		ISBN:         isbn,
	})
}

// POST /api/v1/loans/{loanId}/return
func (h *Handler) Return(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	loanID := chi.URLParam(r, "loanId")
	if loanID == "" {
		writeError(w, http.StatusBadRequest, "loan_id is required")
		return
	}

	// Verify loan belongs to user
	var catalogID string
	var dueDate time.Time
	err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id, due_date FROM loans WHERE loan_id = $1 AND user_id = $2 AND return_date IS NULL`,
		loanID, userID,
	).Scan(&catalogID, &dueDate)

	if err != nil {
		writeError(w, http.StatusNotFound, "loan not found")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Update loan record
	if _, err := tx.Exec(r.Context(),
		`UPDATE loans SET return_date = NOW(), status = 'returned' WHERE loan_id = $1`,
		loanID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update loan")
		return
	}

	// Update available copies
	if _, err := tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies + 1 WHERE catalog_id = $1`,
		catalogID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update book availability")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "book returned successfully",
		"loan_id": loanID,
	})
}

// GET /api/v1/loans/my-loans
func (h *Handler) GetMyLoans(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 10
	}
	offset := (page - 1) * perPage

	rows, err := h.db.Query(r.Context(),
		`SELECT l.loan_id, l.checkout_date, l.due_date, l.return_date, l.status,
		        lc.title, lc.author, lc.isbn, lc.format
		 FROM loans l
		 JOIN library_catalog lc ON l.catalog_id = lc.catalog_id
		 WHERE l.user_id = $1
		 ORDER BY l.checkout_date DESC
		 LIMIT $2 OFFSET $3`,
		userID, perPage, offset,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	loans := []loanResponse{}
	for rows.Next() {
		var loan loanResponse
		var returnDate *string
		err := rows.Scan(&loan.LoanID, &loan.CheckoutDate, &loan.DueDate, &returnDate, &loan.Status,
			&loan.Title, &loan.Author, &loan.ISBN, nil)
		if err != nil {
			continue
		}
		loan.ReturnDate = returnDate
		loans = append(loans, loan)
	}

	// Get total count
	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM loans WHERE user_id = $1`,
		userID,
	).Scan(&total)

	totalPages := (total + perPage - 1) / perPage

	writeJSON(w, http.StatusOK, map[string]any{
		"data":        loans,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": totalPages,
	})
}
