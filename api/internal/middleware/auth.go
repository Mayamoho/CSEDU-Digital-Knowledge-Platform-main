package middleware

import (
	"context"
	"net/http"
	"strings"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// Authenticate validates the Bearer JWT and injects user_id + role_tier into context.
// Requests without a valid token are rejected with 401.
func Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, `{"message":"missing or invalid Authorization header"}`, http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		claims, err := authpkg.Validate(tokenStr)
		if err != nil {
			http.Error(w, `{"message":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		ctx := context.WithValue(r.Context(), authpkg.CtxUserID, claims.UserID)
		ctx = context.WithValue(ctx, authpkg.CtxRoleTier, claims.RoleTier)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireRole ensures the authenticated user has one of the allowed role tiers.
// Must be used after Authenticate.
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]struct{}, len(roles))
	for _, r := range roles {
		allowed[r] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, ok := r.Context().Value(authpkg.CtxRoleTier).(string)
			if !ok {
				http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if _, permitted := allowed[role]; !permitted {
				http.Error(w, `{"message":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// OptionalAuth injects user info if a valid token is present, but does not block the request.
func OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			tokenStr := strings.TrimPrefix(header, "Bearer ")
			if claims, err := authpkg.Validate(tokenStr); err == nil {
				ctx := context.WithValue(r.Context(), authpkg.CtxUserID, claims.UserID)
				ctx = context.WithValue(ctx, authpkg.CtxRoleTier, claims.RoleTier)
				r = r.WithContext(ctx)
			}
		}
		next.ServeHTTP(w, r)
	})
}
