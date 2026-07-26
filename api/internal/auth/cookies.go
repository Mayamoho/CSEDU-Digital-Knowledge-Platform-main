package auth

import (
	"net/http"
	"os"
	"strings"
	"time"
)

// Session cookies.
//
// The access token used to live only in the browser's localStorage, which any
// successful XSS can read and exfiltrate wholesale. These cookies are HttpOnly,
// so script running on the page cannot read them at all, and the browser
// attaches them automatically.
//
// The Authorization header still works and is still what the API checks first:
// the OAuth and magic-link flows hand the token to the frontend out of band,
// and dropping header auth would break every existing client and API test. The
// cookie is the durable session; the header is the explicit one.

const (
	AccessCookieName  = "csedu_access"
	RefreshCookieName = "csedu_refresh"
)

// cookieSecure reports whether cookies must be HTTPS-only. Production serves
// the platform over TLS at devops.farefin.com, but local development is plain
// HTTP on localhost — a Secure cookie there would simply never be stored, so
// this follows COOKIE_SECURE and defaults to on.
func cookieSecure() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("COOKIE_SECURE")))
	return v != "false" && v != "0" && v != "no"
}

// sameSite is Lax by default: the frontend and API are same-site behind nginx,
// and Lax still blocks the cross-site POST that CSRF depends on. A deployment
// that genuinely serves the two from different sites can set COOKIE_SAMESITE=none.
func sameSite() http.SameSite {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("COOKIE_SAMESITE"))) {
	case "none":
		return http.SameSiteNoneMode
	case "strict":
		return http.SameSiteStrictMode
	default:
		return http.SameSiteLaxMode
	}
}

// SetSessionCookies issues the HttpOnly session pair after a successful login,
// registration, refresh, magic-link verification or OAuth callback.
func SetSessionCookies(w http.ResponseWriter, accessToken string, accessExpiry time.Time, refreshToken string) {
	http.SetCookie(w, &http.Cookie{
		Name:     AccessCookieName,
		Value:    accessToken,
		Path:     "/",
		Expires:  accessExpiry,
		HttpOnly: true,
		Secure:   cookieSecure(),
		SameSite: sameSite(),
	})
	if refreshToken != "" {
		http.SetCookie(w, &http.Cookie{
			Name:     RefreshCookieName,
			Value:    refreshToken,
			Path:     "/",
			Expires:  RefreshExpiry(),
			HttpOnly: true,
			Secure:   cookieSecure(),
			SameSite: sameSite(),
		})
	}
}

// ClearSessionCookies expires both cookies on logout.
func ClearSessionCookies(w http.ResponseWriter) {
	for _, name := range []string{AccessCookieName, RefreshCookieName} {
		http.SetCookie(w, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			Expires:  time.Unix(0, 0),
			MaxAge:   -1,
			HttpOnly: true,
			Secure:   cookieSecure(),
			SameSite: sameSite(),
		})
	}
}

// TokenFromRequest returns the caller's access token: the Authorization header
// when present, otherwise the session cookie.
func TokenFromRequest(r *http.Request) string {
	if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}
	if c, err := r.Cookie(AccessCookieName); err == nil {
		return c.Value
	}
	return ""
}
