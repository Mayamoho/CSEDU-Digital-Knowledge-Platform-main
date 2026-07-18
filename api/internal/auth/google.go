package auth

// Google OAuth 2.0 sign-in / sign-up (SDD Flow 4, §6.1).
//
// Implements the SSO fallback path with Google as the identity provider using
// only the standard library — no extra dependencies for the distroless image.
//
// Flow:
//   GET /api/v1/auth/google/login    → 302 to Google's consent screen
//   GET /api/v1/auth/google/callback → exchange code, find-or-create user by
//                                       email, issue JWT + refresh, then 302 to
//                                       the frontend callback page with tokens
//                                       in the URL fragment (never sent to a
//                                       server, kept out of logs/referrers).
//
// Configuration (env):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
//   FRONTEND_URL — where the browser is sent after a successful login
//                  (default "", i.e. same-origin relative paths)

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const (
	googleAuthURL     = "https://accounts.google.com/o/oauth2/v2/auth"
	googleTokenURL    = "https://oauth2.googleapis.com/token"
	googleUserInfoURL = "https://www.googleapis.com/oauth2/v2/userinfo"
	oauthStateCookie  = "g_oauth_state"
)

func googleClientID() string     { return os.Getenv("GOOGLE_CLIENT_ID") }
func googleClientSecret() string { return os.Getenv("GOOGLE_CLIENT_SECRET") }
func googleRedirectURI() string  { return os.Getenv("GOOGLE_REDIRECT_URI") }

// GoogleEnabled reports whether Google OAuth is configured.
func GoogleEnabled() bool {
	return googleClientID() != "" && googleClientSecret() != "" && googleRedirectURI() != ""
}

// frontendURL is where the user lands after auth. Defaults to same-origin root.
func frontendURL() string {
	if u := os.Getenv("FRONTEND_URL"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return ""
}

// randomState returns a cryptographically random hex string for CSRF protection.
func randomState() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// GET /api/v1/auth/google/login
func (h *Handler) GoogleLogin(w http.ResponseWriter, r *http.Request) {
	if !GoogleEnabled() {
		writeError(w, http.StatusServiceUnavailable, "Google sign-in is not configured")
		return
	}

	state := randomState()
	// State stored in an HttpOnly cookie and echoed back by Google on the
	// callback. SameSite=Lax lets the cookie survive the top-level GET
	// redirect back from Google. Scoped to the auth path.
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookie,
		Value:    state,
		Path:     "/api/v1/auth",
		MaxAge:   int((10 * time.Minute).Seconds()),
		HttpOnly: true,
		Secure:   strings.HasPrefix(googleRedirectURI(), "https://"),
		SameSite: http.SameSiteLaxMode,
	})

	q := url.Values{}
	q.Set("client_id", googleClientID())
	q.Set("redirect_uri", googleRedirectURI())
	q.Set("response_type", "code")
	q.Set("scope", "openid email profile")
	q.Set("state", state)
	q.Set("access_type", "online")
	q.Set("prompt", "select_account")

	http.Redirect(w, r, googleAuthURL+"?"+q.Encode(), http.StatusFound)
}

