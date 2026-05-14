package library

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"

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

type catalogItem struct {
	ItemID          string  `json:"item_id"`
	Title           string  `json:"title"`
	Author          string  `json:"author"`
	ISBN            *string `json:"isbn"`
	Format          string  `json:"format"`
	Status          string  `json:"status"`
	Location        *string `json:"location"`
	CoverImage      *string `json:"cover_image"`
	Year            *int    `json:"year"`
	TotalCopies     int     `json:"total_copies"`
	AvailableCopies int     `json:"available_copies"`
}

type paginatedCatalog struct {
	Data       []catalogItem `json:"data"`
	Total      int           `json:"total"`
	Page       int           `json:"page"`
	PerPage    int           `json:"per_page"`
	TotalPages int           `json:"total_pages"`
}

// GET /api/v1/library/catalog
func (h *Handler) ListCatalog(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	format := r.URL.Query().Get("format")
	status := r.URL.Query().Get("status")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 12
	}
	offset := (page - 1) * perPage

	// Build dynamic WHERE
	args := []any{}
	where := []string{"1=1"}
	argIdx := 1

	if q != "" {
		where = append(where, `(
			to_tsvector('english', title) @@ plainto_tsquery('english', $`+strconv.Itoa(argIdx)+`)
			OR to_tsvector('english', author) @@ plainto_tsquery('english', $`+strconv.Itoa(argIdx)+`)
			OR isbn ILIKE '%' || $`+strconv.Itoa(argIdx)+` || '%'
		)`)
		args = append(args, q)
		argIdx++
	}
	if format != "" {
		where = append(where, `format = $`+strconv.Itoa(argIdx))
		args = append(args, format)
		argIdx++
	}

	// status is derived from available_copies
	switch status {
	case "available":
		where = append(where, `available_copies > 0`)
	case "borrowed":
		where = append(where, `available_copies = 0`)
	}

	whereClause := strings.Join(where, " AND ")

	// Count
	countArgs := make([]any, len(args))
	copy(countArgs, args)
	var total int
	err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM library_catalog WHERE `+whereClause, countArgs...).Scan(&total)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	// Data — append LIMIT/OFFSET
	args = append(args, perPage, offset)
	limitIdx := argIdx
	offsetIdx := argIdx + 1

	rows, err := h.db.Query(r.Context(),
		`SELECT catalog_id, title, author, isbn, format, available_copies,
		        total_copies, location, cover_image, year
		 FROM library_catalog
		 WHERE `+whereClause+`
		 ORDER BY title
		 LIMIT $`+strconv.Itoa(limitIdx)+` OFFSET $`+strconv.Itoa(offsetIdx),
		args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	items := []catalogItem{}
	for rows.Next() {
		var it catalogItem
		var availCopies, totalCopies int
		if err := rows.Scan(&it.ItemID, &it.Title, &it.Author, &it.ISBN,
			&it.Format, &availCopies, &totalCopies,
			&it.Location, &it.CoverImage, &it.Year); err != nil {
			continue
		}
		it.TotalCopies = totalCopies
		it.AvailableCopies = availCopies
		switch {
		case availCopies > 0:
			it.Status = "available"
		default:
			it.Status = "borrowed"
		}
		items = append(items, it)
	}

	writeJSON(w, http.StatusOK, paginatedCatalog{
		Data:       items,
		Total:      total,
		Page:       page,
		PerPage:    perPage,
		TotalPages: int(math.Ceil(float64(total) / float64(perPage))),
	})
}

// GET /api/v1/library/catalog/{itemId}
func (h *Handler) GetCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	var it catalogItem
	var availCopies, totalCopies int
	err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id, title, author, isbn, format, available_copies,
		        total_copies, location, cover_image, year
		 FROM library_catalog WHERE catalog_id = $1`, id,
	).Scan(&it.ItemID, &it.Title, &it.Author, &it.ISBN,
		&it.Format, &availCopies, &totalCopies,
		&it.Location, &it.CoverImage, &it.Year)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	it.TotalCopies = totalCopies
	it.AvailableCopies = availCopies
	if availCopies > 0 {
		it.Status = "available"
	} else {
		it.Status = "borrowed"
	}
	writeJSON(w, http.StatusOK, it)
}

