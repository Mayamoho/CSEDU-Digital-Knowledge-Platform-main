package library

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

type Handler struct{ db *pgxpool.Pool }

func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }

// fineBlockThreshold reads FINE_BLOCK_THRESHOLD_BDT (default 50).
func fineBlockThreshold() float64 {
	if v, err := strconv.ParseFloat(os.Getenv("FINE_BLOCK_THRESHOLD_BDT"), 64); err == nil && v > 0 {
		return v
	}
	return 50
}

// unpaidFinesBlock reports whether the user's pending fines meet/exceed the
// checkout-block threshold (FR-TXX-018) and how much is owed.
func unpaidFinesBlock(ctx context.Context, db *pgxpool.Pool, userID string) (bool, float64) {
	var owed float64
	if err := db.QueryRow(ctx,
		`SELECT COALESCE(SUM(amount), 0) FROM fines
		 WHERE user_id = $1 AND status = 'pending'`, userID,
	).Scan(&owed); err != nil {
		return false, 0
	}
	return owed >= fineBlockThreshold(), owed
}

// backfillTopicsSQL classifies existing books into subjects from title
// keywords. It mirrors, in the same specific-first order, migration
// 005_book_topics.sql and the Go DeriveTopic helper.
const backfillTopicsSQL = `
UPDATE library_catalog SET topic = CASE
    WHEN lower(title) ~ 'deep learning'                                              THEN 'Deep Learning'
    WHEN lower(title) ~ 'machine learning'                                           THEN 'Machine Learning'
    WHEN lower(title) ~ 'artificial intelligence' OR lower(title) ~ '\yai\y'         THEN 'Artificial Intelligence'
    WHEN lower(title) ~ 'data structure'                                             THEN 'Data Structures'
    WHEN lower(title) ~ 'algorithm'                                                  THEN 'Algorithms'
    WHEN lower(title) ~ 'database|\ysql\y'                                           THEN 'Databases'
    WHEN lower(title) ~ 'operating system'                                           THEN 'Operating Systems'
    WHEN lower(title) ~ 'network'                                                    THEN 'Networking'
    WHEN lower(title) ~ 'compiler'                                                   THEN 'Compilers'
    WHEN lower(title) ~ 'architecture|organization'                                  THEN 'Computer Architecture'
    WHEN lower(title) ~ 'software engineering'                                       THEN 'Software Engineering'
    WHEN lower(title) ~ 'data science|data mining|big data'                          THEN 'Data Science'
    WHEN lower(title) ~ 'security|cryptograph|cyber'                                 THEN 'Security'
    WHEN lower(title) ~ 'web|html|javascript|react'                                  THEN 'Web Development'
    WHEN lower(title) ~ 'discrete|calculus|algebra|mathematic|probabilit|statistic'  THEN 'Mathematics'
    WHEN lower(title) ~ 'python|java|c\+\+|programming|coding'                        THEN 'Programming'
    WHEN lower(title) ~ 'computation|automata'                                       THEN 'Theory of Computation'
    ELSE 'General'
END
WHERE topic = 'General'`

// EnsureTopicColumn guarantees library_catalog has a back-filled `topic` column
// so the catalog keeps working even when the deploy script's psql migration step
// was skipped or failed. Idempotent and cheap: it no-ops once the column exists.
func EnsureTopicColumn(ctx context.Context, db *pgxpool.Pool) error {
	var hasTopic bool
	if err := db.QueryRow(ctx,
		`SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_name = 'library_catalog' AND column_name = 'topic'
		)`).Scan(&hasTopic); err != nil {
		return err
	}
	if hasTopic {
		return nil
	}
	if _, err := db.Exec(ctx,
		`ALTER TABLE library_catalog ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'General'`); err != nil {
		return err
	}
	if _, err := db.Exec(ctx, backfillTopicsSQL); err != nil {
		return err
	}
	_, _ = db.Exec(ctx, `CREATE INDEX IF NOT EXISTS idx_catalog_topic ON library_catalog (topic)`)
	return nil
}

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
	Topic           string  `json:"topic"`
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
	topic := strings.TrimSpace(r.URL.Query().Get("topic"))
	format := r.URL.Query().Get("format")
	// Hierarchy: topic -> availability -> format -> year. "status" kept as an
	// alias for availability for backward compatibility.
	availability := r.URL.Query().Get("availability")
	if availability == "" {
		availability = r.URL.Query().Get("status")
	}
	year := r.URL.Query().Get("year")
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
			OR topic ILIKE '%' || $`+strconv.Itoa(argIdx)+` || '%'
		)`)
		args = append(args, q)
		argIdx++
	}
	if topic != "" {
		where = append(where, `topic = $`+strconv.Itoa(argIdx))
		args = append(args, topic)
		argIdx++
	}
	// availability is derived from available_copies
	switch availability {
	case "available":
		where = append(where, `available_copies > 0`)
	case "borrowed":
		where = append(where, `available_copies = 0`)
	}
	if format != "" {
		where = append(where, `format = $`+strconv.Itoa(argIdx))
		args = append(args, format)
		argIdx++
	}
	if year != "" {
		where = append(where, `year = $`+strconv.Itoa(argIdx))
		args = append(args, year)
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Dependent facet counts for the topic -> availability -> format -> year hierarchy.
	facets := h.catalogFacets(r.Context(), q, topic, availability, format)

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
		`SELECT catalog_id, title, author, isbn, topic, format, available_copies,
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
			&it.Topic, &it.Format, &availCopies, &totalCopies,
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

	writeJSON(w, http.StatusOK, map[string]any{
		"data":        items,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
		"facets":      facets,
	})
}

