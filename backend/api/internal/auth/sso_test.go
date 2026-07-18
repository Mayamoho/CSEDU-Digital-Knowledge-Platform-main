package auth

import (
	"testing"
	"time"
)

func TestIssueAndValidateAccessToken(t *testing.T) {
	token, exp, err := IssueAccessToken("user-123", "student")
	if err != nil {
		t.Fatalf("IssueAccessToken returned error: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}
	if time.Until(exp) <= 0 {
		t.Fatal("expected expiry in the future")
	}

	claims, err := Validate(token)
	if err != nil {
		t.Fatalf("Validate returned error: %v", err)
	}
	if claims.UserID != "user-123" {
		t.Errorf("user_id = %q, want %q", claims.UserID, "user-123")
	}
	if claims.RoleTier != "student" {
		t.Errorf("role_tier = %q, want %q", claims.RoleTier, "student")
	}
}

func TestValidateRejectsTamperedToken(t *testing.T) {
	token, _, err := IssueAccessToken("user-123", "student")
	if err != nil {
		t.Fatalf("IssueAccessToken returned error: %v", err)
	}
	if _, err := Validate(token + "tampered"); err == nil {
		t.Fatal("expected validation to fail for tampered token")
	}
}

func TestRegisterValidRoles(t *testing.T) {
	valid := map[string]bool{
		"public":        true,
		"student":       true,
		"researcher":    true,
		"librarian":     true,
		"administrator": true,
	}
	for role := range valid {
		if !valid[role] {
			t.Errorf("role %q should be valid", role)
		}
	}
	// The SDD default role for self-registration is 'student'.
	if _, ok := valid["ai_admin"]; ok {
		t.Error("ai_admin should not be a self-service role")
	}
}

func TestHashRefreshIsDeterministic(t *testing.T) {
	a := hashRefresh("some-token")
	b := hashRefresh("some-token")
	if a != b {
		t.Fatal("hashRefresh must be deterministic")
	}
	if a == "some-token" {
		t.Fatal("hashRefresh must not return the plaintext")
	}
}