// POST /api/v1/library/loans — borrow a book
func (h *Handler) BorrowBook(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Librarians cannot borrow books - they only monitor
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier == "librarian" {
		writeError(w, http.StatusForbidden, "librarians cannot borrow books")
		return
	}

	var req struct {
		CatalogID string `json:"catalog_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CatalogID == "" {
		writeError(w, http.StatusBadRequest, "catalog_id is required")
		return
	}

	// Check availability and borrow atomically
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var available int
	if err := tx.QueryRow(r.Context(),
		`SELECT available_copies FROM library_catalog WHERE catalog_id = $1 FOR UPDATE`,
		req.CatalogID,
	).Scan(&available); err != nil {
		writeError(w, http.StatusNotFound, "catalog item not found")
		return
	}
	if available <= 0 {
		writeError(w, http.StatusConflict, "no copies available")
		return
	}

	var loanID, dueDate string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO loans (user_id, catalog_id, due_date)
		 VALUES ($1, $2, now() + interval '14 days')
		 RETURNING loan_id, to_char(due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		userID, req.CatalogID,
	).Scan(&loanID, &dueDate); err != nil {
		if strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "already borrowed")
			return
		}
		writeError(w, http.StatusInternalServerError, fmt.Sprintf("could not create loan: %v", err))
		return
	}

	_, _ = tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies - 1
		 WHERE catalog_id = $1`, req.CatalogID)

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message":  "book borrowed successfully",
		"loan_id":  loanID,
		"due_date": dueDate,
	})
}

