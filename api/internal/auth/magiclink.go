package auth

// Passwordless "magic link" email sign-in / sign-up.
//
// No third-party identity provider and no credit card required — it reuses the
// platform's existing SMTP mailer and Redis. The same find-or-create + token
// issuance path as Google SSO is reused, so a verified link logs the user in
// exactly like the OAuth flow.
//
// Flow:
//   POST /api/v1/auth/magic/request  {email}  → always 200; if the address is
//                                     valid, a one-time link is emailed.
//   GET  /api/v1/auth/magic/verify?token=...  → validate token, find-or-create
//                                     the user, issue JWT + refresh, then 302 to
//                                     the frontend callback with tokens in the
//                                     URL fragment (kept out of logs/referrers).
//
// Configuration (env):
//   SMTP_* (see mailer package) — required, else the endpoints return 503.
//   MAGIC_LINK_BASE_URL — absolute API base for the emailed link, e.g.
//                         "https://host/api/v1". Optional; derived from the
//                         request when unset.
//   FRONTEND_URL — reused from the Google flow for the post-login redirect.

import (
	"encoding/json"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/csedu/platform/api/internal/mailer"
)

const magicTokenTTL = 15 * time.Minute

// MagicEnabled reports whether passwordless email sign-in can operate. It needs
// SMTP configured (to send the link) and Redis (to store the one-time token).
func (h *Handler) MagicEnabled() bool {
	return mailer.Enabled() && h.redis != nil
}

// magicLinkBase returns the absolute API base the emailed link points at.
func magicLinkBase(r *http.Request) string {
	if b := os.Getenv("MAGIC_LINK_BASE_URL"); b != "" {
		return strings.TrimRight(b, "/")
	}
	scheme := "http"
	if p := r.Header.Get("X-Forwarded-Proto"); p != "" {
		scheme = p
	} else if r.TLS != nil {
		scheme = "https"
	}
	return scheme + "://" + r.Host + "/api/v1"
}

type magicReq struct {
	Email string `json:"email"`
}

// POST /api/v1/auth/magic/request
func (h *Handler) MagicRequest(w http.ResponseWriter, r *http.Request) {
	if !h.MagicEnabled() {
		writeError(w, http.StatusServiceUnavailable, "email sign-in is not configured")
		return
	}

	var req magicReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	// Uniform 200 regardless of validity to avoid leaking which addresses exist.
	// The link is only actually sent for a well-formed address.
	if emailRE.MatchString(email) && len(email) <= 254 {
		token := randomState()
		if err := h.redis.Set(r.Context(), "magic:"+hashRefresh(token), email, magicTokenTTL).Err(); err == nil {
			link := magicLinkBase(r) + "/auth/magic/verify?token=" + token
			body := "Hello,\r\n\r\n" +
				"Use the link below to sign in to the CSEDU Digital Knowledge Platform. " +
				"It expires in 15 minutes and can be used once.\r\n\r\n" +
				link + "\r\n\r\n" +
				"If you did not request this, you can safely ignore this email.\r\n"
			mailer.SendAsync(email, "Your CSEDU sign-in link", body)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "If that email is valid, a sign-in link is on its way. Check your inbox.",
	})
}

// GET /api/v1/auth/magic/verify?token=...
func (h *Handler) MagicVerify(w http.ResponseWriter, r *http.Request) {
	if !h.MagicEnabled() {
		h.redirectAuthError(w, r, "magic_not_configured")
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" {
		h.redirectAuthError(w, r, "magic_missing_token")
		return
	}

	key := "magic:" + hashRefresh(token)
	email, err := h.redis.Get(r.Context(), key).Result()
	if err != nil || email == "" {
		h.redirectAuthError(w, r, "magic_invalid")
		return
	}
	// One-shot: burn the token so the link cannot be replayed.
	h.redis.Del(r.Context(), key)

	// New magic-link accounts have no display name yet; findOrCreateSSOUser
	// falls back to the email and leaves password_hash NULL. Existing users
	// keep their stored name.
	userID, roleTier, err := h.findOrCreateSSOUser(r.Context(), email, email)
	if err != nil {
		h.redirectAuthError(w, r, "account_provisioning_failed")
		return
	}

	tokens, err := h.issueTokenPair(r.Context(), userID, roleTier)
	if err != nil {
		h.redirectAuthError(w, r, "token_issue_failed")
		return
	}

	// Fragment token delivery, same as the OAuth callback. Target the real
	// Next.js route: app/(auth)/callback → URL "/callback" (the "(auth)" group
	// is not part of the path).
	frag := "access_token=" + tokens.AccessToken +
		"&refresh_token=" + tokens.RefreshToken +
		"&expires_in=" + strconv.Itoa(tokens.ExpiresIn)
	http.Redirect(w, r, frontendURL()+"/callback#"+frag, http.StatusFound)
}
