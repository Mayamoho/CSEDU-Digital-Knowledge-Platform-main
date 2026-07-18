package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ──────────────────────────────────────────────────────────────────────────────
// SSO (OAuth 2.0) — institutional identity provider login.
//
// Per SDD §5.4 / §6.1 the primary auth path is OAuth 2.0 SSO, with the
// local email/password path always maintained as a fallback. SSO is driven by
// env vars; when SSO_PROVIDER_URL / SSO_CLIENT_ID are empty the feature is
// disabled and the login button simply no-ops (local auth remains available).
// ──────────────────────────────────────────────────────────────────────────────

type ssoConfig struct {
	Enabled      bool
	ProviderURL  string
	ClientID     string
	ClientSecret string
	RedirectURI  string
	Scope        string
}

func loadSSOConfig() ssoConfig {
	provider := os.Getenv("SSO_PROVIDER_URL")
	clientID := os.Getenv("SSO_CLIENT_ID")
	clientSecret := os.Getenv("SSO_CLIENT_SECRET")
	redirectURI := os.Getenv("SSO_REDIRECT_URI")
	// Fall back to Google OAuth 2.0 vars so the existing
	// "Continue with Google" button works with the same handler.
	if provider == "" {
		provider = os.Getenv("GOOGLE_PROVIDER_URL")
	}
	if clientID == "" {
		clientID = os.Getenv("GOOGLE_CLIENT_ID")
	}
	if clientSecret == "" {
		clientSecret = os.Getenv("GOOGLE_CLIENT_SECRET")
	}
	if redirectURI == "" {
		redirectURI = os.Getenv("GOOGLE_REDIRECT_URI")
	}
	if redirectURI == "" {
		redirectURI = "http://localhost:8080/api/v1/auth/sso/callback"
	}
	scope := os.Getenv("SSO_SCOPE")
	if scope == "" {
		scope = os.Getenv("GOOGLE_SCOPE")
	}
	if scope == "" {
		scope = "openid email profile"
	}
	// Google's token + userinfo endpoints are well-known.
	if provider == "google" {
		provider = "https://accounts.google.com/o/oauth2/v2"
	}
	return ssoConfig{
		Enabled:      provider != "" && clientID != "",
		ProviderURL:  strings.TrimRight(provider, "/"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURI:  redirectURI,
		Scope:        scope,
	}
}

// SSOHandler exposes the login + callback routes.
type SSOHandler struct {
	db  *pgxpool.Pool
	cfg ssoConfig
}

func NewSSOHandler(db *pgxpool.Pool) *SSOHandler {
	return &SSOHandler{db: db, cfg: loadSSOConfig()}
}

// Enabled reports whether SSO is configured (used by main.go routing).
func (h *SSOHandler) Enabled() bool { return h.cfg.Enabled }

// GET /api/v1/auth/sso/status
// Public, always-available endpoint the frontend uses to decide whether
// to render the "Continue with University SSO" button.
func (h *SSOHandler) Status(w http.ResponseWriter, r *http.Request) {
	provider := ""
	if h.cfg.Enabled {
		// Expose only a coarse label, never secrets.
		switch {
		case strings.Contains(strings.ToLower(h.cfg.ProviderURL), "google"):
			provider = "google"
		case h.cfg.ProviderURL != "":
			provider = "institutional"
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":  h.cfg.Enabled,
		"provider": provider,
	})
}

// GET /api/v1/auth/sso/login
// Builds the authorization URL with a CSRF state param (stored in an
// HTTP-only cookie) and redirects the browser to the IdP.
func (h *SSOHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.Enabled {
		http.Error(w, `{"message":"sso is not configured"}`, http.StatusNotImplemented)
		return
	}

	state, err := randomState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start sso")
		return
	}

	// CSRF state cookie — short-lived, HTTP-only.
	http.SetCookie(w, &http.Cookie{
		Name:     "sso_state",
		Value:    state,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(10 * time.Minute.Seconds()),
	})

	authURL := fmt.Sprintf(
		"%s/authorize?response_type=code&client_id=%s&redirect_uri=%s&scope=%s&state=%s",
		h.cfg.ProviderURL,
		h.cfg.ClientID,
		h.cfg.RedirectURI,
		h.cfg.Scope,
		state,
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

// GET /api/v1/auth/sso/callback?code=...&state=...
// Exchanges the code for an access token via the IdP back-channel, fetches the
// user profile, and finds-or-creates the local user by email. Issues JWT +
// refresh tokens stored in HTTP-only cookies, then redirects to the dashboard.
func (h *SSOHandler) Callback(w http.ResponseWriter, r *http.Request) {
	if !h.cfg.Enabled {
		http.Error(w, `{"message":"sso is not configured"}`, http.StatusNotImplemented)
		return
	}

	// CSRF state verification.
	stateCookie, err := r.Cookie("sso_state")
	if err != nil || stateCookie.Value == "" {
		http.Error(w, `{"message":"sso state missing"}`, http.StatusBadRequest)
		return
	}
	if r.URL.Query().Get("state") != stateCookie.Value {
		http.Error(w, `{"message":"sso state mismatch"}`, http.StatusForbidden)
		return
	}
	// Clear the state cookie.
	http.SetCookie(w, &http.Cookie{
		Name:     "sso_state",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, `{"message":"sso authorization code missing"}`, http.StatusBadRequest)
		return
	}

	// Exchange code for IdP access token.
	idpToken, err := h.exchangeCode(r.Context(), code)
	if err != nil {
		http.Error(w, `{"message":"sso token exchange failed"}`, http.StatusBadGateway)
		return
	}

	// Fetch profile (email is the join key per SDD §5.4).
	email, name, err := h.fetchProfile(r.Context(), idpToken)
	if err != nil || email == "" {
		http.Error(w, `{"message":"sso profile fetch failed"}`, http.StatusBadGateway)
		return
	}
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" {
		name = email
	}

	userID, role, err := h.findOrCreateUser(r.Context(), email, name)
	if err != nil {
		http.Error(w, `{"message":"sso user provisioning failed"}`, http.StatusInternalServerError)
		return
	}

	// Issue tokens and set them as HTTP-only cookies (SDD §6.1).
	accessToken, exp, err := IssueAccessToken(userID, role)
	if err != nil {
		http.Error(w, `{"message":"could not issue token"}`, http.StatusInternalServerError)
		return
	}
	refreshToken := IssueRefreshToken()
	if _, err := h.db.Exec(r.Context(),
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
		userID, hashRefresh(refreshToken), RefreshExpiry(),
	); err != nil {
		http.Error(w, `{"message":"could not store token"}`, http.StatusInternalServerError)
		return
	}

	setAuthCookies(w, accessToken, exp, refreshToken)

	// Redirect to the SPA dashboard.
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	http.Redirect(w, r, frontendURL+"/dashboard", http.StatusFound)
}

// exchangeCode performs the OAuth2 token exchange against the IdP token endpoint.
func (h *SSOHandler) exchangeCode(ctx context.Context, code string) (string, error) {
	tokenURL := h.cfg.ProviderURL + "/token"
	form := strings.NewReader(
		fmt.Sprintf(
			"grant_type=authorization_code&code=%s&redirect_uri=%s&client_id=%s&client_secret=%s",
			code, h.cfg.RedirectURI, h.cfg.ClientID, h.cfg.ClientSecret,
		),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, form)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var tr struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tr); err != nil {
		return "", err
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("idp returned no access token: %s", tr.Error)
	}
	return tr.AccessToken, nil
}