// facetBucket is one selectable option in a hierarchical filter, with the
// number of matching resources given the selections above it.
type facetBucket struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

// catalogFacets builds the topic -> availability -> format -> year facet tree.
// Each level's counts respect the selections at the levels above it (and the
// search query), so the UI can show live counts as the user drills down.
func (h *Handler) catalogFacets(ctx context.Context, q, topic, availability, format string) map[string][]facetBucket {
	out := map[string][]facetBucket{
		"topic":        {},
		"availability": {},
		"format":       {},
		"year":         {},
	}

	// Shared search predicate + args, reused by every facet query.
	base := "1=1"
	baseArgs := []any{}
	if q != "" {
		base = `(to_tsvector('english', title) @@ plainto_tsquery('english', $1)
			OR to_tsvector('english', author) @@ plainto_tsquery('english', $1)
			OR isbn ILIKE '%' || $1 || '%'
			OR topic ILIKE '%' || $1 || '%')`
		baseArgs = append(baseArgs, q)
	}

	// Level 1: topic (counts ignore the topic selection itself, respecting q).
	tRows, err := h.db.Query(ctx,
		`SELECT topic, COUNT(*) FROM library_catalog
		 WHERE `+base+`
		 GROUP BY topic ORDER BY topic`, baseArgs...)
	if err == nil {
		defer tRows.Close()
		for tRows.Next() {
			var b facetBucket
			if tRows.Scan(&b.Value, &b.Count) == nil {
				b.Label = b.Value
				out["topic"] = append(out["topic"], b)
			}
		}
	}

	// Once a topic is chosen, the lower levels are scoped to it.
	topicCond := ""
	if topic != "" {
		baseArgs = append(baseArgs, topic)
		topicCond = ` AND topic = $` + strconv.Itoa(len(baseArgs))
	}

	availCond := func() string {
		switch availability {
		case "available":
			return " AND available_copies > 0"
		case "borrowed":
			return " AND available_copies = 0"
		}
		return ""
	}()

	// Level 2: availability within selected topic.
	var avail, borrowed int
	_ = h.db.QueryRow(ctx,
		`SELECT COUNT(*) FILTER (WHERE available_copies > 0),
		        COUNT(*) FILTER (WHERE available_copies = 0)
		 FROM library_catalog WHERE `+base+topicCond, baseArgs...).Scan(&avail, &borrowed)
	if avail > 0 {
		out["availability"] = append(out["availability"], facetBucket{"available", "Available", avail})
	}
	if borrowed > 0 {
		out["availability"] = append(out["availability"], facetBucket{"borrowed", "Currently Borrowed", borrowed})
	}

	// Level 3: format within selected topic + availability.
	fRows, err := h.db.Query(ctx,
		`SELECT format, COUNT(*) FROM library_catalog
		 WHERE `+base+topicCond+availCond+`
		 GROUP BY format ORDER BY COUNT(*) DESC, format`, baseArgs...)
	if err == nil {
		defer fRows.Close()
		for fRows.Next() {
			var b facetBucket
			if fRows.Scan(&b.Value, &b.Count) == nil {
				b.Label = titleCase(b.Value)
				out["format"] = append(out["format"], b)
			}
		}
	}

	// Level 4: year within topic + availability + format (only once a format is chosen).
	if format != "" {
		yArgs := append(append([]any{}, baseArgs...), format)
		yRows, err := h.db.Query(ctx,
			`SELECT year, COUNT(*) FROM library_catalog
			 WHERE `+base+topicCond+availCond+` AND format = $`+strconv.Itoa(len(baseArgs)+1)+` AND year IS NOT NULL
			 GROUP BY year ORDER BY year DESC`, yArgs...)
		if err == nil {
			defer yRows.Close()
			for yRows.Next() {
				var y int
				var c int
				if yRows.Scan(&y, &c) == nil {
					ys := strconv.Itoa(y)
					out["year"] = append(out["year"], facetBucket{ys, ys, c})
				}
			}
		}
	}

	return out
}

