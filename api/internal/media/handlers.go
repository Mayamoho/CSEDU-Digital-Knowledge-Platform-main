package media

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/storage"
)

const maxUploadSize = 50 << 20 // 50 MB

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
	ItemID     string  `json:"item_id"`
	Title      string  `json:"title"`
	ItemType   string  `json:"item_type"`
	Format     string  `json:"format"`
	Status     string  `json:"status"`
	AccessTier string  `json:"access_tier"`
	CreatedBy  *string `json:"created_by"`
	FilePath   *string `json:"file_path"`
	UploadDate string  `json:"upload_date"`
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
		writeError(w, http.StatusBadRequest, "file too large or invalid form data")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	if header.Size > maxUploadSize {
		writeError(w, http.StatusBadRequest, "file exceeds 50 MB limit")
		return
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
	storedKey, err := h.minio.Upload(r.Context(), objectKey, contentType, file, header.Size)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "file storage failed")
		return
	}

	// Insert media_item + media_metadata in a transaction
	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var itemID, uploadDate string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO media_items (title, item_type, format, status, access_tier, created_by, file_path)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING item_id, to_char(upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		title, itemType, ext, status, accessTier, userID, storedKey,
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

	// Queue ingestion job for text extraction and embedding
	if h.redis != nil {
		jobData := map[string]any{
			"item_id":   itemID,
			"file_path": storedKey,
			"format":    ext,
			"user_id":   userID,
			"timestamp": time.Now().Format(time.RFC3339),
		}
		jobJSON, _ := json.Marshal(jobData)

		// Push to Redis queue
		if err := h.redis.LPush(r.Context(), "ingestion_jobs", jobJSON).Err(); err != nil {
			// Log error but don't fail the upload
			fmt.Printf("Failed to queue ingestion job: %v\n", err)
		}
	}

	writeJSON(w, http.StatusCreated, mediaItemResponse{
		ItemID:     itemID,
		Title:      title,
		ItemType:   itemType,
		Format:     ext,
		Status:     status,
		AccessTier: accessTier,
		CreatedBy:  &userID,
		FilePath:   &storedKey,
		UploadDate: uploadDate,
	})
}

// GET /api/v1/media
func (h *Handler) ListMedia(w http.ResponseWriter, r *http.Request) {
	roleTier, _ := r.Context().Value(authpkg.CtxRoleTier).(string)

	q := r.URL.Query().Get("q")
	itemType := r.URL.Query().Get("item_type")
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

	whereClause := strings.Join(where, " AND ")

	countArgs := make([]any, len(args))
	copy(countArgs, args)
	var total int
	_ = h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM media_items m WHERE `+whereClause, countArgs...).Scan(&total)

	args = append(args, perPage, offset)
	rows, err := h.db.Query(r.Context(),
		`SELECT m.item_id, m.title, m.item_type, m.format, m.status,
		        m.access_tier, m.created_by, m.file_path,
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
			&it.Status, &it.AccessTier, &it.CreatedBy, &it.FilePath, &it.UploadDate); err != nil {
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

// GET /api/v1/media/{itemId}
func (h *Handler) GetMedia(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	roleTier, _ := r.Context().Value(authpkg.CtxRoleTier).(string)

	var it mediaItemResponse
	var metaID, abstract, language string
	var tags, keywords []string

	err := h.db.QueryRow(r.Context(),
		`SELECT m.item_id, m.title, m.item_type, m.format, m.status,
		        m.access_tier, m.created_by, m.file_path,
		        to_char(m.upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        mm.meta_id, mm.abstract, mm.tags, mm.keywords, mm.language
		 FROM media_items m
		 LEFT JOIN media_metadata mm ON mm.item_id = m.item_id
		 WHERE m.item_id = $1`, id,
	).Scan(&it.ItemID, &it.Title, &it.ItemType, &it.Format, &it.Status,
		&it.AccessTier, &it.CreatedBy, &it.FilePath, &it.UploadDate,
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
	}

	filename := title + "." + format
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
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
		Title    *string  `json:"title"`
		Abstract *string  `json:"abstract"`
		Keywords []string `json:"keywords"`
		Tags     []string `json:"tags"`
		Language *string  `json:"language"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

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

	_, err := h.db.Exec(r.Context(),
		`INSERT INTO media_metadata (item_id, abstract, keywords, tags, language)
		 VALUES ($1, COALESCE($2,''), COALESCE($3,'{}'), COALESCE($4,'{}'), COALESCE($5,'en'))
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
		`SELECT item_id, title, item_type, format, status, access_tier,
		        created_by, file_path,
		        to_char(upload_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM media_items
		 WHERE created_by = $1
		 ORDER BY upload_date DESC
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
			&it.Status, &it.AccessTier, &it.CreatedBy, &it.FilePath, &it.UploadDate); err != nil {
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