// fetchProfile calls the IdP userinfo endpoint and extracts email + name.
func (h *SSOHandler) fetchProfile(ctx context.Context, idpToken string) (string, string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		h.cfg.ProviderURL+"/userinfo", nil)
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+idpToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()

	var profile struct {
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&profile); err != nil {
		return "", "", err
	}
	return profile.Email, profile.Name, nil
}

// findOrCreateUser matches an existing user by email or provisions a new
// SSO-only account (password_hash stays NULL per SDD §4.3.2).
func (h *SSOHandler) findOrCreateUser(ctx context.Context, email, name string) (string, string, error) {
	var userID, role string
	err := h.db.QueryRow(ctx,
		`SELECT user_id, role_tier FROM users WHERE email = $1`, email,
	).Scan(&userID, &role)
	if err == nil {
		_, _ = h.db.Exec(ctx,
			`UPDATE users SET last_login = now() WHERE user_id = $1`, userID)
		return userID, role, nil
	}

	userID = uuid.New().String()
	role = "student" // default tier for SSO-provisioned accounts
	_, err = h.db.Exec(ctx,
		`INSERT INTO users (user_id, email, name, password_hash, role_tier, last_login)
		 VALUES ($1, $2, $3, NULL, $4, now())`,
		userID, email, name, role)
	if err != nil {
		return "", "", err
	}
	return userID, role, nil
}

// setAuthCookies writes the access + refresh tokens as HTTP-only cookies.
func setAuthCookies(w http.ResponseWriter, accessToken string, exp time.Time, refreshToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "csedu_access_token",
		Value:    accessToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Expires:  exp,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "csedu_refresh_token",
		Value:    refreshToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		Expires:  time.Now().AddDate(0, 0, refreshDays()),
	})
}

func randomState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
