package projects

import (
	"context"
	"encoding/json"
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
	"github.com/csedu/platform/api/internal/versioning"
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

type StudentProject struct {
	ProjectID    string    `json:"project_id"`
	ItemID       string    `json:"item_id"`
	Title        string    `json:"title"`
	TeamMembers  []string  `json:"team_members"`
	SupervisorID *string   `json:"supervisor_id,omitempty"`
	AcademicYear int       `json:"academic_year"`
	CourseCode   *string   `json:"course_code,omitempty"`
	Abstract     string    `json:"abstract"`
	Keywords     []string  `json:"keywords"`
	Status       string    `json:"status"`
	AccessTier   string    `json:"access_tier"`
	FilePath     *string   `json:"file_path,omitempty"`
	CreatedBy    string    `json:"created_by"`
	SubmittedAt  time.Time `json:"submitted_at"`
	ApprovedBy   *string   `json:"approved_by,omitempty"`
	ApprovedAt   *string   `json:"approved_at,omitempty"`
	WebURL       *string   `json:"web_url,omitempty"`
	GithubRepo   *string   `json:"github_repo,omitempty"`
	AppDownload  *string   `json:"app_download,omitempty"`
}

type SubmitProjectRequest struct {
	Title        string   `json:"title"`
	TeamMembers  []string `json:"team_members"`
	SupervisorID *string  `json:"supervisor_id,omitempty"`
	AcademicYear int      `json:"academic_year"`
	CourseCode   *string  `json:"course_code,omitempty"`
	Abstract     string   `json:"abstract"`
	Keywords     []string `json:"keywords"`
	FilePath     *string  `json:"file_path,omitempty"`
	WebURL       *string  `json:"web_url,omitempty"`
	GithubRepo   *string  `json:"github_repo,omitempty"`
	AppDownload  *string  `json:"app_download,omitempty"`
}

// POST /api/v1/projects
func (h *Handler) SubmitProject(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Only students and researchers can submit projects (researchers for testing)
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "student" && roleTier != "researcher" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "only students can submit projects")
		return
	}

	var req SubmitProjectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validation
	if req.Title == "" || len(req.TeamMembers) == 0 || req.Abstract == "" || req.AcademicYear == 0 {
		writeError(w, http.StatusBadRequest, "title, team_members, abstract, and academic_year are required")
		return
	}

	if req.AcademicYear < 2000 || req.AcademicYear > 2100 {
		writeError(w, http.StatusBadRequest, "invalid academic year")
		return
	}

	// Validate supervisor is not a student
	if req.SupervisorID != nil {
		var supervisorRole string
		err := h.db.QueryRow(r.Context(),
			`SELECT role_tier FROM users WHERE user_id = $1`,
			*req.SupervisorID,
		).Scan(&supervisorRole)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid supervisor")
			return
		}
		if supervisorRole == "student" {
			writeError(w, http.StatusBadRequest, "a student cannot supervise another student's project")
			return
		}
	}

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(ctx)

	// Create media_item
	itemID := uuid.New().String()
	var filePath *string
	var format string = "project" // Default format for projects without files
	if req.FilePath != nil && *req.FilePath != "" {
		filePath = req.FilePath
		// Try to determine format from file path if available
		if strings.Contains(*req.FilePath, ".pdf") {
			format = "pdf"
		} else if strings.Contains(*req.FilePath, ".zip") {
			format = "zip"
		} else if strings.Contains(*req.FilePath, ".apk") {
			format = "apk"
		}
	}
	// If a file was uploaded, a media_item already exists (created by uploadMedia).
	// Reuse it instead of creating a duplicate, otherwise the uploaded item becomes an
	// orphan project with no student_projects row and "View Details" fails.
	reusedExisting := false
	if filePath != nil {
		if err = tx.QueryRow(ctx,
			`SELECT item_id FROM media_items WHERE file_path = $1 AND created_by = $2`,
			*filePath, userID,
		).Scan(&itemID); err == nil {
			reusedExisting = true
		}
	}

	if reusedExisting {
		_, err = tx.Exec(ctx,
			`UPDATE media_items
			 SET title = $1, item_type = 'project', format = $2, status = 'published', access_tier = 'student'
			 WHERE item_id = $3`,
			req.Title, format, itemID,
		)
	} else {
		_, err = tx.Exec(ctx,
			`INSERT INTO media_items (item_id, title, item_type, format, status, access_tier, created_by, file_path)
			 VALUES ($1, $2, 'project', $3, 'published', 'student', $4, $5)`,
			itemID, req.Title, format, userID, filePath,
		)
	}
	if err != nil {
		log.Printf("Failed to save media item: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	// Upsert metadata (uploadMedia may have already inserted a row for this item)
	_, err = tx.Exec(ctx,
		`INSERT INTO media_metadata (item_id, abstract, keywords, language)
		 VALUES ($1, $2, $3, 'en')
		 ON CONFLICT (item_id) DO UPDATE SET
		   abstract = EXCLUDED.abstract,
		   keywords = EXCLUDED.keywords`,
		itemID, req.Abstract, req.Keywords,
	)
	if err != nil {
		log.Printf("Failed to save metadata: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	// Create student_project
	projectID := uuid.New().String()
	_, err = tx.Exec(ctx,
		`INSERT INTO student_projects (project_id, item_id, team_members, supervisor_id, academic_year, course_code, web_url, github_repo, app_download)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		projectID, itemID, req.TeamMembers, req.SupervisorID, req.AcademicYear, req.CourseCode, req.WebURL, req.GithubRepo, req.AppDownload,
	)
	if err != nil {
		log.Printf("Failed to create student project: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create project")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"message":    "project submitted successfully",
		"project_id": projectID,
		"item_id":    itemID,
	})
}

// GET /api/v1/projects
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	userID, _ := authpkg.GetUserID(r) // Optional auth - userID might be empty
	roleTier, _ := authpkg.GetRoleTier(r)
	status := r.URL.Query().Get("status")
	// Hierarchy: year -> technology (technology stored in media_metadata.keywords).
	year := r.URL.Query().Get("year")
	tech := r.URL.Query().Get("tech")
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 12
	}
	offset := (page - 1) * perPage

	const fromJoin = ` FROM student_projects sp
	              JOIN media_items m ON sp.item_id = m.item_id
	              JOIN media_metadata mm ON m.item_id = mm.item_id`

	// Base predicates (RBAC + status) shared by facets and the result set.
	var baseConds []string
	var baseArgs []interface{}
	if userID == "" || (roleTier != "administrator" && roleTier != "librarian") {
		baseConds = append(baseConds, "m.status = 'published'")
	} else if status != "" {
		baseArgs = append(baseArgs, status)
		baseConds = append(baseConds, "m.status = $"+strconv.Itoa(len(baseArgs)))
	}
	baseWhere := "1=1"
	if len(baseConds) > 0 {
		baseWhere = strings.Join(baseConds, " AND ")
	}

	facets := h.projectsFacets(r.Context(), fromJoin, baseWhere, baseArgs, year)

	// Layer the hierarchy filters on top for the actual page of results.
	conds := append([]string{}, baseConds...)
	args := append([]interface{}{}, baseArgs...)
	if year != "" {
		args = append(args, year)
		conds = append(conds, "sp.academic_year = $"+strconv.Itoa(len(args)))
	}
	if tech != "" {
		args = append(args, tech)
		conds = append(conds, "mm.keywords @> ARRAY[$"+strconv.Itoa(len(args))+"]::text[]")
	}
	// Free-text search across title + abstract (powers the ⌘K palette and the
	// projects page search box).
	if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
		args = append(args, "%"+q+"%")
		conds = append(conds, "(m.title ILIKE $"+strconv.Itoa(len(args))+" OR COALESCE(mm.abstract, '') ILIKE $"+strconv.Itoa(len(args))+")")
	}
	whereClause := "1=1"
	if len(conds) > 0 {
		whereClause = strings.Join(conds, " AND ")
	}

	var total int
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*)`+fromJoin+` WHERE `+whereClause, args...).Scan(&total)

	dataArgs := append(append([]interface{}{}, args...), perPage, offset)
	query := `SELECT sp.project_id, sp.item_id, m.title, sp.team_members, sp.supervisor_id,
	                 sp.academic_year, sp.course_code, mm.abstract, mm.keywords,
	                 m.status, m.access_tier, m.file_path, m.created_by,
	                 sp.submitted_at, sp.approved_by, sp.approved_at,
	                 sp.web_url, sp.github_repo, sp.app_download` + fromJoin +
		` WHERE ` + whereClause +
		` ORDER BY sp.academic_year DESC, sp.submitted_at DESC` +
		` LIMIT $` + strconv.Itoa(len(args)+1) + ` OFFSET $` + strconv.Itoa(len(args)+2)

	rows, err := h.db.Query(r.Context(), query, dataArgs...)
	if err != nil {
		log.Printf("Failed to query projects: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to retrieve projects")
		return
	}
	defer rows.Close()

	var projects []StudentProject = make([]StudentProject, 0) // Initialize empty slice instead of nil
	for rows.Next() {
		var p StudentProject
		err := rows.Scan(
			&p.ProjectID, &p.ItemID, &p.Title, &p.TeamMembers, &p.SupervisorID,
			&p.AcademicYear, &p.CourseCode, &p.Abstract, &p.Keywords,
			&p.Status, &p.AccessTier, &p.FilePath, &p.CreatedBy,
			&p.SubmittedAt, &p.ApprovedBy, &p.ApprovedAt,
			&p.WebURL, &p.GithubRepo, &p.AppDownload,
		)
		if err != nil {
			log.Printf("Failed to scan project: %v", err)
			continue
		}
		projects = append(projects, p)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"data":        projects,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
		"facets":      facets,
	})
}

type facetBucket struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

// projectsFacets builds the year -> technology facet tree. Technologies live in
// media_metadata.keywords; the tech level only populates once a year is chosen.
func (h *Handler) projectsFacets(ctx context.Context, fromJoin, baseWhere string, baseArgs []interface{}, year string) map[string][]facetBucket {
	out := map[string][]facetBucket{"year": {}, "tech": {}}

	if rows, err := h.db.Query(ctx,
		`SELECT sp.academic_year, COUNT(*)`+fromJoin+` WHERE `+baseWhere+`
		 GROUP BY sp.academic_year ORDER BY sp.academic_year DESC`, baseArgs...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var y, c int
			if rows.Scan(&y, &c) == nil {
				ys := strconv.Itoa(y)
				out["year"] = append(out["year"], facetBucket{ys, ys, c})
			}
		}
	}

	if year != "" {
		tArgs := append(append([]interface{}{}, baseArgs...), year)
		if rows, err := h.db.Query(ctx,
			`SELECT kw, COUNT(*) FROM (
			   SELECT unnest(mm.keywords) AS kw`+fromJoin+`
			   WHERE `+baseWhere+` AND sp.academic_year = $`+strconv.Itoa(len(tArgs))+`
			 ) t WHERE kw <> '' GROUP BY kw ORDER BY COUNT(*) DESC, kw`, tArgs...); err == nil {
			defer rows.Close()
			for rows.Next() {
				var b facetBucket
				if rows.Scan(&b.Value, &b.Count) == nil {
					b.Label = b.Value
					out["tech"] = append(out["tech"], b)
				}
			}
		}
	}

	return out
}

// GET /api/v1/projects/{projectId}
func (h *Handler) GetProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := authpkg.GetUserID(r) // Optional auth
	roleTier, _ := authpkg.GetRoleTier(r)

	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}

	var p StudentProject
	err := h.db.QueryRow(r.Context(),
		`SELECT sp.project_id, sp.item_id, m.title, sp.team_members, sp.supervisor_id, 
		        sp.academic_year, sp.course_code, mm.abstract, mm.keywords, 
		        m.status, m.access_tier, m.file_path, m.created_by, 
		        sp.submitted_at, sp.approved_by, sp.approved_at,
		        sp.web_url, sp.github_repo, sp.app_download
		 FROM student_projects sp
		 JOIN media_items m ON sp.item_id = m.item_id
		 JOIN media_metadata mm ON m.item_id = mm.item_id
		 WHERE sp.project_id = $1`,
		projectID,
	).Scan(
		&p.ProjectID, &p.ItemID, &p.Title, &p.TeamMembers, &p.SupervisorID,
		&p.AcademicYear, &p.CourseCode, &p.Abstract, &p.Keywords,
		&p.Status, &p.AccessTier, &p.FilePath, &p.CreatedBy,
		&p.SubmittedAt, &p.ApprovedBy, &p.ApprovedAt,
		&p.WebURL, &p.GithubRepo, &p.AppDownload,
	)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	// Check access permissions
	if p.Status != "published" && userID == "" {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	// Non-admin users can only see published projects or their own
	if p.Status != "published" && userID != p.CreatedBy && roleTier != "administrator" && roleTier != "librarian" {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	writeJSON(w, http.StatusOK, p)
}

// POST /api/v1/projects/{projectId}/approve
func (h *Handler) ApproveProject(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Only staff can approve
	roleTier, _ := authpkg.GetRoleTier(r)
	if roleTier != "librarian" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "only staff can approve projects")
		return
	}

	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}

	var req struct {
		Approved bool   `json:"approved"`
		Notes    string `json:"notes,omitempty"`
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

	// Get item_id
	var itemID string
	err = tx.QueryRow(ctx,
		`SELECT item_id FROM student_projects WHERE project_id = $1`,
		projectID,
	).Scan(&itemID)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	// Update student_projects with approval info
	if req.Approved {
		_, err = tx.Exec(ctx,
			`UPDATE student_projects 
			 SET approved_by = $1, approved_at = NOW()
			 WHERE project_id = $2`,
			userID, projectID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update approval")
			return
		}
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
		"message": "project approval completed successfully",
		"status":  newStatus,
	})
}