// titleCase upper-cases the first rune — enough to prettify short enum values
// like "book" -> "Book" without pulling in golang.org/x/text.
func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// aiWordRe matches "ai" as a standalone word so titles like "AI in Practice"
// classify as Artificial Intelligence without also catching words like "chain".
var aiWordRe = regexp.MustCompile(`\bai\b`)

// DeriveTopic classifies a book into a subject from keywords in its title
// (exported for reuse by the admin CSV importer). It mirrors, in the same
// specific-first order, the back-fill CASE in migration 005_book_topics.sql so
// books added after the migration are bucketed the same way existing rows were.
// Used when a caller omits an explicit topic.
func DeriveTopic(title string) string {
	t := strings.ToLower(title)
	switch {
	case strings.Contains(t, "deep learning"):
		return "Deep Learning"
	case strings.Contains(t, "machine learning"):
		return "Machine Learning"
	case strings.Contains(t, "artificial intelligence") || aiWordRe.MatchString(t):
		return "Artificial Intelligence"
	case strings.Contains(t, "data structure"):
		return "Data Structures"
	case strings.Contains(t, "algorithm"):
		return "Algorithms"
	case strings.Contains(t, "database") || strings.Contains(t, "sql"):
		return "Databases"
	case strings.Contains(t, "operating system"):
		return "Operating Systems"
	case strings.Contains(t, "network"):
		return "Networking"
	case strings.Contains(t, "compiler"):
		return "Compilers"
	case strings.Contains(t, "architecture") || strings.Contains(t, "organization"):
		return "Computer Architecture"
	case strings.Contains(t, "software engineering"):
		return "Software Engineering"
	case strings.Contains(t, "data science") || strings.Contains(t, "data mining") || strings.Contains(t, "big data"):
		return "Data Science"
	case strings.Contains(t, "security") || strings.Contains(t, "cryptograph") || strings.Contains(t, "cyber"):
		return "Security"
	case strings.Contains(t, "web") || strings.Contains(t, "html") || strings.Contains(t, "javascript") || strings.Contains(t, "react"):
		return "Web Development"
	case strings.Contains(t, "discrete") || strings.Contains(t, "calculus") || strings.Contains(t, "algebra") ||
		strings.Contains(t, "mathematic") || strings.Contains(t, "probabilit") || strings.Contains(t, "statistic"):
		return "Mathematics"
	case strings.Contains(t, "python") || strings.Contains(t, "java") || strings.Contains(t, "c++") ||
		strings.Contains(t, "programming") || strings.Contains(t, "coding"):
		return "Programming"
	case strings.Contains(t, "computation") || strings.Contains(t, "automata"):
		return "Theory of Computation"
	default:
		return "General"
	}
}

// topicSummary is one subject section on the catalog landing view.
type topicSummary struct {
	Topic     string `json:"topic"`
	Total     int    `json:"total"`
	Available int    `json:"available"`
}

