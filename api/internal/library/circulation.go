package library

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// ──────────────────────────────────────────────────────────────────────────────
// Librarian circulation desk — barcode workflow (SDD Flow 3, §3.2).
// HID scanners type the code and append \n / \r; both are stripped here as a
// fallback in case the UI passes them through.
// ──────────────────────────────────────────────────────────────────────────────

func cleanBarcode(s string) string {
	return strings.TrimSpace(strings.Trim(s, "\r\n"))
}

// POST /api/v1/library/circulation/checkout  {member_barcode, item_barcode}
// Librarian scans a member card and a book barcode; creates the loan.
func (h *Handler) CirculationCheckout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MemberBarcode string `json:"member_barcode"`
		ItemBarcode   string `json:"item_barcode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	member := cleanBarcode(req.MemberBarcode)
	item := cleanBarcode(req.ItemBarcode)
	if member == "" || item == "" {
		writeError(w, http.StatusBadRequest, "member_barcode and item_barcode are required")
		return
	}

	// Member: barcode or email fallback (manual keyboard entry).
	var memberID, memberName string
	if err := h.db.QueryRow(r.Context(),
		`SELECT user_id, name FROM users WHERE barcode = $1 OR email = lower($1)`,
		member,
	).Scan(&memberID, &memberName); err != nil {
		writeError(w, http.StatusNotFound, "member not found — rescan or enter the code manually")
		return
	}

	// Item: barcode or ISBN fallback.
	var catalogID, title string
	if err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id, title FROM library_catalog WHERE barcode = $1 OR isbn = $1`,
		item,
	).Scan(&catalogID, &title); err != nil {
		writeError(w, http.StatusNotFound, "item not found — rescan or enter the code manually")
		return
	}

	// FR-TXX-018 checkout block on unpaid fines.
	if blocked, owed := unpaidFinesBlock(r.Context(), h.db, memberID); blocked {
		writeError(w, http.StatusForbidden,
			fmt.Sprintf("member has outstanding fines of %.2f BDT — payment required before borrowing", owed))
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	var available int
	if err := tx.QueryRow(r.Context(),
		`SELECT available_copies FROM library_catalog WHERE catalog_id = $1 FOR UPDATE`,
		catalogID,
	).Scan(&available); err != nil {
		writeError(w, http.StatusNotFound, "catalog item not found")
		return
	}
	if available <= 0 {
		writeJSON(w, http.StatusConflict, map[string]any{
			"message":  "this item is currently on loan to another member",
			"can_hold": true,
		})
		return
	}

	var loanID, dueDate string
	if err := tx.QueryRow(r.Context(),
		`INSERT INTO loans (user_id, catalog_id, due_date)
		 VALUES ($1, $2, now() + interval '7 days')
		 RETURNING loan_id, to_char(due_date, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		memberID, catalogID,
	).Scan(&loanID, &dueDate); err != nil {
		if strings.Contains(err.Error(), "unique") {
			writeError(w, http.StatusConflict, "this member already has this item on loan")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create loan")
		return
	}

	_, _ = tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies - 1
		 WHERE catalog_id = $1`, catalogID)

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"message":     "loan created",
		"loan_id":     loanID,
		"member_name": memberName,
		"title":       title,
		"due_date":    dueDate,
	})
}