// PUT /api/v1/projects/{projectId} — update student project
func (h *Handler) UpdateProject(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	projectID := chi.URLParam(r, "projectId")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}

	var req struct {
		Title        string   `json:"title"`
		TeamMembers  []string `json:"team_members"`
		SupervisorID *string  `json:"supervisor_id"`
		AcademicYear int      `json:"academic_year"`
		CourseCode   *string  `json:"course_code"`
		Abstract     string   `json:"abstract"`
		Keywords     []string `json:"keywords"`
		WebURL       *string  `json:"web_url"`
		GithubRepo   *string  `json:"github_repo"`
		AppDownload  *string  `json:"app_download"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Validate required fields
	if req.Title == "" || len(req.TeamMembers) == 0 || req.Abstract == "" {
		writeError(w, http.StatusBadRequest, "title, team_members, and abstract are required")
		return
	}

	if req.AcademicYear < 2000 || req.AcademicYear > 2100 {
		writeError(w, http.StatusBadRequest, "academic_year must be between 2000 and 2100")
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
		`SELECT sp.item_id, m.created_by 
		 FROM student_projects sp
		 JOIN media_items m ON m.item_id = sp.item_id
		 WHERE sp.project_id = $1`,
		projectID,
	).Scan(&itemID, &createdBy)
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return
	}

	if createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only update your own projects")
		return
	}

	// FR-TXX-015: archive the pre-edit state. The edit dialog writes straight
	// to media_items/media_metadata, so without this the item's history stays
	// empty no matter how many times the author revises it.
	versioning.Snapshot(ctx, h.db, itemID, userID, "project edited")

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

	// Update student_projects
	_, err = tx.Exec(ctx,
		`UPDATE student_projects 
		 SET team_members = $1, supervisor_id = $2, academic_year = $3, course_code = $4, web_url = $5, github_repo = $6, app_download = $7
		 WHERE project_id = $8`,
		req.TeamMembers, req.SupervisorID, req.AcademicYear, req.CourseCode, req.WebURL, req.GithubRepo, req.AppDownload, projectID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update project")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit transaction")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "project updated successfully",
	})
}
