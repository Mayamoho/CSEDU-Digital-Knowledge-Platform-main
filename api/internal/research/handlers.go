package research

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/mailer"
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

type ResearchPaper struct {
	PaperID         string    `json:"paper_id"`
	ItemID          string    `json:"item_id"`
	Title           string    `json:"title"`
	Authors         []string  `json:"authors"`
	CoAuthors       []string  `json:"co_authors"`
	Abstract        string    `json:"abstract"`
	Keywords        []string  `json:"keywords"`
	PublicationDate *string   `json:"publication_date,omitempty"`
	DOI             *string   `json:"doi,omitempty"`
	Journal         *string   `json:"journal,omitempty"`
	Conference      *string   `json:"conference,omitempty"`
	Status          string    `json:"status"`
	AccessTier      string    `json:"access_tier"`
	FilePath        *string   `json:"file_path,omitempty"`
	CreatedBy       string    `json:"created_by"`
	SubmittedAt     time.Time `json:"submitted_at"`
	ReviewerID      *string   `json:"reviewer_id,omitempty"`
	ReviewNotes     *string   `json:"review_notes,omitempty"`
	ReviewedAt      *string   `json:"reviewed_at,omitempty"`
}

type SubmitResearchRequest struct {
	Title           string   `json:"title"`
	Authors         []string `json:"authors"`
	CoAuthors       []string `json:"co_authors"`
	Abstract        string   `json:"abstract"`
	Keywords        []string `json:"keywords"`
	PublicationDate *string  `json:"publication_date,omitempty"`
	DOI             *string  `json:"doi,omitempty"`
	Journal         *string  `json:"journal,omitempty"`
	Conference      *string  `json:"conference,omitempty"`
	FilePath        string   `json:"file_path"`
}

