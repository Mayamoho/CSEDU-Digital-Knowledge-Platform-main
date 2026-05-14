// Package admin provides endpoints for user management and audit log access.
// All routes require staff or admin role — enforced by middleware in main.go.
package admin

import (
	"encoding/csv"
	"encoding/json"
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

// ── GET /api/v1/admin/users ───────────────────────────────────────────────────
// List all users (admin/staff only).
func (h *Handler) ListUsers(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 20
	}
	offset := (page - 1) * perPage

	var total int
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT user_id, email, name, role_tier,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(last_login,  'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM users
		 ORDER BY created_at DESC
		 LIMIT $1 OFFSET $2`, perPage, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type userRow struct {
		UserID    string  `json:"user_id"`
		Email     string  `json:"email"`
		Name      string  `json:"name"`
		RoleTier  string  `json:"role_tier"`
		CreatedAt string  `json:"created_at"`
		LastLogin *string `json:"last_login"`
	}
	users := []userRow{}
	for rows.Next() {
		var u userRow
		if err := rows.Scan(&u.UserID, &u.Email, &u.Name, &u.RoleTier, &u.CreatedAt, &u.LastLogin); err != nil {
			continue
		}
		users = append(users, u)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":     users,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// ── PATCH /api/v1/admin/users/{userId}/role ───────────────────────────────────
// Change a user's role tier (admin only).
func (h *Handler) UpdateUserRole(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "userId")
	actorID, _ := authpkg.GetUserID(r)

	var req struct {
		RoleTier string `json:"role_tier"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	validRoles := map[string]bool{
		"public": true, "member": true, "staff": true, "admin": true, "ai_admin": true,
	}
	if !validRoles[req.RoleTier] {
		writeError(w, http.StatusBadRequest, "invalid role_tier")
		return
	}

	// Prevent self-demotion
	if targetID == actorID {
		writeError(w, http.StatusBadRequest, "cannot change your own role")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE users SET role_tier = $1 WHERE user_id = $2`,
		req.RoleTier, targetID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	// Audit log
	_, _ = h.db.Exec(r.Context(),
		`INSERT INTO audit_log (actor_id, action, resource_type, resource_id)
		 VALUES ($1, $2, 'user', $3)`,
		actorID, "role_change:"+req.RoleTier, targetID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "role updated"})
}

// ── GET /api/v1/admin/audit-log ───────────────────────────────────────────────
// Paginated audit log (admin only).
func (h *Handler) ListAuditLog(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	perPage, _ := strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 50
	}
	offset := (page - 1) * perPage

	var total int
	_ = h.db.QueryRow(r.Context(), `SELECT COUNT(*) FROM audit_log`).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT al.log_id, al.actor_id, u.email, al.action,
		        al.resource_type, al.resource_id, al.ip_addr,
		        to_char(al.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM audit_log al
		 LEFT JOIN users u ON u.user_id = al.actor_id
		 ORDER BY al.created_at DESC
		 LIMIT $1 OFFSET $2`, perPage, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type logRow struct {
		LogID        string  `json:"log_id"`
		ActorID      *string `json:"actor_id"`
		ActorEmail   *string `json:"actor_email"`
		Action       string  `json:"action"`
		ResourceType string  `json:"resource_type"`
		ResourceID   *string `json:"resource_id"`
		IPAddr       *string `json:"ip_addr"`
		CreatedAt    string  `json:"created_at"`
	}
	logs := []logRow{}
	for rows.Next() {
		var l logRow
		if err := rows.Scan(&l.LogID, &l.ActorID, &l.ActorEmail, &l.Action,
			&l.ResourceType, &l.ResourceID, &l.IPAddr, &l.CreatedAt); err != nil {
			continue
		}
		logs = append(logs, l)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":     logs,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// ── GET /api/v1/admin/catalog/export ─────────────────────────────────────────
// Export full library catalog as CSV (staff/admin only).
func (h *Handler) ExportCatalogCSV(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT catalog_id, title, author, COALESCE(isbn,''), format,
		        COALESCE(location,''), COALESCE(year::text,''),
		        total_copies, available_copies
		 FROM library_catalog
		 ORDER BY title`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "text/csv")
	w.Header().Set("Content-Disposition", `attachment; filename="catalog.csv"`)

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{
		"catalog_id", "title", "author", "isbn", "format",
		"location", "year", "total_copies", "available_copies",
	})

	for rows.Next() {
		var id, title, author, isbn, format, location, year string
		var total, available int
		if err := rows.Scan(&id, &title, &author, &isbn, &format,
			&location, &year, &total, &available); err != nil {
			continue
		}
		_ = cw.Write([]string{
			id, title, author, isbn, format, location, year,
			strconv.Itoa(total), strconv.Itoa(available),
		})
	}
	cw.Flush()
}

// ── POST /api/v1/admin/catalog/import ────────────────────────────────────────
// Bulk import library catalog from CSV (staff/admin only).
// CSV columns: title, author, isbn, format, location, year, total_copies
// catalog_id is auto-generated; existing rows matched by isbn are upserted.
func (h *Handler) ImportCatalogCSV(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "invalid form data")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	cr := csv.NewReader(file)
	cr.TrimLeadingSpace = true

	header, err := cr.Read()
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read CSV header")
		return
	}

	// Build column index map (case-insensitive)
	colIdx := map[string]int{}
	for i, h := range header {
		colIdx[strings.ToLower(strings.TrimSpace(h))] = i
	}
	required := []string{"title", "author"}
	for _, col := range required {
		if _, ok := colIdx[col]; !ok {
			writeError(w, http.StatusBadRequest, "CSV missing required column: "+col)
			return
		}
	}

	get := func(row []string, col string) string {
		i, ok := colIdx[col]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	inserted, updated, skipped := 0, 0, 0

	records, err := cr.ReadAll()
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not parse CSV")
		return
	}

	for _, row := range records {
		title := get(row, "title")
		author := get(row, "author")
		if title == "" || author == "" {
			skipped++
			continue
		}

		isbn := get(row, "isbn")
		format := get(row, "format")
		if format == "" {
			format = "book"
		}
		location := get(row, "location")
		yearStr := get(row, "year")
		totalStr := get(row, "total_copies")

		var yearVal *int
		if y, err := strconv.Atoi(yearStr); err == nil && y > 1900 {
			yearVal = &y
		}
		totalCopies := 1
		if t, err := strconv.Atoi(totalStr); err == nil && t > 0 {
			totalCopies = t
		}

		if isbn != "" {
			// Upsert by ISBN
			tag, err := h.db.Exec(r.Context(),
				`INSERT INTO library_catalog
				   (title, author, isbn, format, location, year, total_copies, available_copies)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
				 ON CONFLICT (isbn) DO UPDATE SET
				   title            = EXCLUDED.title,
				   author           = EXCLUDED.author,
				   format           = EXCLUDED.format,
				   location         = EXCLUDED.location,
				   year             = EXCLUDED.year,
				   total_copies     = EXCLUDED.total_copies`,
				title, author, isbn, format, location, yearVal, totalCopies)
			if err != nil {
				skipped++
				continue
			}
			if tag.RowsAffected() > 0 {
				updated++
			} else {
				inserted++
			}
		} else {
			// No ISBN — always insert
			_, err := h.db.Exec(r.Context(),
				`INSERT INTO library_catalog
				   (title, author, format, location, year, total_copies, available_copies)
				 VALUES ($1,$2,$3,$4,$5,$6,$6)`,
				title, author, format, location, yearVal, totalCopies)
			if err != nil {
				skipped++
				continue
			}
			inserted++
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"inserted": inserted,
		"updated":  updated,
		"skipped":  skipped,
		"total":    len(records),
	})
}

// ── PATCH /api/v1/admin/media/{itemId}/status ─────────────────────────────────
// Approve/publish or archive a media item (staff/admin only).
func (h *Handler) UpdateMediaStatus(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "itemId")
	actorID, _ := authpkg.GetUserID(r)

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	validStatuses := map[string]bool{
		"draft": true, "review": true, "published": true, "archived": true,
	}
	if !validStatuses[req.Status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}

	tag, err := h.db.Exec(r.Context(),
		`UPDATE media_items SET status = $1 WHERE item_id = $2`,
		req.Status, itemID)
	if err != nil || tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "media item not found")
		return
	}

	_, _ = h.db.Exec(r.Context(),
		`INSERT INTO audit_log (actor_id, action, resource_type, resource_id)
		 VALUES ($1, $2, 'media_item', $3)`,
		actorID, "status_change:"+req.Status, itemID)

	writeJSON(w, http.StatusOK, map[string]string{"message": "status updated"})
}
