// Package versioning records the edit history of a media item (FR-TXX-015).
//
// It lives in its own package because three packages mutate the same rows:
// media (metadata edits, file replacement), research (the paper edit dialog)
// and projects (the project edit dialog). The first implementation only
// snapshotted inside the media handler, so edits made through the research and
// project dialogs — which is how authors actually edit — left no history at all.
package versioning

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Snapshot copies an item's current state into media_versions before it is
// changed, and returns the version number written (0 if nothing was recorded).
//
// Best-effort by design: history is an audit aid, so a failure here must never
// block the edit the user asked for. Call it BEFORE applying the update.
func Snapshot(ctx context.Context, db *pgxpool.Pool, itemID, userID, note string) int {
	var next int
	if err := db.QueryRow(ctx,
		`SELECT COALESCE(MAX(version_no), 0) + 1 FROM media_versions WHERE item_id = $1`,
		itemID).Scan(&next); err != nil {
		return 0
	}

	var changedBy *string
	if userID != "" {
		changedBy = &userID
	}

	if _, err := db.Exec(ctx,
		`INSERT INTO media_versions
		   (item_id, version_no, title, abstract, keywords, tags, language,
		    access_tier, status, format, file_path, change_note, changed_by)
		 SELECT m.item_id, $2, m.title,
		        COALESCE(mm.abstract, ''), COALESCE(mm.keywords, '{}'::text[]),
		        COALESCE(mm.tags, '{}'::text[]), COALESCE(mm.language, 'en'),
		        m.access_tier::text, m.status::text, m.format, m.file_path, $3, $4
		 FROM media_items m
		 LEFT JOIN media_metadata mm ON mm.item_id = m.item_id
		 WHERE m.item_id = $1
		 ON CONFLICT (item_id, version_no) DO NOTHING`,
		itemID, next, note, changedBy); err != nil {
		return 0
	}
	return next
}
