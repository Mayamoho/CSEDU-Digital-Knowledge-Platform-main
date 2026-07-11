package library

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// ── Simulated Bangladesh mobile-financial-service payment gateway ──────────────
//
// Supports bKash and Nagad online payments with a one-time-password (OTP) step,
// plus in-person cash payments that a librarian confirms at the counter.
//
// NOTE ON OTP DELIVERY: real bKash/Nagad integration requires merchant
// credentials and their tokenized-checkout APIs, and OTP delivery goes over an
// SMS aggregator (e.g. SSL Wireless, Twilio). Those need paid accounts, so this
// gateway SIMULATES delivery: the OTP is generated server-side with the same
// lifecycle a real one has (6 digits, 3-minute expiry, 3-attempt cap) and is
// returned to the client in `demo_otp` for testing. To go live, replace the
// single deliverOTP() seam below with a call to your SMS provider and stop
// returning demo_otp.

const (
	otpTTL         = 3 * time.Minute
	otpMaxAttempts = 3
)

var bdMobileRe = regexp.MustCompile(`^01[3-9]\d{8}$`)

// deliverOTP is the single seam to swap for a real SMS gateway. Today it only
// logs; the code is also returned to the caller for the demo flow.
func deliverOTP(account, code, method string) {
	fmt.Printf("[payment] %s OTP for %s: %s (simulated SMS)\n", method, account, code)
}

func genOTP() string {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", n.Int64())
}

// maskAccount keeps the operator prefix and last 2 digits: 017******78.
func maskAccount(acct string) string {
	if len(acct) != 11 {
		return "****"
	}
	return acct[:3] + "******" + acct[9:]
}

// settleFine records a successful payment, marks the fine paid, and completes
// the session — all inside the caller's transaction so it's atomic.
func settleFine(ctx context.Context, tx pgx.Tx, sessionID, fineID, userID string, amount float64, method string, confirmedBy *string) error {
	if _, err := tx.Exec(ctx,
		`INSERT INTO payments (fine_id, user_id, amount, status, method, confirmed_by, paid_at)
		 VALUES ($1, $2, $3, 'successful', $4, $5, now())`,
		fineID, userID, amount, method, confirmedBy); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE fines SET status = 'paid' WHERE fine_id = $1 AND status = 'pending'`, fineID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE payment_sessions
		 SET status = 'completed', completed_at = now(), confirmed_by = COALESCE($2, confirmed_by)
		 WHERE session_id = $1`, sessionID, confirmedBy); err != nil {
		return err
	}
	return nil
}

// loadPendingFine returns the amount and errors out (writing the response) if
// the fine is missing, not the caller's, or not pending. Returns ok=false when
// a response has already been written.
func (h *Handler) loadPendingFine(w http.ResponseWriter, r *http.Request, tx pgx.Tx, fineID, userID string) (float64, bool) {
	var amount float64
	var status, owner string
	err := tx.QueryRow(r.Context(),
		`SELECT amount::float8, status, user_id FROM fines WHERE fine_id = $1 FOR UPDATE`,
		fineID).Scan(&amount, &status, &owner)
	if err != nil {
		writeError(w, http.StatusNotFound, "fine not found")
		return 0, false
	}
	if owner != userID {
		writeError(w, http.StatusForbidden, "not your fine")
		return 0, false
	}
	if status != "pending" {
		writeError(w, http.StatusConflict, "fine already "+status)
		return 0, false
	}
	return amount, true
}