// GET /api/v1/auth/google/callback
func (h *Handler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	if !GoogleEnabled() {
		writeError(w, http.StatusServiceUnavailable, "Google sign-in is not configured")
		return
	}

	// Google may report a consent error (e.g. user cancelled).
	if errParam := r.URL.Query().Get("error"); errParam != "" {
		h.redirectAuthError(w, r, "google_"+errParam)
		return
	}

	// Verify the state matches the cookie (CSRF protection).
	stateCookie, err := r.Cookie(oauthStateCookie)
	if err != nil || stateCookie.Value == "" || stateCookie.Value != r.URL.Query().Get("state") {
		h.redirectAuthError(w, r, "state_mismatch")
		return
	}
	// One-shot: clear the state cookie.
	http.SetCookie(w, &http.Cookie{Name: oauthStateCookie, Value: "", Path: "/api/v1/auth", MaxAge: -1})

	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectAuthError(w, r, "missing_code")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	accessTok, err := exchangeGoogleCode(ctx, code)
	if err != nil {
		h.redirectAuthError(w, r, "token_exchange_failed")
		return
	}

	profile, err := fetchGoogleProfile(ctx, accessTok)
	if err != nil {
		h.redirectAuthError(w, r, "profile_fetch_failed")
		return
	}
	if profile.Email == "" || !profile.VerifiedEmail {
		h.redirectAuthError(w, r, "unverified_email")
		return
	}

	email := strings.ToLower(strings.TrimSpace(profile.Email))
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = email
	}

	userID, roleTier, err := h.findOrCreateSSOUser(ctx, email, name)
	if err != nil {
		h.redirectAuthError(w, r, "account_provisioning_failed")
		return
	}

	// Issue tokens exactly like the local login path.
	tokens, err := h.issueTokenPair(ctx, userID, roleTier)
	if err != nil {
		h.redirectAuthError(w, r, "token_issue_failed")
		return
	}

	// Deliver tokens to the SPA via the URL fragment. The fragment is never
	// sent to any server, so tokens stay out of access logs and Referer.
	frag := url.Values{}
	frag.Set("access_token", tokens.AccessToken)
	frag.Set("refresh_token", tokens.RefreshToken)
	frag.Set("expires_in", fmt.Sprintf("%d", tokens.ExpiresIn))
	// Next route app/(auth)/callback resolves to URL "/callback" — the "(auth)"
	// group is not part of the path.
	http.Redirect(w, r, frontendURL()+"/callback#"+frag.Encode(), http.StatusFound)
}

// redirectAuthError sends the user back to the login page with an error code
// the frontend can render, rather than dumping a raw JSON error mid-redirect.
func (h *Handler) redirectAuthError(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, frontendURL()+"/login?sso_error="+url.QueryEscape(reason), http.StatusFound)
}

// findOrCreateSSOUser maps a verified Google identity to a local account by
// email (safe SSO mapping per SDD §4.3.1). New accounts get the lowest
// self-serve tier and a NULL password_hash (SSO-only, per SDD §4.3.2).
func (h *Handler) findOrCreateSSOUser(ctx context.Context, email, name string) (userID, roleTier string, err error) {
	err = h.db.QueryRow(ctx,
		`SELECT user_id, role_tier FROM users WHERE email = $1`, email,
	).Scan(&userID, &roleTier)
	if err == nil {
		_, _ = h.db.Exec(ctx, `UPDATE users SET last_login = now() WHERE user_id = $1`, userID)
		return userID, roleTier, nil
	}

	// Not found → create an SSO-only account (password_hash left NULL).
	roleTier = "public"
	err = h.db.QueryRow(ctx,
		`INSERT INTO users (email, name, role_tier, last_login)
		 VALUES ($1, $2, $3, now())
		 RETURNING user_id`,
		email, name, roleTier,
	).Scan(&userID)
	if err != nil {
		return "", "", err
	}
	return userID, roleTier, nil
}

// issueTokenPair mints an access token and a stored refresh token for a user.
func (h *Handler) issueTokenPair(ctx context.Context, userID, roleTier string) (tokenResponse, error) {
	accessToken, exp, err := IssueAccessToken(userID, roleTier)
	if err != nil {
		return tokenResponse{}, err
	}
	refreshToken := IssueRefreshToken()
	if _, err := h.db.Exec(ctx,
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashRefresh(refreshToken), RefreshExpiry(),
	); err != nil {
		return tokenResponse{}, err
	}
	return tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(time.Until(exp).Seconds()),
	}, nil
}

// ── Google API calls ────────────────────────────────────────────────────────

func exchangeGoogleCode(ctx context.Context, code string) (string, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", googleClientID())
	form.Set("client_secret", googleClientSecret())
	form.Set("redirect_uri", googleRedirectURI())
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, googleTokenURL,
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("google token endpoint returned %d", resp.StatusCode)
	}

	var out struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", fmt.Errorf("google token endpoint returned no access_token")
	}
	return out.AccessToken, nil
}

type googleProfile struct {
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
}

func fetchGoogleProfile(ctx context.Context, accessToken string) (googleProfile, error) {
	var p googleProfile
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleUserInfoURL, nil)
	if err != nil {
		return p, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return p, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return p, fmt.Errorf("google userinfo endpoint returned %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return p, err
	}
	return p, nil
}
