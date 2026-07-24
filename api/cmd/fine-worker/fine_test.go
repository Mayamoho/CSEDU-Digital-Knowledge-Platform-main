package main

import (
	"os"
	"testing"
	"time"
)

// The fine rule is the only place in the platform where money is computed, so
// it gets table-driven coverage of every boundary the SDD specifies.
func TestCalculateFineAmount(t *testing.T) {
	const (
		rate = 50.0  // FINE_RATE_BDT_PER_DAY default
		max  = 500.0 // MAX_FINE_PER_LOAN_BDT default
	)

	tests := []struct {
		name        string
		daysOverdue int
		want        float64
	}{
		{"not yet overdue is still charged one period", 0, 50},
		{"negative days clamp to one period", -3, 50},
		{"one day overdue", 1, 50},
		{"three days overdue", 3, 150},
		{"exactly at the cap", 10, 500},
		{"one day past the cap stays capped", 11, 500},
		{"far past the cap stays capped", 365, 500},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := calculateFineAmount(tc.daysOverdue, rate, max)
			if got != tc.want {
				t.Errorf("calculateFineAmount(%d, %.2f, %.2f) = %.2f, want %.2f",
					tc.daysOverdue, rate, max, got, tc.want)
			}
		})
	}
}

func TestCalculateFineAmountNeverExceedsCap(t *testing.T) {
	// Property: whatever the inputs, a single loan can never owe more than the cap.
	for days := 1; days <= 1000; days++ {
		if got := calculateFineAmount(days, 50, 500); got > 500 {
			t.Fatalf("cap breached after %d days: %.2f", days, got)
		}
	}
}

func TestGetEnvFloatFallsBackOnGarbage(t *testing.T) {
	t.Setenv("FINE_RATE_BDT_PER_DAY", "not-a-number")
	if got := getEnvFloat("FINE_RATE_BDT_PER_DAY", 50.0); got != 50.0 {
		t.Errorf("garbage env should fall back to 50.0, got %.2f", got)
	}

	t.Setenv("FINE_RATE_BDT_PER_DAY", "12.5")
	if got := getEnvFloat("FINE_RATE_BDT_PER_DAY", 50.0); got != 12.5 {
		t.Errorf("valid env should override the default, got %.2f", got)
	}

	os.Unsetenv("FINE_RATE_BDT_PER_DAY")
	if got := getEnvFloat("FINE_RATE_BDT_PER_DAY", 50.0); got != 50.0 {
		t.Errorf("unset env should use the default, got %.2f", got)
	}
}

func TestGetEnvDurationFallsBackOnGarbage(t *testing.T) {
	t.Setenv("FINE_CALC_INTERVAL", "every-so-often")
	if got := getEnvDuration("FINE_CALC_INTERVAL", 24*time.Hour); got != 24*time.Hour {
		t.Errorf("garbage interval should fall back to 24h, got %v", got)
	}

	t.Setenv("FINE_CALC_INTERVAL", "30m")
	if got := getEnvDuration("FINE_CALC_INTERVAL", 24*time.Hour); got != 30*time.Minute {
		t.Errorf("valid interval should override the default, got %v", got)
	}
}