// GET /api/v1/library/catalog/topics
// Lists every subject present in the catalog with its book counts, so the
// catalog page can render a topic-wise overview that links into each topic's
// own paginated grid.
func (h *Handler) ListTopics(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT topic, COUNT(*),
		        COUNT(*) FILTER (WHERE available_copies > 0)
		 FROM library_catalog
		 GROUP BY topic
		 ORDER BY topic`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	topics := []topicSummary{}
	for rows.Next() {
		var t topicSummary
		if err := rows.Scan(&t.Topic, &t.Total, &t.Available); err != nil {
			continue
		}
		topics = append(topics, t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": topics, "total": len(topics)})
}

// GET /api/v1/library/catalog/{itemId}
func (h *Handler) GetCatalogItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	var it catalogItem
	var availCopies, totalCopies int
	err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id, title, author, isbn, topic, format, available_copies,
		        total_copies, location, cover_image, year
		 FROM library_catalog WHERE catalog_id = $1`, id,
	).Scan(&it.ItemID, &it.Title, &it.Author, &it.ISBN,
		&it.Topic, &it.Format, &availCopies, &totalCopies,
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

	// FR-TXX-018: block checkout while unpaid fines meet/exceed the threshold
	if blocked, owed := unpaidFinesBlock(r.Context(), h.db, userID); blocked {
		writeError(w, http.StatusForbidden,
			fmt.Sprintf("you have outstanding fines of %.2f BDT — payment required before borrowing", owed))
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
		// SDD Flow 3: offer a hold when the item is fully checked out.
		writeJSON(w, http.StatusConflict, map[string]any{
			"message":  "no copies available — you can place a hold to be notified when one is returned",
			"can_hold": true,
		})
		return
	}

	var loanID, dueDate string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO loans (user_id, catalog_id, due_date)
		 VALUES ($1, $2, now() + interval '20 hours')
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

	// Assess a late fine when the book is returned after its due date. Without
	// this, late returns escaped fining entirely: the fine-worker only scans
	// loans that are still active (return_date IS NULL), so a returned loan was
	// never fined. Formula mirrors the fine-worker defaults
	// (FINE_RATE_BDT_PER_DAY=50, MAX_FINE_PER_LOAN_BDT=500). The 1-day floor
	// keeps amount > 0 (chk_fine_positive); ON CONFLICT makes it idempotent
	// against any fine the worker may have already created.
	_, _ = tx.Exec(r.Context(), `
		INSERT INTO fines (loan_id, user_id, amount, status, calculated_at)
		SELECT loan_id, user_id,
		       LEAST(FLOOR(EXTRACT(EPOCH FROM (return_date - due_date)) / 86400) * 50, 500),
		       'pending', now()
		FROM loans
		WHERE loan_id = $1
		  AND return_date >= due_date + interval '1 day'
		ON CONFLICT (loan_id) DO NOTHING`, loanID)

	_, _ = tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies + 1 WHERE catalog_id = $1`, catalogID)

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	// A copy is back on the shelf — fulfil the oldest active hold, if any.
	_ = h.fulfillOldestHold(r, catalogID)

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
		`SELECT f.fine_id, f.loan_id, f.amount::float8, f.status,
		        to_char(f.calculated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), c.title,
		        ps.method, ps.status
		 FROM fines f
		 JOIN loans l ON l.loan_id = f.loan_id
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 LEFT JOIN LATERAL (
		     SELECT method, status FROM payment_sessions s
		     WHERE s.fine_id = f.fine_id AND s.status IN ('otp_sent','awaiting_counter')
		     ORDER BY s.created_at DESC LIMIT 1
		 ) ps ON true
		 WHERE f.user_id = $1
		 ORDER BY f.calculated_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type fineItem struct {
		FineID        string  `json:"fine_id"`
		LoanID        string  `json:"loan_id"`
		AmountBDT     float64 `json:"amount_bdt"`
		Paid          bool    `json:"paid"`
		Waived        bool    `json:"waived"`
		CreatedAt     string  `json:"created_at"`
		Title         string  `json:"title"`
		PendingMethod *string `json:"pending_method"`
		PendingStatus *string `json:"pending_status"`
	}
	fines := []fineItem{}
	totalPending := 0.0

	for rows.Next() {
		var f fineItem
		var status string
		if err := rows.Scan(&f.FineID, &f.LoanID, &f.AmountBDT, &status, &f.CreatedAt, &f.Title,
			&f.PendingMethod, &f.PendingStatus); err != nil {
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

// GET /api/v1/library/fines/all — list every member's fines (librarian/admin)
func (h *Handler) ListAllFines(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT f.fine_id, f.loan_id, f.user_id, u.name, u.email,
		        f.amount::float8, f.status,
		        to_char(f.calculated_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        c.title, ps.method, ps.status
		 FROM fines f
		 JOIN users u ON u.user_id = f.user_id
		 JOIN loans l ON l.loan_id = f.loan_id
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 LEFT JOIN LATERAL (
		     SELECT method, status FROM payment_sessions s
		     WHERE s.fine_id = f.fine_id AND s.status IN ('otp_sent','awaiting_counter')
		     ORDER BY s.created_at DESC LIMIT 1
		 ) ps ON true
		 ORDER BY f.calculated_at DESC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type fineItem struct {
		FineID        string  `json:"fine_id"`
		LoanID        string  `json:"loan_id"`
		UserID        string  `json:"user_id"`
		UserName      string  `json:"user_name"`
		UserEmail     string  `json:"user_email"`
		AmountBDT     float64 `json:"amount_bdt"`
		Paid          bool    `json:"paid"`
		Waived        bool    `json:"waived"`
		CreatedAt     string  `json:"created_at"`
		Title         string  `json:"title"`
		PendingMethod *string `json:"pending_method"`
		PendingStatus *string `json:"pending_status"`
	}
	fines := []fineItem{}
	totalPending := 0.0

	for rows.Next() {
		var f fineItem
		var status string
		if err := rows.Scan(&f.FineID, &f.LoanID, &f.UserID, &f.UserName, &f.UserEmail,
			&f.AmountBDT, &status, &f.CreatedAt, &f.Title, &f.PendingMethod, &f.PendingStatus); err != nil {
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
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Title       string  `json:"title"`
		Author      string  `json:"author"`
		ISBN        *string `json:"isbn"`
		Topic       string  `json:"topic"`
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
	// Topic is chosen on the add-book form; fall back to keyword classification
	// of the title when it's left blank so every book still lands in a section.
	req.Topic = strings.TrimSpace(req.Topic)
	if req.Topic == "" {
		req.Topic = DeriveTopic(req.Title)
	}
	if req.TotalCopies < 1 {
		req.TotalCopies = 1
	}

	var catalogID string
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO library_catalog (title, author, isbn, topic, format, location, year, total_copies, available_copies, created_by)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9)
		 RETURNING catalog_id`,
		req.Title, req.Author, req.ISBN, req.Topic, req.Format, req.Location, req.Year, req.TotalCopies, userID,
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

// GET /api/v1/library/catalog/my-books — list books added by current user (librarian)
func (h *Handler) GetMyAddedBooks(w http.ResponseWriter, r *http.Request) {
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
		perPage = 20
	}
	offset := (page - 1) * perPage

	// Count total
	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM library_catalog WHERE created_by = $1`, userID).Scan(&total)

	// Get books
	rows, err := h.db.Query(r.Context(),
		`SELECT catalog_id, title, author, isbn, topic, format, available_copies,
		        total_copies, location, cover_image, year,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM library_catalog
		 WHERE created_by = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`, userID, perPage, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type bookItem struct {
		CatalogID       string  `json:"catalog_id"`
		Title           string  `json:"title"`
		Author          string  `json:"author"`
		ISBN            *string `json:"isbn"`
		Topic           string  `json:"topic"`
		Format          string  `json:"format"`
		AvailableCopies int     `json:"available_copies"`
		TotalCopies     int     `json:"total_copies"`
		Location        *string `json:"location"`
		CoverImage      *string `json:"cover_image"`
		Year            *int    `json:"year"`
		CreatedAt       string  `json:"created_at"`
	}

	books := []bookItem{}
	for rows.Next() {
		var b bookItem
		if err := rows.Scan(&b.CatalogID, &b.Title, &b.Author, &b.ISBN,
			&b.Topic, &b.Format, &b.AvailableCopies, &b.TotalCopies,
			&b.Location, &b.CoverImage, &b.Year, &b.CreatedAt); err != nil {
			continue
		}
		books = append(books, b)
	}

	// Per-topic breakdown across ALL of this librarian's added books (every
	// page), so the profile can show how many books they added per subject.
	type topicCount struct {
		Topic string `json:"topic"`
		Count int    `json:"count"`
	}
	byTopic := []topicCount{}
	if trows, terr := h.db.Query(r.Context(),
		`SELECT topic, COUNT(*) AS c FROM library_catalog
		 WHERE created_by = $1 GROUP BY topic ORDER BY c DESC, topic`, userID); terr == nil {
		defer trows.Close()
		for trows.Next() {
			var tc topicCount
			if trows.Scan(&tc.Topic, &tc.Count) == nil {
				byTopic = append(byTopic, tc)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":     books,
		"total":    total,
		"page":     page,
		"per_page": perPage,
		"by_topic": byTopic,
	})
}