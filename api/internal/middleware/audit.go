package middleware

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// Audit transparently records every mutating request, auth attempt, AI query,
// and access denial in the append-only audit_log table (SDD §6.5). Individual
// handlers never call it — the middleware handles logging for all routes.
//
// Rows: actor (nil for anonymous), action ("POST /auth/login → 200"),
// resource type (top-level API area), resource id (first UUID in the path),
// and client IP (RealIP middleware runs earlier in the chain).
func Audit(db *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(sw, r)

			if !shouldAudit(r.Method, r.URL.Path, sw.status) {
				return
			}

			// The audit middleware sits outside Authenticate, so the user is
			// not in this request's context — resolve the actor from the
			// Bearer token directly (nil for anonymous requests).
			var actorID any
			if header := r.Header.Get("Authorization"); strings.HasPrefix(header, "Bearer ") {
				if claims, err := authpkg.Validate(strings.TrimPrefix(header, "Bearer ")); err == nil {
					actorID = claims.UserID
				}
			}

			action := r.Method + " " + trimAPIPrefix(r.URL.Path) + " → " + httpStatusText(sw.status)
			resourceType := resourceTypeOf(r.URL.Path)
			var resourceID any
			if id := firstUUID(r.URL.Path); id != "" {
				resourceID = id
			}
			ip := clientIP(r)

			// Fire-and-forget: audit writes must never block or fail a request.
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_, _ = db.Exec(ctx,
					`INSERT INTO audit_log (actor_id, action, resource_type, resource_id, ip_addr)
					 VALUES ($1, $2, $3, $4, $5)`,
					actorID, action, resourceType, resourceID, ip)
			}()
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

var uuidRE = regexp.MustCompile(
	`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// shouldAudit: all mutating requests, every access denial, and AI queries.
// Plain successful GETs are skipped to keep the log signal-dense.
func shouldAudit(method, path string, status int) bool {
	if strings.HasPrefix(path, "/health") {
		return false
	}
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	}
	if status == http.StatusUnauthorized || status == http.StatusForbidden ||
		status == http.StatusTooManyRequests {
		return true
	}
	return false
}

func trimAPIPrefix(path string) string {
	return strings.TrimPrefix(path, "/api/v1")
}

// resourceTypeOf maps /api/v1/<area>/... to <area> ("auth", "library", "ai", …).
func resourceTypeOf(path string) string {
	p := strings.TrimPrefix(trimAPIPrefix(path), "/")
	if i := strings.IndexByte(p, '/'); i > 0 {
		p = p[:i]
	}
	if p == "" {
		p = "root"
	}
	return p
}

func firstUUID(path string) string {
	return uuidRE.FindString(path)
}

func clientIP(r *http.Request) string {
	// chi RealIP middleware rewrites RemoteAddr from X-Real-IP/X-Forwarded-For.
	ip := r.RemoteAddr
	if i := strings.LastIndexByte(ip, ':'); i > 0 && strings.Count(ip, ":") == 1 {
		ip = ip[:i]
	}
	return ip
}

func httpStatusText(code int) string {
	switch {
	case code >= 200 && code < 300:
		return "ok"
	case code == 401:
		return "unauthorized"
	case code == 403:
		return "denied"
	case code == 429:
		return "rate-limited"
	default:
		return http.StatusText(code)
	}
}
