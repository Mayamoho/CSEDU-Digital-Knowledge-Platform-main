package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestIssueAndValidateAccessToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	token, exp, err := IssueAccessToken("a0000000-0000-0000-0000-000000000001", "administrator")
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}
	if !exp.After(time.Now()) {
		t.Fatalf("expiry %v is not in the future", exp)
	}

	claims, err := Validate(token)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if claims.UserID != "a0000000-0000-0000-0000-000000000001" {
		t.Errorf("user_id round-trip failed: %q", claims.UserID)
	}
	if claims.RoleTier != "administrator" {
		t.Errorf("role_tier round-trip failed: %q", claims.RoleTier)
	}
	if claims.ID == "" {
		t.Error("jti should be populated so a token can be traced in the audit log")
	}
}

func TestValidateRejectsTamperedRole(t *testing.T) {
	// The whole RBAC model rests on this: a client cannot edit role_tier in the
	// payload, because the HMAC signature no longer verifies.
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	token, _, err := IssueAccessToken("d0000000-0000-0000-0000-000000000004", "student")
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("expected a three-part JWT, got %d parts", len(parts))
	}
	tampered := parts[0] + "." + parts[1] + "x." + parts[2]

	if _, err := Validate(tampered); err == nil {
		t.Fatal("a tampered payload was accepted — privilege escalation would be possible")
	}
}

func TestValidateRejectsForeignSecret(t *testing.T) {
	t.Setenv("JWT_SECRET", "secret_number_one_padded_to_thirty_two_chars")
	token, _, err := IssueAccessToken("u1", "librarian")
	if err != nil {
		t.Fatalf("IssueAccessToken: %v", err)
	}

	t.Setenv("JWT_SECRET", "secret_number_two_padded_to_thirty_two_chars")
	if _, err := Validate(token); err == nil {
		t.Fatal("a token signed with a different secret was accepted")
	}
}

func TestValidateRejectsNoneAlgorithm(t *testing.T) {
	// alg=none is the classic JWT bypass; the keyfunc must refuse anything
	// that is not HMAC.
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	unsigned := jwt.NewWithClaims(jwt.SigningMethodNone, Claims{
		UserID:   "attacker",
		RoleTier: "administrator",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	raw, err := unsigned.SignedString(jwt.UnsafeAllowNoneSignatureType)
	if err != nil {
		t.Fatalf("building the unsigned token: %v", err)
	}

	if _, err := Validate(raw); err == nil {
		t.Fatal("alg=none token was accepted — full authentication bypass")
	}
}

func TestValidateRejectsExpiredToken(t *testing.T) {
	t.Setenv("JWT_SECRET", "test_secret_that_is_at_least_32_characters_long")

	expired := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{
		UserID:   "u1",
		RoleTier: "student",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	})
	raw, err := expired.SignedString(jwtSecret())
	if err != nil {
		t.Fatalf("signing: %v", err)
	}

	if _, err := Validate(raw); err == nil {
		t.Fatal("an expired token was accepted")
	}
}

func TestExpiryAndRefreshDefaults(t *testing.T) {
	t.Setenv("JWT_EXPIRY_HOURS", "")
	if got := expiryHours(); got != 1 {
		t.Errorf("access token TTL should default to 1 hour, got %d", got)
	}
	t.Setenv("JWT_EXPIRY_HOURS", "0")
	if got := expiryHours(); got != 1 {
		t.Errorf("a zero TTL must not be honoured, got %d", got)
	}
	t.Setenv("REFRESH_EXPIRY_DAYS", "garbage")
	if got := refreshDays(); got != 7 {
		t.Errorf("refresh TTL should default to 7 days, got %d", got)
	}
}

func TestIssueRefreshTokenIsUnique(t *testing.T) {
	seen := make(map[string]struct{}, 500)
	for i := 0; i < 500; i++ {
		tok := IssueRefreshToken()
		if len(tok) < 32 {
			t.Fatalf("refresh token is too short to be unguessable: %d chars", len(tok))
		}
		if _, dup := seen[tok]; dup {
			t.Fatal("refresh token collision — sessions could be hijacked")
		}
		seen[tok] = struct{}{}
	}
}