// POST /api/v1/library/circulation/return  {item_barcode}
// Librarian scans a returned book; closes its active loan.
func (h *Handler) CirculationReturn(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ItemBarcode string `json:"item_barcode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	item := cleanBarcode(req.ItemBarcode)
	if item == "" {
		writeError(w, http.StatusBadRequest, "item_barcode is required")
		return
	}

	var catalogID, title string
	if err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id, title FROM library_catalog WHERE barcode = $1 OR isbn = $1`,
		item,
	).Scan(&catalogID, &title); err != nil {
		writeError(w, http.StatusNotFound, "item not found — rescan or enter the code manually")
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "transaction error")
		return
	}
	defer tx.Rollback(r.Context())

	// Close the oldest active loan on this item.
	var loanID, memberName string
	if err := tx.QueryRow(r.Context(),
		`UPDATE loans SET return_date = now(), status = 'returned'
		 WHERE loan_id = (
		     SELECT l.loan_id FROM loans l
		     WHERE l.catalog_id = $1 AND l.return_date IS NULL
		     ORDER BY l.checkout_date ASC LIMIT 1
		 )
		 RETURNING loan_id,
		           (SELECT name FROM users WHERE user_id = loans.user_id)`,
		catalogID,
	).Scan(&loanID, &memberName); err != nil {
		// Nothing to check in. The usual reason a librarian lands here is that
		// the copy came back earlier and only the fine is still open — the desk
		// used to answer with a bare "no active loan", which reads like the scan
		// failed. Report what actually happened to the last loan instead.
		h.writeNoActiveLoan(w, r, catalogID, title)
		return
	}

	// Late fine — same formula as the member self-return path. The overdue
	// worker may already have filed a pending fine for this loan while it was
	// still out; its amount was computed on an earlier day, so refresh it to the
	// final figure rather than leaving the stale (lower) one.
	_, _ = tx.Exec(r.Context(), `
		INSERT INTO fines (loan_id, user_id, amount, status, calculated_at)
		SELECT loan_id, user_id,
		       LEAST(FLOOR(EXTRACT(EPOCH FROM (return_date - due_date)) / 86400) * 50, 500),
		       'pending', now()
		FROM loans
		WHERE loan_id = $1
		  AND return_date >= due_date + interval '1 day'
		ON CONFLICT (loan_id) DO UPDATE
		   SET amount = EXCLUDED.amount, calculated_at = now()
		 WHERE fines.status = 'pending' AND EXCLUDED.amount > fines.amount`, loanID)

	// Tell the librarian at the desk what is still owed on this loan, so the
	// fine can be collected while the member is standing there.
	var fineDue float64
	_ = tx.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(amount), 0)::float8 FROM fines
		 WHERE loan_id = $1 AND status = 'pending'`, loanID).Scan(&fineDue)

	_, _ = tx.Exec(r.Context(),
		`UPDATE library_catalog SET available_copies = available_copies + 1
		 WHERE catalog_id = $1`, catalogID)

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "commit error")
		return
	}

	// Fulfil the oldest active hold now that a copy is back.
	_ = h.fulfillOldestHold(r, catalogID)

	writeJSON(w, http.StatusOK, map[string]any{
		"message":          "return recorded",
		"loan_id":          loanID,
		"member_name":      memberName,
		"title":            title,
		"outstanding_fine": fineDue,
	})
}

// writeNoActiveLoan explains why a scanned item had nothing to check in: it is
// already back on the shelf (and possibly still carrying an unpaid fine), or it
// was never lent out at all.
func (h *Handler) writeNoActiveLoan(w http.ResponseWriter, r *http.Request, catalogID, title string) {
	var memberName, returnedOn string
	var fineDue float64
	err := h.db.QueryRow(r.Context(), `
		SELECT u.name,
		       to_char(l.return_date, 'YYYY-MM-DD'),
		       COALESCE((SELECT SUM(f.amount) FROM fines f
		                  WHERE f.loan_id = l.loan_id AND f.status = 'pending'), 0)::float8
		FROM loans l
		JOIN users u ON u.user_id = l.user_id
		WHERE l.catalog_id = $1 AND l.return_date IS NOT NULL
		ORDER BY l.return_date DESC
		LIMIT 1`, catalogID).Scan(&memberName, &returnedOn, &fineDue)
	if err != nil {
		writeJSON(w, http.StatusConflict, map[string]any{
			"message": fmt.Sprintf(
				"“%s” is not on loan — no member currently has this item out, so there is nothing to check in.",
				title),
			"already_returned": false,
			"outstanding_fine": 0,
		})
		return
	}

	msg := fmt.Sprintf(
		"“%s” is already back — %s returned it on %s, so there is no open loan to close.",
		title, memberName, returnedOn)
	if fineDue > 0 {
		msg += fmt.Sprintf(
			" An unpaid fine of %.2f BDT is still on that loan; settle it under Admin → Fines (returning the book again will not clear it).",
			fineDue)
	}
	writeJSON(w, http.StatusConflict, map[string]any{
		"message":          msg,
		"already_returned": true,
		"returned_on":      returnedOn,
		"member_name":      memberName,
		"outstanding_fine": fineDue,
	})
}

// GET /api/v1/library/circulation/lookup?code=X — preview a scanned code.
func (h *Handler) CirculationLookup(w http.ResponseWriter, r *http.Request) {
	code := cleanBarcode(r.URL.Query().Get("code"))
	if code == "" {
		writeError(w, http.StatusBadRequest, "code is required")
		return
	}

	var id, label string
	if err := h.db.QueryRow(r.Context(),
		`SELECT user_id::text, name FROM users WHERE barcode = $1 OR email = lower($1)`,
		code).Scan(&id, &label); err == nil {
		writeJSON(w, http.StatusOK, map[string]string{"kind": "member", "id": id, "label": label})
		return
	}
	if err := h.db.QueryRow(r.Context(),
		`SELECT catalog_id::text, title FROM library_catalog WHERE barcode = $1 OR isbn = $1`,
		code).Scan(&id, &label); err == nil {
		writeJSON(w, http.StatusOK, map[string]string{"kind": "item", "id": id, "label": label})
		return
	}
	writeError(w, http.StatusNotFound, "code not recognised")
}
