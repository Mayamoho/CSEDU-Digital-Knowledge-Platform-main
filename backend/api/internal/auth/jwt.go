package auth

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type Claims struct {
	UserID   string `json:"user_id"`
	RoleTier string `json:"role_tier"`
	jwt.RegisteredClaims
}

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "dev_jwt_secret_change_in_production_must_be_32_chars_min"
	}
	return []byte(s)
}

func expiryHours() int {
	h, err := strconv.Atoi(os.Getenv("JWT_EXPIRY_HOURS"))
	if err != nil || h <= 0 {
		return 1
	}
	return h
}

func refreshDays() int {
	d, err := strconv.Atoi(os.Getenv("REFRESH_EXPIRY_DAYS"))
	if err != nil || d <= 0 {
		return 7
	}
	return d
}

// IssueAccessToken creates a short-lived JWT for the given user.
func IssueAccessToken(userID, roleTier string) (string, time.Time, error) {
	exp := time.Now().Add(time.Duration(expiryHours()) * time.Hour)
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID:   userID,
		RoleTier: roleTier,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ID:        uuid.New().String(),
		},
	})
	signed, err := t.SignedString(jwtSecret())
	return signed, exp, err
}

// IssueRefreshToken creates an opaque random string with a long TTL.
// The actual token value is stored (hashed) in the DB by the caller.
func IssueRefreshToken() string {
	return uuid.New().String() + uuid.New().String()
}

func RefreshExpiry() time.Time {
	return time.Now().AddDate(0, 0, refreshDays())
}

// Validate parses and verifies a JWT, returning its claims.
func Validate(tokenStr string) (*Claims, error) {
	t, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return jwtSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := t.Claims.(*Claims)
	if !ok || !t.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}
