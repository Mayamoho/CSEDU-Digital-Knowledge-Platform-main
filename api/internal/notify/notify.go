// Package notify provides the in-app notification centre and a small helper
// used across the codebase to record a notification for a user. It is written
// to complement (not replace) the best-effort SMTP mailer: callers typically
// record an in-app notification here AND fire an email, so users still see the
// update when SMTP is disabled.
package notify

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Push records a single in-app notification (best-effort; errors are ignored
// so a notification failure never breaks the originating request).
func Push(ctx context.Context, db *pgxpool.Pool, userID, title, body, link string) {
	var linkArg any
	if link != "" {
		linkArg = link
	}
	_, _ = db.Exec(ctx,
		`INSERT INTO notifications (user_id, title, body, link)
		 VALUES ($1, $2, $3, $4)`,
		userID, title, body, linkArg)
}

// PushAdmins records the same notification for every administrator. Used to
// alert admins of events needing action (e.g. a new role-upgrade request).
// Returns the admin email addresses so the caller can also email them.
func PushAdmins(ctx context.Context, db *pgxpool.Pool, title, body, link string) []string {
	rows, err := db.Query(ctx,
		`SELECT user_id, email FROM users WHERE role_tier = 'administrator'`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	type admin struct{ id, email string }
	var admins []admin
	var emails []string
	for rows.Next() {
		var a admin
		if err := rows.Scan(&a.id, &a.email); err != nil {
			continue
		}
		admins = append(admins, a)
		emails = append(emails, a.email)
	}
	for _, a := range admins {
		Push(ctx, db, a.id, title, body, link)
	}
	return emails
}