// POST /api/v1/research
func (h *Handler) SubmitResearch(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Students, researchers and administrators can submit research papers
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "student" && roleTier != "researcher" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "you are not allowed to submit research papers")
		return
	}

	var req SubmitResearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validation
	if req.Title == "" || len(req.Authors) == 0 || req.Abstract == "" {
		writeError(w, http.StatusBadRequest, "title, authors, and abstract are required")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Get the media_item by file_path (it should already exist from uploadMedia)
	var itemID string
	err = tx.QueryRow(ctx,
		`SELECT item_id FROM media_items WHERE file_path = $1 AND created_by = $2`,
		req.FilePath, userID,
	).Scan(&itemID)
	
	if err != nil {
		// If media_item doesn't exist, create it (fallback for direct API calls)
		itemID = uuid.New().String()
		_, err = tx.Exec(ctx,
			`INSERT INTO media_items (item_id, title, item_type, format, status, access_tier, created_by, file_path)
			 VALUES ($1, $2, 'research', 'pdf', 'draft', 'researcher', $3, $4)`,
			itemID, req.Title, userID, req.FilePath,
		)
		if err != nil {
			log.Printf("Failed to create media item: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create research paper")
			return
		}

		// Create metadata
		_, err = tx.Exec(ctx,
			`INSERT INTO media_metadata (item_id, abstract, keywords, language)
			 VALUES ($1, $2, $3, 'en')`,
			itemID, req.Abstract, req.Keywords,
		)
		if err != nil {
			log.Printf("Failed to create metadata: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create research paper")
			return
		}
	} else {
		// Update existing media_item title if needed
		_, err = tx.Exec(ctx,
			`UPDATE media_items SET title = $1 WHERE item_id = $2`,
			req.Title, itemID,
		)
		if err != nil {
			log.Printf("Failed to update media item: %v", err)
		}

		// Upsert metadata (insert or update)
		_, err = tx.Exec(ctx,
			`INSERT INTO media_metadata (item_id, abstract, keywords, language)
			 VALUES ($1, $2, $3, 'en')
			 ON CONFLICT (item_id) DO UPDATE SET
			   abstract = EXCLUDED.abstract,
			   keywords = EXCLUDED.keywords`,
			itemID, req.Abstract, req.Keywords,
		)
		if err != nil {
			log.Printf("Failed to upsert metadata: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to update research paper")
			return
		}
	}

	// Create research_paper
	paperID := uuid.New().String()
	_, err = tx.Exec(ctx,
		`INSERT INTO research_papers (paper_id, item_id, authors, co_authors, publication_date, doi, journal, conference)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		paperID, itemID, req.Authors, req.CoAuthors, req.PublicationDate, req.DOI, req.Journal, req.Conference,
	)
	if err != nil {
		log.Printf("Failed to create research paper: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create research paper")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message":  "research paper submitted successfully",
		"paper_id": paperID,
		"item_id":  itemID,
	})
}

type facetBucket struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

const researchCols = `rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors,
	                COALESCE(mm.abstract, ''), COALESCE(mm.keywords, '{}'), to_char(rp.publication_date, 'YYYY-MM-DD'), rp.doi, rp.journal,
	                rp.conference, m.status, m.access_tier, m.file_path, m.created_by,
	                rp.submitted_at, rp.reviewer_id, rp.review_notes, to_char(rp.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`

const researchFromJoin = ` FROM research_papers rp
	         JOIN media_items m ON rp.item_id = m.item_id
	         LEFT JOIN media_metadata mm ON m.item_id = mm.item_id`

// researchTypeCond maps a derived research type to a WHERE predicate. Type is
// inferred from which venue field is populated (there is no explicit column).
func researchTypeCond(rtype string) string {
	switch rtype {
	case "journal":
		return "rp.journal IS NOT NULL AND rp.journal <> ''"
	case "conference":
		return "rp.conference IS NOT NULL AND rp.conference <> ''"
	case "thesis":
		return "COALESCE(rp.journal,'') = '' AND COALESCE(rp.conference,'') = ''"
	}
	return ""
}

// GET /api/v1/research
func (h *Handler) ListResearch(w http.ResponseWriter, r *http.Request) {
	userID, _ := authpkg.GetUserID(r) // optional auth
	roleTier, _ := authpkg.GetRoleTier(r)
	status := r.URL.Query().Get("status")
	forReview := r.URL.Query().Get("for_review") == "true"
	// Hierarchy: type (journal|conference|thesis) -> year -> topic (keyword).
	rtype := r.URL.Query().Get("rtype")
	year := r.URL.Query().Get("year")
	topic := r.URL.Query().Get("topic")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 12
	}
	offset := (page - 1) * perPage

	// Visibility predicates (role-based), shared by facets + results.
	var baseConds []string
	var baseArgs []interface{}
	orderBy := " ORDER BY rp.submitted_at DESC"

	switch {
	case forReview && roleTier == "researcher":
		baseArgs = append(baseArgs, userID)
		baseConds = append(baseConds, "m.status = 'review'", "m.created_by != $1", "rp.reviewer_id IS NULL")
		orderBy = " ORDER BY rp.submitted_at ASC"
	case roleTier == "administrator" || roleTier == "librarian" || roleTier == "researcher":
		if status != "" {
			baseArgs = append(baseArgs, status)
			baseConds = append(baseConds, "m.status = $"+strconv.Itoa(len(baseArgs)))
		}
	case userID != "":
		baseArgs = append(baseArgs, userID)
		baseConds = append(baseConds, "(m.status = 'published' OR m.created_by = $"+strconv.Itoa(len(baseArgs))+")")
		if status != "" {
			baseArgs = append(baseArgs, status)
			baseConds = append(baseConds, "m.status = $"+strconv.Itoa(len(baseArgs)))
		}
	default:
		baseConds = append(baseConds, "m.status = 'published'")
	}
	baseWhere := "1=1"
	if len(baseConds) > 0 {
		baseWhere = strings.Join(baseConds, " AND ")
	}

	facets := h.researchFacets(r.Context(), baseWhere, baseArgs, rtype, year)

	// Hierarchy filters on top for the actual page of results.
	conds := append([]string{}, baseConds...)
	args := append([]interface{}{}, baseArgs...)
	if c := researchTypeCond(rtype); c != "" {
		conds = append(conds, c)
	}
	if year != "" {
		args = append(args, year)
		conds = append(conds, "EXTRACT(YEAR FROM rp.publication_date)::int = $"+strconv.Itoa(len(args)))
	}
	if topic != "" {
		args = append(args, topic)
		conds = append(conds, "mm.keywords @> ARRAY[$"+strconv.Itoa(len(args))+"]::text[]")
	}
	// Free-text search across title + abstract (powers the ⌘K palette and the
	// research page search box).
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		conds = append(conds, "(m.title ILIKE $"+strconv.Itoa(len(args))+" OR COALESCE(mm.abstract, '') ILIKE $"+strconv.Itoa(len(args))+")")
	}
	whereClause := "1=1"
	if len(conds) > 0 {
		whereClause = strings.Join(conds, " AND ")
	}

	var total int
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*)`+researchFromJoin+` WHERE `+whereClause, args...).Scan(&total)

	dataArgs := append(append([]interface{}{}, args...), perPage, offset)
	query := `SELECT ` + researchCols + researchFromJoin + ` WHERE ` + whereClause + orderBy +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)

	rows, err := h.db.Query(r.Context(), query, dataArgs...)
	if err != nil {
		log.Printf("Failed to query research papers: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to retrieve research papers")
		return
	}
	defer rows.Close()

	var papers []ResearchPaper = make([]ResearchPaper, 0)
	for rows.Next() {
		var p ResearchPaper
		err := rows.Scan(
			&p.PaperID, &p.ItemID, &p.Title, &p.Authors, &p.CoAuthors,
			&p.Abstract, &p.Keywords, &p.PublicationDate, &p.DOI, &p.Journal,
			&p.Conference, &p.Status, &p.AccessTier, &p.FilePath, &p.CreatedBy,
			&p.SubmittedAt, &p.ReviewerID, &p.ReviewNotes, &p.ReviewedAt,
		)
		if err != nil {
			log.Printf("Failed to scan research paper: %v", err)
			continue
		}
		papers = append(papers, p)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":        papers,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
		"facets":      facets,
	})
}

