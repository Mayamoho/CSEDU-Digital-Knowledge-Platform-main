package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"ok":true}`))
	})
}

func tokenFor(t *testing.T, role string) string {
	t.Helper()
	tok, _, err := authpkg.IssueAccessToken("11111111-1111-1111-1111-111111111111", role)
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	return tok
}

func TestAuthenticateRejectsMissingAndMalformedTokens(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	tests := []struct {
		name   string
		header string
	}{
		{"no Authorization header", ""},
		{"wrong scheme", "Basic YWRtaW46YWRtaW4="},
		{"bearer with junk", "Bearer not.a.jwt"},
		{"bearer with empty token", "Bearer "},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			rec := httptest.NewRecorder()

			Authenticate(okHandler()).ServeHTTP(rec, req)

			if rec.Code != http.StatusUnauthorized {
				t.Errorf("expected 401, got %d", rec.Code)
			}
		})
	}
}

func TestAuthenticateInjectsClaimsIntoContext(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	var gotUser, gotRole string
	probe := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotUser, _ = r.Context().Value(authpkg.CtxUserID).(string)
		gotRole, _ = r.Context().Value(authpkg.CtxRoleTier).(string)
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, "librarian"))
	rec := httptest.NewRecorder()

	Authenticate(probe).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	if gotUser != "11111111-1111-1111-1111-111111111111" {
		t.Errorf("user_id not injected: %q", gotUser)
	}
	if gotRole != "librarian" {
		t.Errorf("role_tier not injected: %q", gotRole)
	}
}

// The RBAC matrix from SDD §6.2, expressed as a test. Every row is a real
// route guard used in cmd/api/main.go.
func TestRequireRoleMatrix(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	tests := []struct {
		name     string
		guard    []string
		role     string
		wantCode int
	}{
		{"student cannot add catalog books", []string{"librarian", "administrator"}, "student", http.StatusForbidden},
		{"researcher cannot add catalog books", []string{"librarian", "administrator"}, "researcher", http.StatusForbidden},
		{"librarian can add catalog books", []string{"librarian", "administrator"}, "librarian", http.StatusOK},
		{"administrator can add catalog books", []string{"librarian", "administrator"}, "administrator", http.StatusOK},
		{"librarian cannot change user roles", []string{"administrator"}, "librarian", http.StatusForbidden},
		{"administrator can change user roles", []string{"administrator"}, "administrator", http.StatusOK},
		{"student cannot review papers", []string{"researcher", "administrator"}, "student", http.StatusForbidden},
		{"researcher can review papers", []string{"researcher", "administrator"}, "researcher", http.StatusOK},
		{"student can submit a project", []string{"student", "researcher", "administrator"}, "student", http.StatusOK},
		{"librarian cannot submit a project", []string{"student", "researcher", "administrator"}, "librarian", http.StatusForbidden},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/library/catalog", nil)
			req.Header.Set("Authorization", "Bearer "+tokenFor(t, tc.role))
			rec := httptest.NewRecorder()

			// Exactly how main.go composes them: Authenticate then RequireRole.
			Authenticate(RequireRole(tc.guard...)(okHandler())).ServeHTTP(rec, req)

			if rec.Code != tc.wantCode {
				t.Errorf("role %q against guard %v: expected %d, got %d",
					tc.role, tc.guard, tc.wantCode, rec.Code)
			}
		})
	}
}

func TestRequireRoleWithoutAuthenticateIs401(t *testing.T) {
	// RequireRole must never fall open when the context has no role.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/users", nil)
	rec := httptest.NewRecorder()

	RequireRole("administrator")(okHandler()).ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with no claims in context, got %d", rec.Code)
	}
}

func TestOptionalAuthAllowsAnonymousAndEnrichesAuthenticated(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	var role string
	probe := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		role, _ = r.Context().Value(authpkg.CtxRoleTier).(string)
		w.WriteHeader(http.StatusOK)
	})

	// Anonymous: public catalog browsing must still work.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/library/catalog", nil)
	rec := httptest.NewRecorder()
	OptionalAuth(probe).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("anonymous request should pass, got %d", rec.Code)
	}
	if role != "" {
		t.Errorf("anonymous request should carry no role, got %q", role)
	}

	// Authenticated: the same route now knows who is asking, so restricted
	// rows can be included.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/library/catalog", nil)
	req.Header.Set("Authorization", "Bearer "+tokenFor(t, "researcher"))
	rec = httptest.NewRecorder()
	OptionalAuth(probe).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("authenticated request should pass, got %d", rec.Code)
	}
	if role != "researcher" {
		t.Errorf("expected role researcher in context, got %q", role)
	}

	// A garbage token must not be treated as a valid session, but must also
	// not break public browsing.
	req = httptest.NewRequest(http.MethodGet, "/api/v1/library/catalog", nil)
	req.Header.Set("Authorization", "Bearer garbage.token.here")
	rec = httptest.NewRecorder()
	role = ""
	OptionalAuth(probe).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("invalid token should degrade to anonymous, got %d", rec.Code)
	}
	if role != "" {
		t.Errorf("invalid token must not populate a role, got %q", role)
	}
}