// GET /api/v1/library/loans — list user's loans
func (h *Handler) ListLoans(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT l.loan_id, c.title, 
		        to_char(l.checkout_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(l.due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(l.return_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        l.status
		 FROM loans l
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 WHERE l.user_id = $1
		 ORDER BY l.checkout_date DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type loanItem struct {
		LoanID       string  `json:"loan_id"`
		Title        string  `json:"title"`
		CheckoutDate string  `json:"checkout_date"`
		DueDate      string  `json:"due_date"`
		ReturnDate   *string `json:"return_date"`
		Status       string  `json:"status"`
	}
	loans := []loanItem{}
	for rows.Next() {
		var l loanItem
		if err := rows.Scan(&l.LoanID, &l.Title, &l.CheckoutDate, &l.DueDate, &l.ReturnDate, &l.Status); err != nil {
			continue
		}
		loans = append(loans, l)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": loans, "total": len(loans)})
}

// POST /api/v1/library/loans/{loanId}/return — return a borrowed book
func (h *Handler) ReturnBook(w http.ResponseWriter, r *http.Request) {
	loanID := chi.URLParam(r, "loanId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleTier, _ := authpkg.GetRoleTier(r)

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Fetch loan — staff/admin can return any loan, members only their own
	var catalogID, loanOwner string
	var returnDate *string
	query := `SELECT catalog_id, user_id, return_date FROM loans WHERE loan_id = $1`
	if err := tx.QueryRow(r.Context(), query, loanID).Scan(&catalogID, &loanOwner, &returnDate); err != nil {
		writeError(w, http.StatusNotFound, "loan not found")
		return
	}
	if returnDate != nil {
		writeError(w, http.StatusConflict, "already returned")
		return
	}
	if loanOwner != userID && roleTier != "staff" && roleTier != "admin" && roleTier != "ai_admin" {
		writeError(w, http.StatusForbidden, "not your loan")
		return
	}

	if _, err := tx.Exec(r.Context(),
		`UPDATE loans SET return_date = now(), status = 'returned' WHERE loan_id = $1`, loanID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update loan")
		return
	}

	_, _ = tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies + 1 WHERE catalog_id = $1`, catalogID)

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "returned successfully"})
}

// GET /api/v1/library/loans/all — list all loans (staff/admin only)
func (h *Handler) ListAllLoans(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	where := "1=1"
	args := []any{}
	if status != "" {
		where = "l.status = $1"
		args = append(args, status)
	}

	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM loans l WHERE `+where, args...).Scan(&total)

	args = append(args, perPage, offset)
	limitIdx := len(args) - 1
	offsetIdx := len(args)

	rows, err := h.db.Query(r.Context(),
		`SELECT l.loan_id, u.email, c.title, 
		        to_char(l.checkout_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(l.due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(l.return_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        l.status
		 FROM loans l
		 JOIN users u ON u.user_id = l.user_id
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 WHERE `+where+`
		 ORDER BY l.checkout_date DESC
		 LIMIT $`+strconv.Itoa(limitIdx)+` OFFSET $`+strconv.Itoa(offsetIdx),
		args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type loanRow struct {
		LoanID       string  `json:"loan_id"`
		UserEmail    string  `json:"user_email"`
		Title        string  `json:"title"`
		CheckoutDate string  `json:"checkout_date"`
		DueDate      string  `json:"due_date"`
		ReturnDate   *string `json:"return_date"`
		Status       string  `json:"status"`
	}
	loans := []loanRow{}
	for rows.Next() {
		var l loanRow
		if err := rows.Scan(&l.LoanID, &l.UserEmail, &l.Title,
			&l.CheckoutDate, &l.DueDate, &l.ReturnDate, &l.Status); err != nil {
			continue
		}
		loans = append(loans, l)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": loans, "total": total})
}

// GET /api/v1/library/fines — list user's fines
func (h *Handler) ListFines(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT f.fine_id, f.loan_id, f.amount, f.status, f.calculated_at, c.title
		 FROM fines f
		 JOIN loans l ON l.loan_id = f.loan_id
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 WHERE f.user_id = $1
		 ORDER BY f.calculated_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type fineItem struct {
		FineID    string  `json:"fine_id"`
		LoanID    string  `json:"loan_id"`
		AmountBDT float64 `json:"amount_bdt"`
		Paid      bool    `json:"paid"`
		Waived    bool    `json:"waived"`
		CreatedAt string  `json:"created_at"`
		Title     string  `json:"title"`
	}
	fines := []fineItem{}
	totalPending := 0.0

	for rows.Next() {
		var f fineItem
		var status string
		if err := rows.Scan(&f.FineID, &f.LoanID, &f.AmountBDT, &status, &f.CreatedAt, &f.Title); err != nil {
			continue
		}
		f.Paid = (status == "paid")
		f.Waived = (status == "waived")
		if status == "pending" {
			totalPending += f.AmountBDT
		}
		fines = append(fines, f)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":             fines,
		"total":            len(fines),
		"total_unpaid_bdt": totalPending,
	})
}

// POST /api/v1/library/fines/{fineId}/pay — record fine payment
func (h *Handler) PayFine(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Amount float64 `json:"amount"`
		Method string  `json:"method"` // "cash", "card", "mobile"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Amount <= 0 {
		writeError(w, http.StatusBadRequest, "invalid payment amount")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Verify fine belongs to user and is pending
	var fineAmount float64
	var fineStatus, fineOwner string
	err = tx.QueryRow(r.Context(),
		`SELECT amount, status, user_id FROM fines WHERE fine_id = $1 FOR UPDATE`,
		fineID).Scan(&fineAmount, &fineStatus, &fineOwner)

	if err != nil {
		writeError(w, http.StatusNotFound, "fine not found")
		return
	}

	if fineOwner != userID {
		writeError(w, http.StatusForbidden, "not your fine")
		return
	}

	if fineStatus != "pending" {
		writeError(w, http.StatusConflict, "fine already "+fineStatus)
		return
	}

	if req.Amount < fineAmount {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("insufficient payment: %.2f BDT required", fineAmount))
		return
	}

	// Record payment
	var paymentID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO payments (fine_id, user_id, amount, status, paid_at)
		 VALUES ($1, $2, $3, 'successful', now())
		 RETURNING payment_id`,
		fineID, userID, req.Amount).Scan(&paymentID)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not record payment")
		return
	}

	// Mark fine as paid
	_, err = tx.Exec(r.Context(),
		`UPDATE fines SET status = 'paid' WHERE fine_id = $1`, fineID)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update fine status")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"payment_id": paymentID,
		"message":    "payment recorded successfully",
	})
}

// POST /api/v1/library/fines/{fineId}/waive — waive a fine (staff/admin only)
func (h *Handler) WaiveFine(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")

	var req struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	result, err := h.db.Exec(r.Context(),
		`UPDATE fines SET status = 'waived' WHERE fine_id = $1 AND status = 'pending'`,
		fineID)

	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "fine not found or already processed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "fine waived"})
}

// POST /api/v1/library/catalog — add a single book (librarian/admin only)
func (h *Handler) AddBook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title       string  `json:"title"`
		Author      string  `json:"author"`
		ISBN        *string `json:"isbn"`
		Format      string  `json:"format"`
		Location    *string `json:"location"`
		Year        *int    `json:"year"`
		TotalCopies int     `json:"total_copies"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	if req.Title == "" || req.Author == "" {
		writeError(w, http.StatusBadRequest, "title and author are required")
		return
	}
	if req.Format == "" {
		req.Format = "book"
	}
	if req.TotalCopies < 1 {
		req.TotalCopies = 1
	}

	var catalogID string
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO library_catalog (title, author, isbn, format, location, year, total_copies, available_copies)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
		 RETURNING catalog_id`,
		req.Title, req.Author, req.ISBN, req.Format, req.Location, req.Year, req.TotalCopies,
	).Scan(&catalogID)

	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			writeError(w, http.StatusConflict, "book with this ISBN already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not add book")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"catalog_id": catalogID,
		"message":    "book added successfully",
	})
}