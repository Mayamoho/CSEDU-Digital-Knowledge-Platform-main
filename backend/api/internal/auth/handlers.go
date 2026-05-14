package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// ──────────────────────────────────────────────────────────────────────────────
// Request / Response types
// ──────────────────────────────────────────────────────────────────────────────

type registerReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
	Role     string `json:"role,omitempty"`
}

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type refreshReq struct {
	RefreshToken string `json:"refresh_token"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"` // seconds
}

type userResponse struct {
	UserID    string  `json:"user_id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	RoleTier  string  `json:"role_tier"`
	CreatedAt string  `json:"created_at"`
	LastLogin *string `json:"last_login"`
}

type registerResponse struct {
	User   userResponse  `json:"user"`
	Tokens tokenResponse `json:"tokens"`
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

var emailRE = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"message": msg})
}

func hashRefresh(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler factory
// ──────────────────────────────────────────────────────────────────────────────

type Handler struct{ db *pgxpool.Pool }

func NewHandler(db *pgxpool.Pool) *Handler { return &Handler{db: db} }

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	// Validation
	if !emailRE.MatchString(req.Email) || len(req.Email) > 254 {
		writeError(w, http.StatusBadRequest, "invalid email address")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	// Validate and set role (default to 'student' as per SDD)
	validRoles := map[string]bool{
		"public":       true,
		"student":      true,
		"researcher":   true,
		"librarian":    true,
		"administrator": true,
	}
	role := req.Role
	if role == "" || !validRoles[role] {
		role = "student" // Default role as per SDD
	}

	// Bcrypt cost 12 as per SDD
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var userID, createdAt string
	err = h.db.QueryRow(r.Context(),
		`INSERT INTO users (email, name, password_hash, role_tier)
		 VALUES ($1, $2, $3, $4)
		 RETURNING user_id, to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
		req.Email, req.Name, string(hash), role,
	).Scan(&userID, &createdAt)
	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "unique") || strings.Contains(errMsg, "duplicate") {
			writeError(w, http.StatusConflict, "email already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}

	accessToken, exp, err := IssueAccessToken(userID, role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	refreshToken := IssueRefreshToken()
	refreshExpiry := RefreshExpiry()
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashRefresh(refreshToken), refreshExpiry,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store token")
		return
	}

	writeJSON(w, http.StatusCreated, registerResponse{
		User: userResponse{
			UserID:    userID,
			Email:     req.Email,
			Name:      req.Name,
			RoleTier:  role,
			CreatedAt: createdAt,
			LastLogin: nil,
		},
		Tokens: tokenResponse{
			AccessToken:  accessToken,
			RefreshToken: refreshToken,
			ExpiresIn:    int(time.Until(exp).Seconds()),
		},
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var userID, name, roleTier, hash string
	var createdAt string
	var lastLogin *string
	err := h.db.QueryRow(r.Context(),
		`SELECT user_id, name, role_tier, password_hash,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(last_login,  'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM users WHERE email = $1`,
		req.Email,
	).Scan(&userID, &name, &roleTier, &hash, &createdAt, &lastLogin)
	if err != nil {
		// Constant-time response to prevent user enumeration
		_ = bcrypt.CompareHashAndPassword([]byte("$2a$12$dummy"), []byte(req.Password))
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	if err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	// Update last_login
	_, _ = h.db.Exec(r.Context(),
		`UPDATE users SET last_login = now() WHERE user_id = $1`, userID)

	accessToken, exp, err := IssueAccessToken(userID, roleTier)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	refreshToken := IssueRefreshToken()
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashRefresh(refreshToken), RefreshExpiry(),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store token")
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int(time.Until(exp).Seconds()),
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/refresh
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RefreshToken == "" {
		writeError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	tokenHash := hashRefresh(req.RefreshToken)
	var tokenID, userID string
	err := h.db.QueryRow(r.Context(),
		`SELECT token_id, user_id FROM refresh_tokens
		 WHERE token_hash = $1 AND revoked = false AND expires_at > now()`,
		tokenHash,
	).Scan(&tokenID, &userID)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid or expired refresh token")
		return
	}

	// Rotate: revoke old, issue new
	_, _ = h.db.Exec(r.Context(),
		`UPDATE refresh_tokens SET revoked = true WHERE token_id = $1`, tokenID)

	var roleTier string
	_ = h.db.QueryRow(r.Context(),
		`SELECT role_tier FROM users WHERE user_id = $1`, userID,
	).Scan(&roleTier)

	accessToken, exp, err := IssueAccessToken(userID, roleTier)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not issue token")
		return
	}

	newRefresh := IssueRefreshToken()
	_, err = h.db.Exec(r.Context(),
		`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		 VALUES ($1, $2, $3)`,
		userID, hashRefresh(newRefresh), RefreshExpiry(),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not store token")
		return
	}

	writeJSON(w, http.StatusOK, tokenResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefresh,
		ExpiresIn:    int(time.Until(exp).Seconds()),
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID := r.Context().Value(ctxUserID).(string)
	var u userResponse
	err := h.db.QueryRow(r.Context(),
		`SELECT user_id, email, name, role_tier,
		        to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		        to_char(last_login,  'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		 FROM users WHERE user_id = $1`, userID,
	).Scan(&u.UserID, &u.Email, &u.Name, &u.RoleTier, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// ──────────────────────────────────────────────────────────────────────────────
// POST /api/v1/auth/logout
// ──────────────────────────────────────────────────────────────────────────────

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	// Revoke all active refresh tokens for this user
	userID := r.Context().Value(ctxUserID)
	if userID != nil {
		_, _ = h.db.Exec(r.Context(),
			`UPDATE refresh_tokens SET revoked = true
			 WHERE user_id = $1 AND revoked = false`, userID.(string))
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "logged out"})
}

// contextKey avoids collisions in context values
type contextKey string

const ctxUserID   contextKey = "user_id"
const ctxRoleTier contextKey = "role_tier"

// GetUserID extracts user_id from request context (set by middleware).
func GetUserID(r *http.Request) (string, bool) {
	v, ok := r.Context().Value(ctxUserID).(string)
	return v, ok
}
// GetRoleTier extracts role_tier from request context.
func GetRoleTier(r *http.Request) (string, bool) {
	v, ok := r.Context().Value(ctxRoleTier).(string)
	return v, ok
}

// For middleware package use
var CtxUserID   = ctxUserID
var CtxRoleTier = ctxRoleTier
