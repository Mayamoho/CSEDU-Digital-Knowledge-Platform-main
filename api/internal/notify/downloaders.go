package notify

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/csedu/platform/api/internal/mailer"
)

// Keeping readers informed about a resource they already downloaded.
//
// When an author edits a published paper it is demoted to draft and disappears
// from the public listing until it is reviewed and published again. Anyone who
// already downloaded it is holding a superseded copy with no way to find out.
// RecordDownload remembers who took a copy, and NotifyDownloaders reaches them
// when the document's state changes.
//
// In-app plus email, matching the rest of the platform: the in-app notification
// always lands, and the email is best-effort so a disabled or failing SMTP host
// never breaks the author's edit.

// RecordDownload notes that a user downloaded an item. Anonymous downloads are
// ignored — there is nobody to notify. Best-effort: a bookkeeping failure must
// never break the download itself.
func RecordDownload(ctx context.Context, db *pgxpool.Pool, itemID, userID string) {
	if userID == "" || itemID == "" {
		return
	}
	_, _ = db.Exec(ctx,
		`INSERT INTO media_downloads (item_id, user_id)
		 VALUES ($1, $2)
		 ON CONFLICT (item_id, user_id) DO UPDATE
		   SET last_downloaded_at = now(),
		       download_count     = media_downloads.download_count + 1`,
		itemID, userID)
}

// downloader is one person to inform.
type downloader struct {
	UserID string
	Name   string
	Email  string
}

// NotifyDownloaders informs everyone who downloaded an item, except the person
// who triggered the change (an author does not need telling about their own
// edit). Best-effort throughout.
func NotifyDownloaders(ctx context.Context, db *pgxpool.Pool, itemID, excludeUserID, title, body, link string) int {
	rows, err := db.Query(ctx,
		`SELECT d.user_id::text, u.name, u.email
		   FROM media_downloads d
		   JOIN users u ON u.user_id = d.user_id
		  WHERE d.item_id = $1
		    AND ($2 = '' OR d.user_id <> $2::uuid)`,
		itemID, excludeUserID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	var people []downloader
	for rows.Next() {
		var d downloader
		if rows.Scan(&d.UserID, &d.Name, &d.Email) == nil {
			people = append(people, d)
		}
	}

	for _, d := range people {
		Push(ctx, db, d.UserID, title, body, link)
		if d.Email != "" {
			mailer.SendAsync(d.Email, title, emailBody(d.Name, body, link))
		}
	}
	return len(people)
}

// emailBody wraps the notification text in a short, plain message. Plain text on
// purpose — the mailer sends text/plain, and these notices are read on phones.
func emailBody(name, body, link string) string {
	greeting := "Hello"
	if name != "" {
		greeting = "Hello " + name
	}
	msg := fmt.Sprintf("%s,\n\n%s\n", greeting, body)
	if link != "" {
		msg += fmt.Sprintf("\nView it here: %s\n", link)
	}
	msg += "\n— CSEDU Digital Knowledge Platform\n" +
		"You are receiving this because you downloaded this resource."
	return msg
}
