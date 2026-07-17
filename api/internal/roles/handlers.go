// Package roles implements self-service role-upgrade requests. Self-registration
// always yields the "student" tier (see auth.Register); this package is the
// missing channel that lets a user ask an administrator to raise their tier and
// lets admins approve/reject from the admin panel. Approval applies the new role
// and records an audit-log entry identical to a direct admin role change.
package roles

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
	"github.com/csedu/platform/api/internal/mailer"
	"github.com/csedu/platform/api/internal/notify"
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

// Roles a user may request for themselves. Administrator is deliberately
// excluded — it can only be granted directly by an existing administrator.
var requestableRoles = map[string]bool{"researcher": true, "librarian": true}

// POST /api/v1/role-requests  {requested_role, justification}
// Any authenticated user files a request; all administrators are notified.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		RequestedRole string `json:"requested_role"`
		Justification string `json:"justification"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if !requestableRoles[req.RequestedRole] {
		writeError(w, http.StatusBadRequest, "requested_role must be researcher or librarian")
		return
	}

	var requestID string
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO role_requests (user_id, requested_role, justification)
		 VALUES ($1, $2, $3)
		 RETURNING request_id`,
		userID, req.RequestedRole, req.Justification,
	).Scan(&requestID)
	if err != nil {
		// The partial unique index rejects a second pending request.
		writeError(w, http.StatusConflict, "you already have a pending role request")
		return
	}

	// Notify admins in-app + best-effort email.
	var applicantName string
	_ = h.db.QueryRow(r.Context(), `SELECT name FROM users WHERE user_id = $1`, userID).Scan(&applicantName)
	title := "New role request"
	body := fmt.Sprintf("%s requested the %s role.", applicantName, req.RequestedRole)
	if req.Justification != "" {
		body += "\n\nReason: " + req.Justification
	}
	emails := notify.PushAdmins(r.Context(), h.db, title, body, "/admin/role-requests")
	for _, e := range emails {
		mailer.SendAsync(e, title, body+"\n\nReview it at /admin/role-requests\n\n— CSEDU Digital Knowledge Platform")
	}

	writeJSON(w, http.StatusCreated, map[string]string{"request_id": requestID, "status": "pending"})
}

// GET /api/v1/role-requests/mine — the caller's own requests (newest first).
func (h *Handler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	rows, err := h.db.Query(r.Context(),
		`SELECT request_id, requested_role, justification, status, decision_notes,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM role_requests WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, map[string]any{"data": scanRequests(rows, false)})
}

// GET /api/v1/admin/role-requests?status=pending — admin queue (defaults to pending).
func (h *Handler) ListAll(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}
	rows, err := h.db.Query(r.Context(),
		`SELECT rr.request_id, rr.requested_role, rr.justification, rr.status,
		        rr.decision_notes,
		        to_char(rr.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        u.user_id, u.name, u.email, u.role_tier
		 FROM role_requests rr JOIN users u ON u.user_id = rr.user_id
		 WHERE rr.status = $1 ORDER BY rr.created_at ASC`, status)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()
	writeJSON(w, http.StatusOK, map[string]any{"data": scanRequests(rows, true)})
}

// POST /api/v1/admin/role-requests/{id}/decide  {approve, notes}
// Approve applies the role; either way the applicant is notified.
func (h *Handler) Decide(w http.ResponseWriter, r *http.Request) {
	adminID, _ := authpkg.GetUserID(r)
	requestID := chi.URLParam(r, "id")

	var req struct {
		Approve bool   `json:"approve"`
		Notes   string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	// Load the pending request.
	var applicantID, requestedRole string
	err := h.db.QueryRow(r.Context(),
		`SELECT user_id, requested_role FROM role_requests
		 WHERE request_id = $1 AND status = 'pending'`, requestID,
	).Scan(&applicantID, &requestedRole)
	if err != nil {
		writeError(w, http.StatusNotFound, "pending request not found")
		return
	}

	newStatus := "rejected"
	if req.Approve {
		newStatus = "approved"
	}

	// Mark the request decided.
	if _, err := h.db.Exec(r.Context(),
		`UPDATE role_requests
		 SET status = $1, decided_by = $2, decision_notes = $3, decided_at = now()
		 WHERE request_id = $4`,
		newStatus, adminID, req.Notes, requestID); err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	if req.Approve {
		// Apply the role and audit it, mirroring admin.UpdateUserRole.
		if _, err := h.db.Exec(r.Context(),
			`UPDATE users SET role_tier = $1 WHERE user_id = $2`,
			requestedRole, applicantID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to apply role")
			return
		}
		_, _ = h.db.Exec(r.Context(),
			`INSERT INTO audit_log (actor_id, action, resource_type, resource_id)
			 VALUES ($1, $2, 'user', $3)`,
			adminID, "role_change:"+requestedRole, applicantID)
	}

	// Notify the applicant in-app + best-effort email.
	var email, name string
	_ = h.db.QueryRow(r.Context(), `SELECT email, name FROM users WHERE user_id = $1`, applicantID).Scan(&email, &name)
	var title, body string
	if req.Approve {
		title = "Role request approved"
		body = fmt.Sprintf("Your request for the %s role was approved. Log out and back in for it to take effect.", requestedRole)
	} else {
		title = "Role request declined"
		body = fmt.Sprintf("Your request for the %s role was declined.", requestedRole)
	}
	if req.Notes != "" {
		body += "\n\nAdministrator note: " + req.Notes
	}
	notify.Push(r.Context(), h.db, applicantID, title, body, "/dashboard")
	mailer.SendAsync(email, title, fmt.Sprintf("Hi %s,\n\n%s\n\n— CSEDU Digital Knowledge Platform", name, body))

	writeJSON(w, http.StatusOK, map[string]string{"status": newStatus})
}

type roleRequest struct {
	RequestID     string  `json:"request_id"`
	RequestedRole string  `json:"requested_role"`
	Justification string  `json:"justification"`
	Status        string  `json:"status"`
	DecisionNotes string  `json:"decision_notes"`
	CreatedAt     string  `json:"created_at"`
	UserID        *string `json:"user_id,omitempty"`
	Name          *string `json:"name,omitempty"`
	Email         *string `json:"email,omitempty"`
	CurrentRole   *string `json:"current_role,omitempty"`
}

// scanRequests reads rows; withUser toggles the joined applicant columns.
func scanRequests(rows interface {
	Next() bool
	Scan(...any) error
}, withUser bool) []roleRequest {
	out := []roleRequest{}
	for rows.Next() {
		var rr roleRequest
		if withUser {
			var uid, name, email, role string
			if err := rows.Scan(&rr.RequestID, &rr.RequestedRole, &rr.Justification,
				&rr.Status, &rr.DecisionNotes, &rr.CreatedAt, &uid, &name, &email, &role); err != nil {
				continue
			}
			rr.UserID, rr.Name, rr.Email, rr.CurrentRole = &uid, &name, &email, &role
		} else {
			if err := rows.Scan(&rr.RequestID, &rr.RequestedRole, &rr.Justification,
				&rr.Status, &rr.DecisionNotes, &rr.CreatedAt); err != nil {
				continue
			}
		}
		out = append(out, rr)
	}
	return out
}