// POST /library/fines/{fineId}/pay/initiate — start a bKash/Nagad payment.
// Body: { "method": "bkash"|"nagad", "account_number": "01XXXXXXXXX" }
func (h *Handler) InitiateOnlinePayment(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		Method  string `json:"method"`
		Account string `json:"account_number"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Method != "bkash" && req.Method != "nagad" {
		writeError(w, http.StatusBadRequest, "method must be bkash or nagad")
		return
	}
	if !bdMobileRe.MatchString(req.Account) {
		writeError(w, http.StatusBadRequest, "enter a valid Bangladeshi mobile number (e.g. 01712345678)")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	amount, ok := h.loadPendingFine(w, r, tx, fineID, userID)
	if !ok {
		return
	}

	// Supersede any earlier live session for this fine so the user can retry or
	// switch method without hitting the one-active-session constraint.
	if _, err := tx.Exec(r.Context(),
		`UPDATE payment_sessions SET status = 'cancelled'
		 WHERE fine_id = $1 AND status IN ('pending','otp_sent','awaiting_counter')`, fineID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset payment session")
		return
	}

	otp := genOTP()
	var sessionID string
	err = tx.QueryRow(r.Context(),
		`INSERT INTO payment_sessions
		   (fine_id, user_id, method, account_number, amount, otp_code, otp_expires_at, status)
		 VALUES ($1, $2, $3, $4, $5, $6, now() + $7::interval, 'otp_sent')
		 RETURNING session_id`,
		fineID, userID, req.Method, maskAccount(req.Account), amount, otp,
		fmt.Sprintf("%d seconds", int(otpTTL.Seconds()))).Scan(&sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start payment")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	deliverOTP(req.Account, otp, req.Method)

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id":      sessionID,
		"method":          req.Method,
		"masked_account":  maskAccount(req.Account),
		"amount_bdt":      amount,
		"otp_expires_in":  int(otpTTL.Seconds()),
		"message":         fmt.Sprintf("An OTP was sent to %s via %s.", maskAccount(req.Account), req.Method),
		"demo_otp":        otp, // SIMULATION ONLY — remove when a real SMS gateway is wired.
		"demo_disclaimer": "Demo gateway: in production this OTP is delivered by SMS, not returned here.",
	})
}

// POST /library/fines/{fineId}/pay/confirm — verify OTP and settle the fine.
// Body: { "session_id": "...", "otp": "123456" }
func (h *Handler) ConfirmOnlinePayment(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req struct {
		SessionID string `json:"session_id"`
		OTP       string `json:"otp"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.SessionID == "" || req.OTP == "" {
		writeError(w, http.StatusBadRequest, "session_id and otp are required")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var (
		sMethod, sStatus, sOwner string
		sAmount                  float64
		sOTP                     string
		expiresAt                time.Time
		attempts                 int
	)
	err = tx.QueryRow(r.Context(),
		`SELECT method, status, user_id, amount::float8, COALESCE(otp_code,''), otp_expires_at, attempts
		 FROM payment_sessions WHERE session_id = $1 AND fine_id = $2 FOR UPDATE`,
		req.SessionID, fineID).Scan(&sMethod, &sStatus, &sOwner, &sAmount, &sOTP, &expiresAt, &attempts)
	if err != nil {
		writeError(w, http.StatusNotFound, "payment session not found")
		return
	}
	if sOwner != userID {
		writeError(w, http.StatusForbidden, "not your payment session")
		return
	}
	if sStatus != "otp_sent" {
		writeError(w, http.StatusConflict, "payment session is "+sStatus)
		return
	}
	if time.Now().After(expiresAt) {
		_, _ = tx.Exec(r.Context(), `UPDATE payment_sessions SET status='failed' WHERE session_id=$1`, req.SessionID)
		_ = tx.Commit(r.Context())
		writeError(w, http.StatusGone, "OTP expired — please start the payment again")
		return
	}
	if req.OTP != sOTP {
		attempts++
		if attempts >= otpMaxAttempts {
			_, _ = tx.Exec(r.Context(), `UPDATE payment_sessions SET status='failed', attempts=$2 WHERE session_id=$1`, req.SessionID, attempts)
			_ = tx.Commit(r.Context())
			writeError(w, http.StatusTooManyRequests, "too many incorrect attempts — payment cancelled, please start again")
			return
		}
		_, _ = tx.Exec(r.Context(), `UPDATE payment_sessions SET attempts=$2 WHERE session_id=$1`, req.SessionID, attempts)
		_ = tx.Commit(r.Context())
		writeError(w, http.StatusBadRequest, fmt.Sprintf("incorrect OTP (%d attempt(s) left)", otpMaxAttempts-attempts))
		return
	}

	if err := settleFine(r.Context(), tx, req.SessionID, fineID, userID, sAmount, sMethod, nil); err != nil {
		writeError(w, http.StatusInternalServerError, "could not complete payment")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "paid",
		"method":     sMethod,
		"amount_bdt": sAmount,
		"message":    fmt.Sprintf("Payment of ৳%.2f via %s successful.", sAmount, sMethod),
	})
}