// researchFacets builds the type -> year -> topic facet tree.
func (h *Handler) researchFacets(ctx context.Context, baseWhere string, baseArgs []interface{}, rtype, year string) map[string][]facetBucket {
	out := map[string][]facetBucket{"rtype": {}, "year": {}, "topic": {}}

	// Level 1: type counts (derived from venue fields).
	var j, c, t int
	_ = h.db.QueryRow(ctx,
		`SELECT COUNT(*) FILTER (WHERE rp.journal IS NOT NULL AND rp.journal <> ''),
		        COUNT(*) FILTER (WHERE rp.conference IS NOT NULL AND rp.conference <> ''),
		        COUNT(*) FILTER (WHERE COALESCE(rp.journal,'') = '' AND COALESCE(rp.conference,'') = '')`+
			researchFromJoin+` WHERE `+baseWhere, baseArgs...).Scan(&j, &c, &t)
	if j > 0 {
		out["rtype"] = append(out["rtype"], facetBucket{"journal", "Journal Articles", j})
	}
	if c > 0 {
		out["rtype"] = append(out["rtype"], facetBucket{"conference", "Conference Papers", c})
	}
	if t > 0 {
		out["rtype"] = append(out["rtype"], facetBucket{"thesis", "Theses / Other", t})
	}

	// Level 2: year within selected type.
	yWhere := baseWhere
	if cond := researchTypeCond(rtype); cond != "" {
		yWhere += " AND " + cond
	}
	if rows, err := h.db.Query(ctx,
		`SELECT EXTRACT(YEAR FROM rp.publication_date)::int AS y, COUNT(*)`+researchFromJoin+`
		 WHERE `+yWhere+` AND rp.publication_date IS NOT NULL
		 GROUP BY y ORDER BY y DESC`, baseArgs...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var y, n int
			if rows.Scan(&y, &n) == nil {
				ys := strconv.Itoa(y)
				out["year"] = append(out["year"], facetBucket{ys, ys, n})
			}
		}
	}

	// Level 3: topic within type + year (only once a type is chosen).
	if rtype != "" {
		tWhere := yWhere
		tArgs := append([]interface{}{}, baseArgs...)
		if year != "" {
			tArgs = append(tArgs, year)
			tWhere += " AND EXTRACT(YEAR FROM rp.publication_date)::int = $" + strconv.Itoa(len(tArgs))
		}
		if rows, err := h.db.Query(ctx,
			`SELECT kw, COUNT(*) FROM (
			   SELECT unnest(mm.keywords) AS kw`+researchFromJoin+` WHERE `+tWhere+`
			 ) s WHERE kw <> '' GROUP BY kw ORDER BY COUNT(*) DESC, kw`, tArgs...); err == nil {
			defer rows.Close()
			for rows.Next() {
				var b facetBucket
				if rows.Scan(&b.Value, &b.Count) == nil {
					b.Label = b.Value
					out["topic"] = append(out["topic"], b)
				}
			}
		}
	}

	return out
}

