package research

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
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

	// Only researchers can submit research papers
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "researcher" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "only researchers can submit research papers")
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

		// Update metadata
		_, err = tx.Exec(ctx,
			`UPDATE media_metadata SET abstract = $1, keywords = $2 WHERE item_id = $3`,
			req.Abstract, req.Keywords, itemID,
		)
		if err != nil {
			log.Printf("Failed to update metadata: %v", err)
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

// GET /api/v1/research
func (h *Handler) ListResearch(w http.ResponseWriter, r *http.Request) {
	userID, _ := authpkg.GetUserID(r) // optional auth
	roleTier, _ := authpkg.GetRoleTier(r)
	status := r.URL.Query().Get("status")
	forReview := r.URL.Query().Get("for_review") == "true"

	var query string
	var args []interface{}

	// Special case: researchers can see papers pending review (excluding their own)
	if forReview && roleTier == "researcher" {
		query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
		                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
		                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
		                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
		         FROM research_papers rp
		         JOIN media_items m ON rp.item_id = m.item_id
		         JOIN media_metadata mm ON m.item_id = mm.item_id
		         WHERE m.status = 'review' AND m.created_by != $1
		         ORDER BY rp.submitted_at ASC`
		args = append(args, userID)
	} else if roleTier == "administrator" || roleTier == "librarian" || roleTier == "researcher" {
		// Can see all papers
		if status != "" {
			query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
			                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
			                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
			                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
			         FROM research_papers rp
			         JOIN media_items m ON rp.item_id = m.item_id
			         JOIN media_metadata mm ON m.item_id = mm.item_id
			         WHERE m.status = $1
			         ORDER BY rp.submitted_at DESC`
			args = append(args, status)
		} else {
			query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
			                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
			                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
			                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
			         FROM research_papers rp
			         JOIN media_items m ON rp.item_id = m.item_id
			         JOIN media_metadata mm ON m.item_id = mm.item_id
			         ORDER BY rp.submitted_at DESC`
		}
	} else if userID != "" {
		// Authenticated non-researcher: see published + own papers
		if status != "" {
			query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
			                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
			                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
			                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
			         FROM research_papers rp
			         JOIN media_items m ON rp.item_id = m.item_id
			         JOIN media_metadata mm ON m.item_id = mm.item_id
			         WHERE (m.status = 'published' OR m.created_by = $1) AND m.status = $2
			         ORDER BY rp.submitted_at DESC`
			args = append(args, userID, status)
		} else {
			query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
			                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
			                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
			                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
			         FROM research_papers rp
			         JOIN media_items m ON rp.item_id = m.item_id
			         JOIN media_metadata mm ON m.item_id = mm.item_id
			         WHERE m.status = 'published' OR m.created_by = $1
			         ORDER BY rp.submitted_at DESC`
			args = append(args, userID)
		}
	} else {
		// Unauthenticated: only published papers
		query = `SELECT rp.paper_id, rp.item_id, m.title, rp.authors, rp.co_authors, 
		                mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
		                rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
		                rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
		         FROM research_papers rp
		         JOIN media_items m ON rp.item_id = m.item_id
		         JOIN media_metadata mm ON m.item_id = mm.item_id
		         WHERE m.status = 'published'
		         ORDER BY rp.submitted_at DESC`
	}

	rows, err := h.db.Query(r.Context(), query, args...)
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
		"data":  papers,
		"total": len(papers),
	})
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
		        mm.abstract, mm.keywords, rp.publication_date, rp.doi, rp.journal, 
		        rp.conference, m.status, m.access_tier, m.file_path, m.created_by, 
		        rp.submitted_at, rp.reviewer_id, rp.review_notes, rp.reviewed_at
		 FROM research_papers rp
		 JOIN media_items m ON rp.item_id = m.item_id
		 JOIN media_metadata mm ON m.item_id = mm.item_id
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

	// Update status to review
	_, err = h.db.Exec(r.Context(),
		`UPDATE media_items SET status = 'review' WHERE item_id = $1`,
		itemID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to submit for review")
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
	newStatus := "draft"
	if req.Approved {
		newStatus = "published"
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
		`SELECT rp.item_id, m.created_by, rp.reviewer_id, rp.reviewed_at
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