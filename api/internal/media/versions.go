package media

import (
	"context"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/versioning"
)

// FR-TXX-015 (Content Versioning): every edit is tracked and every previous
// version is retrievable.
//
// The live media_items/media_metadata rows are always the current state. Before
// each mutating operation we copy that state into media_versions, so the table
// holds the item's history oldest-first and nothing is ever lost. Restoring a
// version snapshots the current state first, then writes the old values back —
// a restore is itself an edit, so it is undoable too.

type versionResponse struct {
	VersionNo  int      `json:"version_no"`
	Title      string   `json:"title"`
	Abstract   string   `json:"abstract"`
	Keywords   []string `json:"keywords"`
	Tags       []string `json:"tags"`
	Language   string   `json:"language"`
	AccessTier string   `json:"access_tier"`
	Status     string   `json:"status"`
	Format     string   `json:"format"`
	FilePath   *string  `json:"file_path"`
	ChangeNote string   `json:"change_note"`
	ChangedBy  *string  `json:"changed_by"`
	CreatedAt  string   `json:"created_at"`
}

// snapshotVersion delegates to the shared versioning package, which the
// research and projects handlers use too — every path that edits an item must
// record history, not just this one.
func (h *Handler) snapshotVersion(ctx context.Context, itemID, userID, note string) int {
	return versioning.Snapshot(ctx, h.db, itemID, userID, note)
}

// canEditItem reports whether the caller owns the item or moderates the platform.
func (h *Handler) canEditItem(ctx context.Context, itemID, userID, roleTier string) (bool, bool) {
	var createdBy *string
	if err := h.db.QueryRow(ctx,
		`SELECT created_by FROM media_items WHERE item_id = $1`, itemID).Scan(&createdBy); err != nil {
		return false, false // not found
	}
	isOwner := createdBy != nil && *createdBy == userID
	isModerator := roleTier == "librarian" || roleTier == "administrator"
	return isOwner || isModerator, true
}

// GET /api/v1/media/{itemId}/versions — full edit history, newest first.
func (h *Handler) ListVersions(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	userID, _ := authpkg.GetUserID(r)
	roleTier, _ := authpkg.GetRoleTier(r)

	allowed, found := h.canEditItem(r.Context(), id, userID, roleTier)
	if !found {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you can only view history for your own uploads")
		return
	}

	rows, err := h.db.Query(r.Context(),
		`SELECT version_no, title, abstract, keywords, tags, language,
		        access_tier, status, format, file_path, change_note, changed_by::text,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM media_versions WHERE item_id = $1 ORDER BY version_no DESC`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	versions := []versionResponse{}
	for rows.Next() {
		var v versionResponse
		if err := rows.Scan(&v.VersionNo, &v.Title, &v.Abstract, &v.Keywords, &v.Tags,
			&v.Language, &v.AccessTier, &v.Status, &v.Format, &v.FilePath,
			&v.ChangeNote, &v.ChangedBy, &v.CreatedAt); err != nil {
			continue
		}
		versions = append(versions, v)
	}

	writeJSON(w, http.StatusOK, map[string]any{"item_id": id, "versions": versions})
}

// GET /api/v1/media/{itemId}/versions/{versionNo} — one archived version.
func (h *Handler) GetVersion(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	userID, _ := authpkg.GetUserID(r)
	roleTier, _ := authpkg.GetRoleTier(r)

	allowed, found := h.canEditItem(r.Context(), id, userID, roleTier)
	if !found {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you can only view history for your own uploads")
		return
	}

	no, err := strconv.Atoi(chi.URLParam(r, "versionNo"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid version number")
		return
	}

	var v versionResponse
	if err := h.db.QueryRow(r.Context(),
		`SELECT version_no, title, abstract, keywords, tags, language,
		        access_tier, status, format, file_path, change_note, changed_by::text,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM media_versions WHERE item_id = $1 AND version_no = $2`, id, no,
	).Scan(&v.VersionNo, &v.Title, &v.Abstract, &v.Keywords, &v.Tags, &v.Language,
		&v.AccessTier, &v.Status, &v.Format, &v.FilePath, &v.ChangeNote,
		&v.ChangedBy, &v.CreatedAt); err != nil {
		writeError(w, http.StatusNotFound, "version not found")
		return
	}

	writeJSON(w, http.StatusOK, v)
}

// POST /api/v1/media/{itemId}/versions/{versionNo}/restore — roll the live item
// back to an archived version. The pre-restore state is snapshotted first, so
// the restore can itself be undone.
func (h *Handler) RestoreVersion(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "itemId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleTier, _ := authpkg.GetRoleTier(r)

	allowed, found := h.canEditItem(r.Context(), id, userID, roleTier)
	if !found {
		writeError(w, http.StatusNotFound, "item not found")
		return
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "you can only restore your own uploads")
		return
	}

	no, err := strconv.Atoi(chi.URLParam(r, "versionNo"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid version number")
		return
	}

	var v versionResponse
	if err := h.db.QueryRow(r.Context(),
		`SELECT version_no, title, abstract, keywords, tags, language,
		        access_tier, status, format, file_path
		 FROM media_versions WHERE item_id = $1 AND version_no = $2`, id, no,
	).Scan(&v.VersionNo, &v.Title, &v.Abstract, &v.Keywords, &v.Tags, &v.Language,
		&v.AccessTier, &v.Status, &v.Format, &v.FilePath); err != nil {
		writeError(w, http.StatusNotFound, "version not found")
		return
	}

	newVersion := h.snapshotVersion(r.Context(), id, userID, "before restore of v"+strconv.Itoa(no))

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	if _, err := tx.Exec(r.Context(),
		`UPDATE media_items
		   SET title = $1, access_tier = $2::access_tier, status = $3::item_status,
		       format = $4, file_path = $5
		 WHERE item_id = $6`,
		v.Title, v.AccessTier, v.Status, v.Format, v.FilePath, id); err != nil {
		writeError(w, http.StatusInternalServerError, "could not restore item")
		return
	}

	if _, err := tx.Exec(r.Context(),
		`INSERT INTO media_metadata (item_id, abstract, keywords, tags, language)
		 VALUES ($1, $2, $3::text[], $4::text[], $5)
		 ON CONFLICT (item_id) DO UPDATE SET
		   abstract = EXCLUDED.abstract,
		   keywords = EXCLUDED.keywords,
		   tags     = EXCLUDED.tags,
		   language = EXCLUDED.language`,
		id, v.Abstract, v.Keywords, v.Tags, v.Language); err != nil {
		writeError(w, http.StatusInternalServerError, "could not restore metadata")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":          "version restored",
		"restored_from":    no,
		"snapshot_version": newVersion,
	})
}
