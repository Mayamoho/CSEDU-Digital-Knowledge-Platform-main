package media

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/notify"
	"github.com/csedu/platform/api/internal/storage"
)

// SDD Flow 1: per-type upload limits — PDF ≤ 100 MB, video ≤ 200 MB,
// everything else 50 MB. maxUploadSize is the request-body ceiling.
const (
	defaultUploadSize = 50 << 20  // 50 MB
	pdfUploadSize     = 100 << 20 // 100 MB
	videoUploadSize   = 200 << 20 // 200 MB
	maxUploadSize     = videoUploadSize
)

// sizeLimitFor returns the byte limit for a file extension.
func sizeLimitFor(ext string) int64 {
	switch ext {
	case "pdf":
		return pdfUploadSize
	case "mp4":
		return videoUploadSize
	default:
		return defaultUploadSize
	}
}

type Handler struct {
	db    *pgxpool.Pool
	minio *storage.MinioClient
	redis *redis.Client
}

func NewHandler(db *pgxpool.Pool, minio *storage.MinioClient, redis *redis.Client) *Handler {
	return &Handler{db: db, minio: minio, redis: redis}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

type mediaItemResponse struct {
	ItemID      string  `json:"item_id"`
	Title       string  `json:"title"`
	ItemType    string  `json:"item_type"`
	Format      string  `json:"format"`
	Status      string  `json:"status"`
	AccessTier  string  `json:"access_tier"`
	CreatedBy   *string `json:"created_by"`
	FilePath    *string `json:"file_path"`
	ExternalURL *string `json:"external_url,omitempty"`
	UploadDate  string  `json:"upload_date"`
	PaperID     *string `json:"paper_id,omitempty"`
	ProjectID   *string `json:"project_id,omitempty"`
	ReviewerID  *string `json:"reviewer_id,omitempty"`
	ReviewNotes *string `json:"review_notes,omitempty"`
	ReviewedAt  *string `json:"reviewed_at,omitempty"`
}

type mediaWithMeta struct {
	mediaItemResponse
	Metadata metadataResponse `json:"metadata"`
}

type metadataResponse struct {
	MetaID   string   `json:"meta_id"`
	ItemID   string   `json:"item_id"`
	Tags     []string `json:"tags"`
	Abstract string   `json:"abstract"`
	Keywords []string `json:"keywords"`
	Language string   `json:"language"`
}

// POST /api/v1/media/upload
func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1024)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large or invalid form data")
		return
	}

	externalURL := strings.TrimSpace(r.FormValue("external_url"))

	file, header, fileErr := r.FormFile("file")
	hasFile := fileErr == nil
	if hasFile {
		defer file.Close()
	} else if externalURL == "" {
		// File is optional (e.g. archives submitted as an external link),
		// but at least one of file or external URL must be provided.
		writeError(w, http.StatusBadRequest, "either a file or an external URL is required")
		return
	}

	if hasFile {
		uploadExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
		if limit := sizeLimitFor(uploadExt); header.Size > limit {
			writeError(w, http.StatusRequestEntityTooLarge,
				fmt.Sprintf("file exceeds the %d MB limit for .%s uploads", limit>>20, uploadExt))
			return
		}
	}

	// Metadata from form fields
	title := strings.TrimSpace(r.FormValue("title"))
	abstract := r.FormValue("abstract")
	keywords := r.FormValue("keywords") // comma-separated
	accessTier := r.FormValue("access_tier")
	language := r.FormValue("language")
	itemType := r.FormValue("item_type") // archive | research | project
	status := r.FormValue("status")      // draft | review | published | archived

	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	// Defaults - Updated for SDD role system
	validTiers := map[string]bool{"public": true, "student": true, "researcher": true, "librarian": true, "restricted": true}
	if !validTiers[accessTier] {
		accessTier = "public"
	}
	validTypes := map[string]bool{"archive": true, "research": true, "project": true}
	if !validTypes[itemType] {
		itemType = "archive"
	}
	validStatuses := map[string]bool{"draft": true, "review": true, "published": true, "archived": true}
	if !validStatuses[status] {
		status = "draft"
	}
	if language == "" {
		language = "en"
	}

	// Default format for external-link-only submissions (no file uploaded).
	// Must be a value allowed by the chk_media_format DB constraint.
	ext := "url"
	var storedKey *string
	if hasFile {
		ext = strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
		allowedExts := map[string]bool{
			"pdf": true, "docx": true, "doc": true, "pptx": true, "ppt": true,
			"xlsx": true, "xls": true, "mp4": true, "mp3": true,
			"jpg": true, "jpeg": true, "png": true, "gif": true,
			"zip": true, "apk": true,
		}
		if !allowedExts[ext] {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported file format: %s", ext))
			return
		}
		// Normalise jpeg
		if ext == "jpeg" {
			ext = "jpg"
		}

		// Upload to MinIO
		objectKey := fmt.Sprintf("uploads/%s/%s.%s", userID, uuid.New().String(), ext)
		contentType := header.Header.Get("Content-Type")
		if contentType == "" {
			contentType = "application/octet-stream"
		}
		key, uploadErr := h.minio.Upload(r.Context(), objectKey, contentType, file, header.Size)
		if uploadErr != nil {
			writeError(w, http.StatusInternalServerError, "file storage failed")
			return
		}
		storedKey = &key
	}

	// Insert media_item + media_metadata in a transaction
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var extURLParam *string
	if externalURL != "" {
		extURLParam = &externalURL
	}

	var itemID, uploadDate string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO media_items (title, item_type, format, status, access_tier, created_by, file_path, external_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING item_id, to_char(upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		title, itemType, ext, status, accessTier, userID, storedKey, extURLParam,
	).Scan(&itemID, &uploadDate); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save media item")
		return
	}

	// Parse keywords
	kwSlice := []string{}
	for _, kw := range strings.Split(keywords, ",") {
		if kw = strings.TrimSpace(kw); kw != "" {
			kwSlice = append(kwSlice, kw)
		}
	}

	if _, err := tx.Exec(r.Context(),
		`INSERT INTO media_metadata (item_id, abstract, keywords, language)
		 VALUES ($1, $2, $3, $4)`,
		itemID, abstract, kwSlice, language,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save metadata")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	// Queue ingestion so the RAG assistant can answer about this item right away.
	// Link-only and image items are queued too: the indexer cannot read their
	// contents, but it embeds their title/abstract/keywords/URL so the assistant
	// can still say what they are.
	storedPath := ""
	if storedKey != nil {
		storedPath = *storedKey
	}
	h.queueIngestion(r.Context(), itemID, storedPath, ext, userID)

	writeJSON(w, http.StatusCreated, mediaItemResponse{
		ItemID:      itemID,
		Title:       title,
		ItemType:    itemType,
		Format:      ext,
		Status:      status,
		AccessTier:  accessTier,
		CreatedBy:   &userID,
		FilePath:    storedKey,
		ExternalURL: extURLParam,
		UploadDate:  uploadDate,
	})
}

