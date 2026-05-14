package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	log.Println("Fine Worker starting...")

	// Database connection
	dbURL := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		getEnv("DB_USER", "csedu_user"),
		getEnv("DB_PASSWORD", "changeme_in_dev"),
		getEnv("DB_HOST", "postgres"),
		getEnv("DB_PORT", "5432"),
		getEnv("DB_NAME", "csedu_platform"),
	)

	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	// Configuration
	fineRatePerDay := getEnvFloat("FINE_RATE_BDT_PER_DAY", 50.0)
	maxFinePerLoan := getEnvFloat("MAX_FINE_PER_LOAN_BDT", 500.0)
	runInterval := getEnvDuration("FINE_CALC_INTERVAL", 24*time.Hour)

	log.Printf("Configuration: Rate=%.2f BDT/day, Max=%.2f BDT, Interval=%v",
		fineRatePerDay, maxFinePerLoan, runInterval)

	// Run immediately on start, then on schedule
	calculateFines(pool, fineRatePerDay, maxFinePerLoan)

	ticker := time.NewTicker(runInterval)
	defer ticker.Stop()

	for range ticker.C {
		calculateFines(pool, fineRatePerDay, maxFinePerLoan)
	}
}

func calculateFines(pool *pgxpool.Pool, ratePerDay, maxFine float64) {
	ctx := context.Background()
	log.Println("Starting fine calculation...")

	// Find all overdue loans without return_date
	query := `
		SELECT loan_id, user_id, due_date
		FROM loans
		WHERE return_date IS NULL
		  AND due_date < now()
		  AND status = 'active'
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		log.Printf("Error querying overdue loans: %v", err)
		return
	}
	defer rows.Close()

	processed := 0
	created := 0
	updated := 0

	for rows.Next() {
		var loanID, userID string
		var dueDate time.Time

		if err := rows.Scan(&loanID, &userID, &dueDate); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}

		processed++

		// Calculate days overdue
		daysOverdue := int(time.Since(dueDate).Hours() / 24)
		if daysOverdue < 1 {
			continue // Not yet a full day overdue
		}

		// Calculate fine amount
		fineAmount := float64(daysOverdue) * ratePerDay
		if fineAmount > maxFine {
			fineAmount = maxFine
		}

		// Update loan status to overdue
		_, err = pool.Exec(ctx, `
			UPDATE loans
			SET status = 'overdue'
			WHERE loan_id = $1 AND status = 'active'
		`, loanID)

		if err != nil {
			log.Printf("Error updating loan status for %s: %v", loanID, err)
		}

		// Insert or update fine record (idempotent using ON CONFLICT)
		result, err := pool.Exec(ctx, `
			INSERT INTO fines (loan_id, user_id, amount, status, calculated_at)
			VALUES ($1, $2, $3, 'pending', now())
			ON CONFLICT (loan_id) 
			DO UPDATE SET 
				amount = EXCLUDED.amount,
				calculated_at = now()
			WHERE fines.status = 'pending'
		`, loanID, userID, fineAmount)

		if err != nil {
			log.Printf("Error upserting fine for loan %s: %v", loanID, err)
			continue
		}

		rowsAffected := result.RowsAffected()
		if rowsAffected > 0 {
			if result.String() == "INSERT" {
				created++
			} else {
				updated++
			}
			log.Printf("Fine for loan %s: %.2f BDT (%d days overdue)", loanID, fineAmount, daysOverdue)
		}
	}

	log.Printf("Fine calculation complete: %d loans processed, %d fines created, %d updated", 
		processed, created, updated)
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if value := os.Getenv(key); value != "" {
		if f, err := strconv.ParseFloat(value, 64); err == nil {
			return f
		}
	}
	return fallback
}

func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if d, err := time.ParseDuration(value); err == nil {
			return d
		}
	}
	return fallback
}
