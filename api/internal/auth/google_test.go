package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func withGoogleEnv(t *testing.T) {
	t.Setenv("GOOGLE_CLIENT_ID", "test-client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "test-secret")
	t.Setenv("GOOGLE_REDIRECT_URI", "https://example.test/api/v1/auth/google/callback")
}

func TestGoogleLogin_DisabledReturns503(t *testing.T) {
	// No Google env set → feature disabled.
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	t.Setenv("GOOGLE_REDIRECT_URI", "")

	h := &Handler{}
	rec := httptest.NewRecorder()
	h.GoogleLogin(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/login", nil))

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when disabled, got %d", rec.Code)
	}
}

func TestGoogleLogin_RedirectsToGoogleWithState(t *testing.T) {
	withGoogleEnv(t)

	h := &Handler{}
	rec := httptest.NewRecorder()
	h.GoogleLogin(rec, httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/login", nil))

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302, got %d", rec.Code)
	}
	loc := rec.Header().Get("Location")
	if !strings.HasPrefix(loc, googleAuthURL) {
		t.Fatalf("expected redirect to Google, got %q", loc)
	}
	for _, want := range []string{"client_id=test-client-id", "response_type=code", "scope=openid", "state="} {
		if !strings.Contains(loc, want) {
			t.Errorf("redirect URL missing %q: %s", want, loc)
		}
	}

	// A CSRF state cookie must be set.
	var found bool
	for _, c := range rec.Result().Cookies() {
		if c.Name == oauthStateCookie && c.Value != "" && c.HttpOnly {
			found = true
		}
	}
	if !found {
		t.Error("expected an HttpOnly state cookie to be set")
	}
}

func TestGoogleCallback_StateMismatchRedirectsWithError(t *testing.T) {
	withGoogleEnv(t)

	h := &Handler{}
	rec := httptest.NewRecorder()
	// No state cookie present → mismatch.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback?state=abc&code=xyz", nil)
	h.GoogleCallback(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected 302 redirect, got %d", rec.Code)
	}
	if loc := rec.Header().Get("Location"); !strings.Contains(loc, "sso_error=state_mismatch") {
		t.Fatalf("expected state_mismatch error redirect, got %q", loc)
	}
}