// GET /api/v1/research/{paperId}
func (h *Handler) GetResearch(w http.ResponseWriter, r *http.Request) {
	userID, _ := authpkg.GetUserID(r) // optional auth
	roleTier, _ := authpkg.GetRoleTier(r)

	paperID := chi.URLParam(r, "paperId")
	if paperID == "" {
		writeError(w, http.StatusBadRequest, "paper_id is required")
		return
	}

	var p ResearchPaper
	err := h.db.QueryRow(r.Context(),
		`SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
		        COALESCE(mm.abstract, ''), COALESCE(mm.keywords, '{}'), to_char(rp.publication_date, 'YYYY-MM-DD'), rp.doi, rp.journal, 
		        rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
		        rp.submitted_at, rp.reviewer_id, rp.review_notes, to_char(rp.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM research_papers rp
		 JOIN media_items m ON rp.item_id = m.item_id
		 LEFT JOIN media_metadata mm ON m.item_id = mm.item_id
		 WHERE rp.paper_id = $1`,
		paperID,
	).Scan(
		&p.PaperID, &p.ItemID, &p.Title, &p.Authors, &p.CoAuthors,
		&p.Abstract, &p.Keywords, &p.PublicationDate, &p.DOI, &p.Journal,
		&p.Conference, &p.Status, &p.AccessTier, &p.FilePath, &p.CreatedBy,
		&p.SubmittedAt, &p.ReviewerID, &p.ReviewNotes, &p.ReviewedAt,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "research paper not found")
		return
	}

	// Allow access if: published, or the requester is the author, or admin/librarian/researcher
	if p.Status != "published" {
		if userID == "" {
			writeError(w, http.StatusNotFound, "research paper not found")
			return
		}
		if userID != p.CreatedBy && roleTier != "administrator" && roleTier != "librarian" && roleTier != "researcher" {
			writeError(w, http.StatusNotFound, "research paper not found")
			return
		}
	}

	writeJSON(w, http.StatusOK, p)
}

// POST /api/v1/research/{paperId}/submit-for-review
func (h *Handler) SubmitForReview(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	paperID := chi.URLParam(r, "paperId")
	if paperID == "" {
		writeError(w, http.StatusBadRequest, "paper_id is required")
		return
	}

	// Check ownership
	var createdBy string
	var itemID string
	err := h.db.QueryRow(r.Context(),
		`SELECT m.created_by, m.item_id FROM media_items m
		 JOIN research_papers rp ON m.item_id = rp.item_id
		 WHERE rp.paper_id = $1`,
		paperID,
	).Scan(&createdBy, &itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "research paper not found")
		return
	}

	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only submit your own papers for review")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Update status to review
	_, err = tx.Exec(ctx,
		`UPDATE media_items SET status = 'review' WHERE item_id = $1`,
		itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to submit for review")
		return
	}

	// Clear any previous review so a resubmitted paper re-enters the
	// review queue instead of looking already accepted/rejected.
	_, err = tx.Exec(ctx,
		`UPDATE research_papers
		 SET reviewer_id = NULL, review_notes = NULL, reviewed_at = NULL
		 WHERE paper_id = $1`,
		paperID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to submit for review")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "research paper submitted for review",
	})
}

// POST /api/v1/research/{paperId}/review
func (h *Handler) ReviewPaper(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Only researchers and administrators can review
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "researcher" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "only researchers and administrators can review research papers")
		return
	}

	paperID := chi.URLParam(r, "paperId")
	if paperID == "" {
		writeError(w, http.StatusBadRequest, "paper_id is required")
		return
	}

	var req struct {
		Approved bool   `json:"approved"`
		Notes    string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Get item_id and created_by to check if reviewer is not the author
	var itemID, createdBy string
	err = tx.QueryRow(ctx,
		`SELECT rp.item_id, m.created_by 
		 FROM research_papers rp
		 JOIN media_items m ON m.item_id = rp.item_id
		 WHERE rp.paper_id = $1`,
		paperID,
	).Scan(&itemID, &createdBy)
	if err != nil {
		writeError(w, http.StatusNotFound, "research paper not found")
		return
	}

	// Prevent authors from reviewing their own papers
	if createdBy == userID {
		writeError(w, http.StatusForbidden, "you cannot review your own research paper")
		return
	}

	// Update research_papers with review info
	_, err = tx.Exec(ctx,
		`UPDATE research_papers 
		 SET reviewer_id = $1, review_notes = $2, reviewed_at = NOW()
		 WHERE paper_id = $3`,
		userID, req.Notes, paperID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update review")
		return
	}

	// Update media_items status
	// If approved, keep status as 'review' - author must publish manually
	// If rejected, revert to 'draft'
	newStatus := "draft"
	if req.Approved {
		newStatus = "review"
	}

	_, err = tx.Exec(ctx,
		`UPDATE media_items SET status = $1 WHERE item_id = $2`,
		newStatus, itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update status")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	// SDD Flow 5: notify the author of the review outcome (in-app + best-effort email).
	var authorID, authorEmail, authorName, paperTitle string
	if err := h.db.QueryRow(ctx,
		`SELECT u.user_id, u.email, u.name, m.title
		 FROM media_items m JOIN users u ON u.user_id = m.created_by
		 WHERE m.item_id = $1`, itemID,
	).Scan(&authorID, &authorEmail, &authorName, &paperTitle); err == nil {
		outcome := "approved — you can now publish it from your dashboard"
		if !req.Approved {
			outcome = "sent back to draft with reviewer comments"
		}
		notes := req.Notes
		if notes == "" {
			notes = "(no comments provided)"
		}
		subject := fmt.Sprintf("Review result for \"%s\"", paperTitle)
		notify.Push(ctx, h.db, authorID, subject,
			fmt.Sprintf("Your research paper \"%s\" has been reviewed and %s.\n\nReviewer comments:\n%s",
				paperTitle, outcome, notes), "/dashboard")
		mailer.SendAsync(authorEmail, subject,
			fmt.Sprintf("Hi %s,\n\nYour research paper \"%s\" has been reviewed and %s.\n\nReviewer comments:\n%s\n\n— CSEDU Digital Knowledge Platform",
				authorName, paperTitle, outcome, notes))
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "review completed successfully",
		"status":  newStatus,
	})
}