// POST /library/fines/{fineId}/pay/cash — request to pay this fine in person.
// Creates an awaiting-counter session a librarian later confirms.
func (h *Handler) RequestCashPayment(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	amount, ok := h.loadPendingFine(w, r, tx, fineID, userID)
	if !ok {
		return
	}

	if _, err := tx.Exec(r.Context(),
		`UPDATE payment_sessions SET status = 'cancelled'
		 WHERE fine_id = $1 AND status IN ('pending','otp_sent','awaiting_counter')`, fineID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not reset payment session")
		return
	}

	var sessionID string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO payment_sessions (fine_id, user_id, method, amount, status)
		 VALUES ($1, $2, 'cash', $3, 'awaiting_counter')
		 RETURNING session_id`, fineID, userID, amount).Scan(&sessionID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not create counter payment request")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"session_id": sessionID,
		"status":     "awaiting_counter",
		"amount_bdt": amount,
		"message":    fmt.Sprintf("Marked for in-person payment. Pay ৳%.2f at the library counter; a librarian will confirm it.", amount),
	})
}

// POST /library/fines/{fineId}/pay/cancel — drop the current live session so the
// user can start over (e.g. abandon a counter request and pay online instead).
func (h *Handler) CancelPaymentSession(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	_, err := h.db.Exec(r.Context(),
		`UPDATE payment_sessions SET status = 'cancelled'
		 WHERE fine_id = $1 AND user_id = $2 AND status IN ('pending','otp_sent','awaiting_counter')`,
		fineID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "payment cancelled"})
}

// GET /library/fines/cash-requests — librarian/admin: fines awaiting in-person
// payment confirmation.
func (h *Handler) ListCashRequests(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(),
		`SELECT s.session_id, s.fine_id, s.amount::float8,
		        to_char(s.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        u.user_id, u.name, u.email, c.title
		 FROM payment_sessions s
		 JOIN fines f  ON f.fine_id = s.fine_id
		 JOIN users u  ON u.user_id = s.user_id
		 JOIN loans l  ON l.loan_id = f.loan_id
		 JOIN library_catalog c ON c.catalog_id = l.catalog_id
		 WHERE s.status = 'awaiting_counter' AND f.status = 'pending'
		 ORDER BY s.created_at ASC`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}
	defer rows.Close()

	type cashReq struct {
		SessionID string  `json:"session_id"`
		FineID    string  `json:"fine_id"`
		AmountBDT float64 `json:"amount_bdt"`
		CreatedAt string  `json:"created_at"`
		UserID    string  `json:"user_id"`
		UserName  string  `json:"user_name"`
		UserEmail string  `json:"user_email"`
		Title     string  `json:"title"`
	}
	items := []cashReq{}
	for rows.Next() {
		var c cashReq
		if err := rows.Scan(&c.SessionID, &c.FineID, &c.AmountBDT, &c.CreatedAt,
			&c.UserID, &c.UserName, &c.UserEmail, &c.Title); err != nil {
			continue
		}
		items = append(items, c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"data": items, "total": len(items)})
}

// POST /library/fines/{fineId}/confirm-cash — librarian/admin confirms cash
// received at the counter and settles the fine.
func (h *Handler) ConfirmCashPayment(w http.ResponseWriter, r *http.Request) {
	fineID := chi.URLParam(r, "fineId")
	librarianID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Lock the fine; it must still be pending.
	var fineAmount = 0.0
	var fineStatus, fineOwner string
	if err := tx.QueryRow(r.Context(),
		`SELECT amount::float8, status, user_id FROM fines WHERE fine_id = $1 FOR UPDATE`,
		fineID).Scan(&fineAmount, &fineStatus, &fineOwner); err != nil {
		writeError(w, http.StatusNotFound, "fine not found")
		return
	}
	if fineStatus != "pending" {
		writeError(w, http.StatusConflict, "fine already "+fineStatus)
		return
	}

	// Find the awaiting-counter session (create an implicit one if a librarian
	// takes cash for a fine the member never formally requested online).
	var sessionID string
	err = tx.QueryRow(r.Context(),
		`SELECT session_id FROM payment_sessions
		 WHERE fine_id = $1 AND status = 'awaiting_counter' FOR UPDATE`, fineID).Scan(&sessionID)
	if err != nil {
		if err := tx.QueryRow(r.Context(),
			`INSERT INTO payment_sessions (fine_id, user_id, method, amount, status)
			 VALUES ($1, $2, 'cash', $3, 'awaiting_counter') RETURNING session_id`,
			fineID, fineOwner, fineAmount).Scan(&sessionID); err != nil {
			writeError(w, http.StatusInternalServerError, "could not create counter session")
			return
		}
	}

	if err := settleFine(r.Context(), tx, sessionID, fineID, fineOwner, fineAmount, "cash", &librarianID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not settle fine")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":     "paid",
		"method":     "cash",
		"amount_bdt": fineAmount,
		"message":    fmt.Sprintf("Cash payment of ৳%.2f confirmed. Fine cleared.", fineAmount),
	})
}