// GET /api/v1/media
func (h *Handler) ListMedia(w http.ResponseWriter, r *http.Request) {
	roleTier, _ := r.Context().Value(authpkg.CtxRoleTier).(string)

	q := r.URL.Query().Get("q")
	itemType := r.URL.Query().Get("item_type")
	// Hierarchy: format -> access tier -> year (year of upload_date).
	format := r.URL.Query().Get("format")
	access := r.URL.Query().Get("access")
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

	where := []string{"m.status = 'published'"}
	args := []any{}
	argIdx := 1

	// RBAC access tier filter - Updated for SDD role system
	switch roleTier {
	case "researcher", "librarian", "administrator":
		// can see all tiers
	case "student":
		where = append(where, `m.access_tier IN ('public', 'student')`)
	default: // public / unauthenticated
		where = append(where, `m.access_tier = 'public'`)
	}

	if q != "" {
		where = append(where,
			`(to_tsvector('english', m.title) @@ plainto_tsquery('english', $`+strconv.Itoa(argIdx)+`)
			 OR EXISTS (
			   SELECT 1 FROM media_metadata md
			   WHERE md.item_id = m.item_id
			   AND to_tsvector('english', md.abstract || ' ' || array_to_string(md.keywords, ' '))
			       @@ plainto_tsquery('english', $`+strconv.Itoa(argIdx)+`)
			 ))`)
		args = append(args, q)
		argIdx++
	}
	if itemType != "" {
		where = append(where, `m.item_type = $`+strconv.Itoa(argIdx))
		args = append(args, itemType)
		argIdx++
	}

	// Snapshot the base (RBAC + q + item_type) for facet counts, then layer the
	// hierarchy filters on top for the actual result set.
	baseWhere := strings.Join(where, " AND ")
	baseArgs := make([]any, len(args))
	copy(baseArgs, args)
	facets := h.mediaFacets(r.Context(), baseWhere, baseArgs, format, access)

	if format != "" {
		where = append(where, `m.format = $`+strconv.Itoa(argIdx))
		args = append(args, format)
		argIdx++
	}
	if access != "" {
		where = append(where, `m.access_tier = $`+strconv.Itoa(argIdx))
		args = append(args, access)
		argIdx++
	}
	if year != "" {
		where = append(where, `EXTRACT(YEAR FROM m.upload_date)::int = $`+strconv.Itoa(argIdx))
		if y, err := strconv.Atoi(year); err == nil {
			args = append(args, y)
			argIdx++
		} else {
			where = where[:len(where)-1]
		}
	}

	whereClause := strings.Join(where, " AND ")

	countArgs := make([]any, len(args))
	copy(countArgs, args)
	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM media_items m WHERE `+whereClause, countArgs...).Scan(&total)

	args = append(args, perPage, offset)
	rows, err := h.db.Query(r.Context(),
		`SELECT m.item_id, m.title, m.item_type, m.format, m.status,
		        m.access_tier, m.created_by, m.file_path, m.external_url,
		        to_char(m.upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM media_items m
		 WHERE `+whereClause+`
		 ORDER BY m.upload_date DESC
		 LIMIT $`+strconv.Itoa(argIdx)+` OFFSET $`+strconv.Itoa(argIdx+1),
		args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	items := []mediaItemResponse{}
	for rows.Next() {
		var it mediaItemResponse
		if err := rows.Scan(&it.ItemID, &it.Title, &it.ItemType, &it.Format,
			&it.Status, &it.AccessTier, &it.CreatedBy, &it.FilePath, &it.ExternalURL, &it.UploadDate); err != nil {
			continue
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

type facetBucket struct {
	Value string `json:"value"`
	Label string `json:"label"`
	Count int    `json:"count"`
}

var accessTierLabels = map[string]string{
	"public": "Public", "student": "Students", "researcher": "Researchers",
	"librarian": "Staff Only", "restricted": "Restricted",
}

func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

// mediaFacets builds the format -> access tier -> year facet tree for the
// archive/media listing. baseWhere/baseArgs carry the RBAC + search + item_type
// predicates; each level then layers the selections above it.
func (h *Handler) mediaFacets(ctx context.Context, baseWhere string, baseArgs []any, format, access string) map[string][]facetBucket {
	out := map[string][]facetBucket{"format": {}, "access": {}, "year": {}}

	// Level 1: format (base only).
	if rows, err := h.db.Query(ctx,
		`SELECT m.format, COUNT(*) FROM media_items m WHERE `+baseWhere+`
		 GROUP BY m.format ORDER BY COUNT(*) DESC, m.format`, baseArgs...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var b facetBucket
			if rows.Scan(&b.Value, &b.Count) == nil {
				b.Label = titleCase(b.Value)
				out["format"] = append(out["format"], b)
			}
		}
	}

	// Level 2: access tier within selected format.
	aWhere := baseWhere
	aArgs := append([]any{}, baseArgs...)
	if format != "" {
		aArgs = append(aArgs, format)
		aWhere += ` AND m.format = $` + strconv.Itoa(len(aArgs))
	}
	if rows, err := h.db.Query(ctx,
		`SELECT m.access_tier, COUNT(*) FROM media_items m WHERE `+aWhere+`
		 GROUP BY m.access_tier ORDER BY COUNT(*) DESC`, aArgs...); err == nil {
		defer rows.Close()
		for rows.Next() {
			var b facetBucket
			if rows.Scan(&b.Value, &b.Count) == nil {
				if lbl, ok := accessTierLabels[b.Value]; ok {
					b.Label = lbl
				} else {
					b.Label = titleCase(b.Value)
				}
				out["access"] = append(out["access"], b)
			}
		}
	}

	// Level 3: year within format + access (only once a format is chosen).
	if format != "" {
		yWhere := aWhere
		yArgs := append([]any{}, aArgs...)
		if access != "" {
			yArgs = append(yArgs, access)
			yWhere += ` AND m.access_tier = $` + strconv.Itoa(len(yArgs))
		}
		if rows, err := h.db.Query(ctx,
			`SELECT EXTRACT(YEAR FROM m.upload_date)::int AS y, COUNT(*)
			 FROM media_items m WHERE `+yWhere+`
			 GROUP BY y ORDER BY y DESC`, yArgs...); err == nil {
			defer rows.Close()
			for rows.Next() {
				var y, c int
				if rows.Scan(&y, &c) == nil {
					ys := strconv.Itoa(y)
					out["year"] = append(out["year"], facetBucket{ys, ys, c})
				}
			}
		}
	}

	return out
}

// GET /api/v1/media/{itemId}
func (h *Handler) GetMedia(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	roleTier, _ := r.Context().Value(authpkg.CtxRoleTier).(string)

	var it mediaItemResponse
	var metaID, abstract, language string
	var tags, keywords []string

	err := h.db.QueryRow(r.Context(),
		`SELECT m.item_id, m.title, m.item_type, m.format, m.status,
		        m.access_tier, m.created_by, m.file_path, m.external_url,
		        to_char(m.upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        mm.meta_id, mm.abstract, mm.tags, mm.keywords, mm.language
		 FROM media_items m
		 LEFT JOIN media_metadata mm ON mm.item_id = m.item_id
		 WHERE m.item_id = $1`, id,
	).Scan(&it.ItemID, &it.Title, &it.ItemType, &it.Format, &it.Status,
		&it.AccessTier, &it.CreatedBy, &it.FilePath, &it.ExternalURL, &it.UploadDate,
		&metaID, &abstract, &tags, &keywords, &language)
	if err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}

	// Access control - Updated for SDD role system
	switch it.AccessTier {
	case "student":
		if roleTier == "" || roleTier == "public" {
			writeError(w, http.StatusForbidden, "students only")
			return
		}
	case "researcher":
		if roleTier != "researcher" && roleTier != "librarian" && roleTier != "administrator" {
			writeError(w, http.StatusForbidden, "researchers only")
			return
		}
	case "librarian":
		if roleTier != "librarian" && roleTier != "administrator" {
			writeError(w, http.StatusForbidden, "librarians only")
			return
		}
	case "restricted":
		if roleTier != "administrator" {
			writeError(w, http.StatusForbidden, "restricted content")
			return
		}
	}

	writeJSON(w, http.StatusOK, mediaWithMeta{
		mediaItemResponse: it,
		Metadata: metadataResponse{
			MetaID:   metaID,
			ItemID:   id,
			Tags:     tags,
			Abstract: abstract,
			Keywords: keywords,
			Language: language,
		},
	})
}

func isImageFormat(format string) bool {
	switch strings.ToLower(format) {
	case "jpg", "jpeg", "png", "gif":
		return true
	}
	return false
}

// GET /api/v1/media/{itemId}/download — streams the file directly to the client
func (h *Handler) Download(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")

	var filePath, title, format string
	if err := h.db.QueryRow(r.Context(),
		`SELECT file_path, title, format FROM media_items WHERE item_id = $1`, id,
	).Scan(&filePath, &title, &format); err != nil || filePath == "" {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}

	// Stream the object directly from MinIO to the client
	obj, err := h.minio.GetObject(r.Context(), filePath)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not retrieve file")
		return
	}
	defer obj.Close()

	// Set appropriate headers for download
	contentType := "application/octet-stream"
	switch format {
	case "pdf":
		contentType = "application/pdf"
	case "docx":
		contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case "doc":
		contentType = "application/msword"
	case "pptx":
		contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	case "zip":
		contentType = "application/zip"
	case "mp4":
		contentType = "video/mp4"
	case "jpg", "jpeg":
		contentType = "image/jpeg"
	case "png":
		contentType = "image/png"
	case "gif":
		contentType = "image/gif"
	}

	// Remember who took a copy, so they can be told if the author later revises
	// it. Anonymous reads are not recorded — there is nobody to notify.
	if userID, ok := authpkg.GetUserID(r); ok {
		notify.RecordDownload(r.Context(), h.db, id, userID)
	}

	// ?inline=1 renders the file in the browser instead of forcing a download.
	// Only honoured for image formats, so other types still download as before.
	disposition := "attachment"
	if r.URL.Query().Get("inline") == "1" && isImageFormat(format) {
		disposition = "inline"
	}

	filename := title + "." + format
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", disposition+`; filename="`+filename+`"`)
	w.Header().Set("Cache-Control", "private, max-age=3600")

	if _, err := io.Copy(w, obj); err != nil {
		// Client likely disconnected; log but don't write error (headers already sent)
		fmt.Printf("Download stream error for %s: %v\n", id, err)
	}
}

// PATCH /api/v1/media/{itemId}/metadata
func (h *Handler) UpdateMetadata(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	userID, _ := authpkg.GetUserID(r)

	// Verify ownership or librarian/administrator
	var createdBy string
	roleTier, _ := authpkg.GetRoleTier(r)
	_ = h.db.QueryRow(r.Context(),
		`SELECT created_by FROM media_items WHERE item_id = $1`, id,
	).Scan(&createdBy)

	if createdBy != userID && roleTier != "librarian" && roleTier != "administrator" {
		writeError(w, http.StatusForbidden, "not allowed")
		return
	}

	var req struct {
		Title       *string  `json:"title"`
		Abstract    *string  `json:"abstract"`
		Keywords    []string `json:"keywords"`
		Tags        []string `json:"tags"`
		Language    *string  `json:"language"`
		AccessTier  *string  `json:"access_tier"`
		Status      *string  `json:"status"`
		ExternalURL *string  `json:"external_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	// FR-TXX-015: archive the pre-edit state before touching anything, so the
	// previous version stays retrievable.
	h.snapshotVersion(r.Context(), id, userID, "metadata edit")

	// Update title if provided
	if req.Title != nil && *req.Title != "" {
		_, err := h.db.Exec(r.Context(),
			`UPDATE media_items SET title = $1 WHERE item_id = $2`,
			*req.Title, id,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not update title")
			return
		}
	}

	// Update access tier if provided (validated against the allowed set).
	if req.AccessTier != nil && *req.AccessTier != "" {
		validTiers := map[string]bool{"public": true, "student": true, "researcher": true, "librarian": true, "restricted": true}
		if !validTiers[*req.AccessTier] {
			writeError(w, http.StatusBadRequest, "invalid access tier")
			return
		}
		if _, err := h.db.Exec(r.Context(),
			`UPDATE media_items SET access_tier = $1 WHERE item_id = $2`,
			*req.AccessTier, id); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update access tier")
			return
		}
	}

	// Update the external link if provided. An empty string clears it, which is
	// how an archive entry that gained a real file drops its placeholder link;
	// omitting the field entirely leaves the current value alone.
	if req.ExternalURL != nil {
		trimmed := strings.TrimSpace(*req.ExternalURL)
		var urlArg *string
		if trimmed != "" {
			// Only http(s) — a javascript: or data: URL here would render as a
			// clickable link on the item page.
			lower := strings.ToLower(trimmed)
			if !strings.HasPrefix(lower, "http://") && !strings.HasPrefix(lower, "https://") {
				writeError(w, http.StatusBadRequest, "external URL must start with http:// or https://")
				return
			}
			urlArg = &trimmed
		}
		if _, err := h.db.Exec(r.Context(),
			`UPDATE media_items SET external_url = $1 WHERE item_id = $2`,
			urlArg, id); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update external URL")
			return
		}
	}

	// Update publication status if provided (draft/review/published/archived).
	if req.Status != nil && *req.Status != "" {
		validStatuses := map[string]bool{"draft": true, "review": true, "published": true, "archived": true}
		if !validStatuses[*req.Status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
		if _, err := h.db.Exec(r.Context(),
			`UPDATE media_items SET status = $1 WHERE item_id = $2`,
			*req.Status, id); err != nil {
			writeError(w, http.StatusInternalServerError, "could not update status")
			return
		}
	}

	// Explicit casts are required: without them Postgres infers $3/$4 from the
	// untyped '{}' literal as plain text (not text[]), so pgx fails to encode the
	// []string and the whole update errors out.
	_, err := h.db.Exec(r.Context(),
		`INSERT INTO media_metadata (item_id, abstract, keywords, tags, language)
		 VALUES ($1, COALESCE($2::text,''), COALESCE($3::text[],'{}'::text[]),
		         COALESCE($4::text[],'{}'::text[]), COALESCE($5::text,'en'))
		 ON CONFLICT (item_id) DO UPDATE SET
		   abstract = COALESCE(EXCLUDED.abstract, media_metadata.abstract),
		   keywords = COALESCE(EXCLUDED.keywords, media_metadata.keywords),
		   tags     = COALESCE(EXCLUDED.tags,     media_metadata.tags),
		   language = COALESCE(EXCLUDED.language, media_metadata.language)`,
		id, req.Abstract, req.Keywords, req.Tags, req.Language,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not update metadata")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "metadata updated"})
}

// GET /api/v1/media/my-uploads — list the authenticated user's own uploads
func (h *Handler) MyUploads(w http.ResponseWriter, r *http.Request) {
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
		perPage = 12
	}
	offset := (page - 1) * perPage

	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM media_items WHERE created_by = $1`, userID).Scan(&total)

	rows, err := h.db.Query(r.Context(),
		`SELECT m.item_id, m.title, m.item_type, m.format, m.status, m.access_tier,
		        m.created_by, m.file_path, m.external_url,
		        to_char(m.upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        rp.paper_id, sp.project_id,
		        rp.reviewer_id, rp.review_notes,
		        to_char(rp.reviewed_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM media_items m
		 LEFT JOIN research_papers rp ON m.item_id = rp.item_id
		 LEFT JOIN student_projects sp ON m.item_id = sp.item_id
		 WHERE m.created_by = $1
		 ORDER BY m.upload_date DESC
		 LIMIT $2 OFFSET $3`, userID, perPage, offset)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	items := []mediaItemResponse{}
	for rows.Next() {
		var it mediaItemResponse
		if err := rows.Scan(&it.ItemID, &it.Title, &it.ItemType, &it.Format,
			&it.Status, &it.AccessTier, &it.CreatedBy, &it.FilePath, &it.ExternalURL, &it.UploadDate,
			&it.PaperID, &it.ProjectID, &it.ReviewerID, &it.ReviewNotes, &it.ReviewedAt); err != nil {
			continue
		}
		items = append(items, it)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"data":        items,
		"total":       total,
		"page":        page,
		"per_page":    perPage,
		"total_pages": int(math.Ceil(float64(total) / float64(perPage))),
	})
}

// POST /api/v1/media/{itemId}/file — replace the stored file of an existing
// media item (owner only). Used to re-upload a revised research paper PDF.
func (h *Handler) ReplaceFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id := chi.URLParam(r, "itemId")

	var createdBy *string
	if err := h.db.QueryRow(r.Context(),
		`SELECT created_by FROM media_items WHERE item_id = $1`, id,
	).Scan(&createdBy); err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if createdBy == nil || *createdBy != userID {
		writeError(w, http.StatusForbidden, "you can only replace files on your own uploads")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize+1024)
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "file too large or invalid form data")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "a file is required")
		return
	}
	defer file.Close()

	if replaceExt := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), ".")); header.Size > sizeLimitFor(replaceExt) {
		writeError(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("file exceeds the %d MB limit for .%s uploads", sizeLimitFor(replaceExt)>>20, replaceExt))
		return
	}

	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(header.Filename), "."))
	allowedExts := map[string]bool{
		"pdf": true, "docx": true, "doc": true, "pptx": true, "ppt": true,
		"xlsx": true, "xls": true, "mp4": true, "mp3": true,
		"jpg": true, "jpeg": true, "png": true, "gif": true,
		"zip": true, "apk": true,
	}
	if !allowedExts[ext] {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported file format: %s", ext))
		return
	}
	if ext == "jpeg" {
		ext = "jpg"
	}

	objectKey := fmt.Sprintf("uploads/%s/%s.%s", userID, uuid.New().String(), ext)
	contentType := header.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	key, uploadErr := h.minio.Upload(r.Context(), objectKey, contentType, file, header.Size)
	if uploadErr != nil {
		writeError(w, http.StatusInternalServerError, "file storage failed")
		return
	}

	// FR-TXX-015: keep the superseded file reference in the version history.
	h.snapshotVersion(r.Context(), id, userID, "file replaced")

	if _, err := h.db.Exec(r.Context(),
		`UPDATE media_items SET file_path = $1, format = $2 WHERE item_id = $3`,
		key, ext, id,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "could not update media item")
		return
	}

	// Re-queue ingestion so search/RAG picks up the new file content
	h.queueIngestion(r.Context(), id, key, ext, userID)

	writeJSON(w, http.StatusOK, map[string]string{
		"message":   "file replaced successfully",
		"file_path": key,
		"format":    ext,
	})
}

// DELETE /api/v1/media/{itemId} — permanently delete a media item the caller
// owns (administrators/librarians may delete any). The media_items row cascades
// to research_papers, student_projects and vector_embeddings (RAG context) via
// ON DELETE CASCADE, so this single delete also removes the resource from the
// assistant's knowledge everywhere. resource_reviews has no FK, so it is cleared
// explicitly. The stored file is best-effort removed from object storage.
func (h *Handler) DeleteMedia(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleTier, _ := authpkg.GetRoleTier(r)

	id := chi.URLParam(r, "itemId")

	var createdBy *string
	var filePath *string
	if err := h.db.QueryRow(r.Context(),
		`SELECT created_by, file_path FROM media_items WHERE item_id = $1`, id,
	).Scan(&createdBy, &filePath); err != nil {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}

	isOwner := createdBy != nil && *createdBy == userID
	isModerator := roleTier == "administrator" || roleTier == "librarian"
	if !isOwner && !isModerator {
		writeError(w, http.StatusForbidden, "you can only delete your own uploads")
		return
	}

	// resource_reviews is keyed by item_id with no FK, so clear it first.
	if _, err := h.db.Exec(r.Context(),
		`DELETE FROM resource_reviews WHERE item_id = $1`, id); err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete reviews")
		return
	}

	// Cascades to research_papers, student_projects, vector_embeddings.
	ct, err := h.db.Exec(r.Context(),
		`DELETE FROM media_items WHERE item_id = $1`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not delete item")
		return
	}
	if ct.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}

	// Best-effort remove the stored file; a storage error must not fail the
	// request since the database record is already gone.
	if filePath != nil && *filePath != "" && h.minio != nil {
		if err := h.minio.Remove(r.Context(), *filePath); err != nil {
			fmt.Printf("Failed to remove object %s: %v\n", *filePath, err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "item deleted"})
}