// PUT /api/v1/research/{paperId} — update research paper
func (h *Handler) UpdateResearch(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	paperID := chi.URLParam(r, "paperId")
	if paperID == "" {
		writeError(w, http.StatusBadRequest, "paper_id is required")
		return
	}

	var req struct {
		Title           string   `json:"title"`
		Authors         []string `json:"authors"`
		CoAuthors       []string `json:"co_authors"`
		Abstract        string   `json:"abstract"`
		Keywords        []string `json:"keywords"`
		PublicationDate *string  `json:"publication_date"`
		DOI             *string  `json:"doi"`
		Journal         *string  `json:"journal"`
		Conference      *string  `json:"conference"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if req.Title == "" || len(req.Authors) == 0 || req.Abstract == "" {
		writeError(w, http.StatusBadRequest, "title, authors, and abstract are required")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Check ownership and get item_id
	var itemID, createdBy string
	err = tx.QueryRow(ctx,
		`SELECT rp.item_id, m.created_by 
		 FROM research_papers rp
		 JOIN media_items m ON m.item_id = rp.item_id
		 WHERE rp.paper_id = $1`,
		paperID,
	).Scan(&itemID, &createdBy)
	if err != nil {
		writeError(w, http.StatusNotFound, "research paper not found")
		return
	}

	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only update your own research papers")
		return
	}

	// Update media_items
	_, err = tx.Exec(ctx,
		`UPDATE media_items SET title = $1 WHERE item_id = $2`,
		req.Title, itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update media item")
		return
	}

	// Update media_metadata
	_, err = tx.Exec(ctx,
		`UPDATE media_metadata SET abstract = $1, keywords = $2 WHERE item_id = $3`,
		req.Abstract, req.Keywords, itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update metadata")
		return
	}

	// Update research_papers
	_, err = tx.Exec(ctx,
		`UPDATE research_papers 
		 SET authors = $1, co_authors = $2, publication_date = $3, doi = $4, journal = $5, conference = $6
		 WHERE paper_id = $7`,
		req.Authors, req.CoAuthors, req.PublicationDate, req.DOI, req.Journal, req.Conference, paperID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update research paper")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "research paper updated successfully",
	})
}

// POST /api/v1/research/{paperId}/publish — publish approved research paper
func (h *Handler) PublishResearch(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	paperID := chi.URLParam(r, "paperId")
	if paperID == "" {
		writeError(w, http.StatusBadRequest, "paper_id is required")
		return
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Check ownership and review status
	var itemID, createdBy string
	var reviewerID *string
	var reviewedAt *string
	err = tx.QueryRow(ctx,
		`SELECT rp.item_id, m.created_by, rp.reviewer_id,
		        to_char(rp.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM research_papers rp
		 JOIN media_items m ON m.item_id = rp.item_id
		 WHERE rp.paper_id = $1`,
		paperID,
	).Scan(&itemID, &createdBy, &reviewerID, &reviewedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "research paper not found")
		return
	}

	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only publish your own research papers")
		return
	}

	if reviewerID == nil || reviewedAt == nil {
		writeError(w, http.StatusBadRequest, "paper must be reviewed before publishing")
		return
	}

	// Update status to published
	_, err = tx.Exec(ctx,
		`UPDATE media_items SET status = 'published' WHERE item_id = $1`,
		itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to publish research paper")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "research paper published successfully",
	})
}