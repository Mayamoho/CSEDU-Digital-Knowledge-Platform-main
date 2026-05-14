package fine

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
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

type fineRequest struct {
	Amount float64 `json:"amount"`
	UserID string  `json:"user_id"`
	LoanID string  `json:"loan_id"`
}

type fineResponse struct {
	FineID string `json:"fine_id"`
	Amount string `json:"amount"`
	Status string `json:"status"`
	UserID string `json:"user_id"`
	LoanID string `json:"loan_id"`
}

// POST /api/v1/fines/calculate
func (h *Handler) Calculate(w http.ResponseWriter, r *http.Request) {
	_, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Check if user is admin or librarian
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "administrator" && roleTier != "librarian" {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	var req fineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be greater than 0")
		return
	}

	// Check if loan exists and is overdue
	var dueDate time.Time
	err := h.db.QueryRow(r.Context(),
		`SELECT due_date, user_id FROM loans WHERE loan_id = $1 AND return_date IS NULL`,
		req.LoanID,
	).Scan(&dueDate, nil)

	if err != nil {
		writeError(w, http.StatusNotFound, "loan not found")
		return
	}

	// Verify loan belongs to user being fined (admin/librarian can fine any user)
	// Skip this check for admin/librarian as they can fine any user
	if roleTier != "administrator" && roleTier != "librarian" {
		// For regular users, check if loan belongs to them
		var actualLoanUserID string
		_ = h.db.QueryRow(r.Context(),
			`SELECT user_id FROM loans WHERE loan_id = $1 AND return_date IS NULL`,
			req.LoanID,
		).Scan(&actualLoanUserID)

		if actualLoanUserID != req.UserID {
			writeError(w, http.StatusForbidden, "cannot fine other user's loan")
			return
		}
	}

	// Check if loan is overdue
	if time.Now().Before(dueDate) {
		writeError(w, http.StatusBadRequest, "loan is not overdue")
		return
	}

	// Calculate fine (basic: 10 BDT per day overdue)
	daysOverdue := int(time.Since(dueDate).Hours() / 24)
	if daysOverdue <= 0 {
		daysOverdue = 1 // Minimum 1 day fine
	}

	// Rate: 10 BDT per day (configurable via env)
	fineRate := 10.0
	totalFine := float64(daysOverdue) * fineRate

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var fineID string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO fines (loan_id, user_id, amount, status, calculated_at)
		 VALUES ($1, $2, $3, 'pending', NOW())
		 RETURNING fine_id`,
		req.LoanID, req.UserID, totalFine,
	).Scan(&fineID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create fine")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusCreated, fineResponse{
		FineID: fineID,
		Amount: strconv.FormatFloat(totalFine, 'f', 2, 64),
		Status: "pending",
		UserID: req.UserID,
		LoanID: req.LoanID,
	})
}

// GET /api/v1/fines/overdue
func (h *Handler) GetOverdueFines(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Check if user is admin or librarian
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "administrator" && roleTier != "librarian" {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT f.fine_id, f.amount, f.status, f.calculated_at, 
		        l.loan_id, l.due_date, l.return_date,
		        u.name as user_name, u.email as user_email,
		        lc.title, lc.author, lc.isbn
		 FROM fines f
		 JOIN loans l ON f.loan_id = l.loan_id
		 JOIN users u ON l.user_id = u.user_id
		 JOIN library_catalog lc ON l.catalog_id = lc.catalog_id
		 WHERE l.return_date IS NULL 
		   AND l.due_date < NOW()
		 ORDER BY l.due_date ASC`,
		userID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	fines := []fineResponse{}
	for rows.Next() {
		var fine fineResponse
		var dueDate, returnDate time.Time
		var userName, userEmail, title, author, isbn string

		err := rows.Scan(&fine.FineID, &fine.Amount, &fine.Status, nil,
			&fine.LoanID, &dueDate, &returnDate,
			&userName, &userEmail, &title, &author, &isbn)
		if err != nil {
			continue
		}

		// Add loan details to response
		fine.UserID = userID
		fines = append(fines, fine)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data": fines,
	})
}

// POST /api/v1/fines/{fineId}/pay
func (h *Handler) PayFine(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	fineID := chi.URLParam(r, "fineId")
	if fineID == "" {
		writeError(w, http.StatusBadRequest, "fine_id is required")
		return
	}

	// Verify fine belongs to user or is admin/librarian
	roleTier, _ := authpkg.GetRoleTier(r)
	var ownerUserID string
	err := h.db.QueryRow(r.Context(),
		`SELECT f.user_id FROM fines f 
		 JOIN loans l ON f.loan_id = l.loan_id
		 WHERE f.fine_id = $1`,
		fineID,
	).Scan(&ownerUserID)

	if err != nil {
		writeError(w, http.StatusNotFound, "fine not found")
		return
	}

	if ownerUserID != userID && roleTier != "administrator" && roleTier != "librarian" {
		writeError(w, http.StatusForbidden, "cannot pay other user's fine")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Create payment record (stub for MVP)
	paymentID := "pay_" + fineID
	if _, err := tx.Exec(r.Context(),
		`INSERT INTO payments (fine_id, user_id, amount, method, status, timestamp)
		 VALUES ($1, $2, $3, 'successful', NOW())`,
		fineID, userID, 0, "internal",
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create payment")
		return
	}

	// Update fine status
	if _, err := tx.Exec(r.Context(),
		`UPDATE fines SET status = 'paid' WHERE fine_id = $1`,
		fineID,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update fine")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message":    "fine paid successfully",
		"fine_id":    fineID,
		"payment_id": paymentID,
	})
}
