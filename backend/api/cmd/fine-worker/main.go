package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/csedu/platform/api/internal/email"
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

	mailer := email.NewClient()

	// Configuration
	fineRatePerDay := getEnvFloat("FINE_RATE_BDT_PER_DAY", 50.0)
	maxFinePerLoan := getEnvFloat("MAX_FINE_PER_LOAN_BDT", 500.0)
	runInterval := getEnvDuration("FINE_CALC_INTERVAL", 24*time.Hour)

	log.Printf("Configuration: Rate=%.2f BDT/day, Max=%.2f BDT, Interval=%v",
		fineRatePerDay, maxFinePerLoan, runInterval)

	// Run immediately on start, then on schedule
	runCycle(pool, mailer, fineRatePerDay, maxFinePerLoan)

	ticker := time.NewTicker(runInterval)
	defer ticker.Stop()

	for range ticker.C {
		runCycle(pool, mailer, fineRatePerDay, maxFinePerLoan)
	}
}

// runCycle performs one pass of fine calculation + hold-fulfillment checks.
func runCycle(pool *pgxpool.Pool, mailer *email.Client, ratePerDay, maxFine float64) {
	calculateFines(pool, mailer, ratePerDay, maxFine)
	processHoldFulfillments(pool, mailer)
}

func calculateFines(pool *pgxpool.Pool, mailer *email.Client, ratePerDay, maxFine float64) {
	ctx := context.Background()
	log.Println("Starting fine calculation...")

	// Find all overdue loans with user + book details for notification.
	query := `
		SELECT l.loan_id, l.user_id, l.due_date,
		       u.email, u.name,
		       c.title
		FROM loans l
		JOIN users u ON u.user_id = l.user_id
		JOIN library_catalog c ON c.catalog_id = l.catalog_id
		WHERE l.return_date IS NULL
		  AND l.due_date < now()
		  AND l.status = 'active'
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
		var loanID, userID, userEmail, userName, bookTitle string
		var dueDate time.Time

		if err := rows.Scan(&loanID, &userID, &dueDate, &userEmail, &userName, &bookTitle); err != nil {
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
			created++
			log.Printf("Fine for loan %s: %.2f BDT (%d days overdue)", loanID, fineAmount, daysOverdue)

			// Send overdue notification email (SDD §3.1.3).
			if notifyErr := mailer.SendOverdueNotification(
				userEmail, userName, bookTitle,
				dueDate.Format("2006-01-02"), fineAmount,
			); notifyErr != nil {
				log.Printf("Overdue email failed for %s: %v", userEmail, notifyErr)
			}
		} else {
			updated++
		}
	}

	log.Printf("Fine calculation complete: %d loans processed, %d fines created, %d updated",
		processed, created, updated)
}

// processHoldFulfillments finds active holds whose catalog item now has an
// available copy, marks the hold fulfilled, records notified_at, and emails
// the member (SDD Flow 3 / §4.1 holds).
func processHoldFulfillments(pool *pgxpool.Pool, mailer *email.Client) {
	ctx := context.Background()
	log.Println("Checking hold fulfillments...")

	query := `
		SELECT h.hold_id, h.user_id, h.catalog_id,
		       u.email, u.name, c.title
		FROM holds h
		JOIN users u ON u.user_id = h.user_id
		JOIN library_catalog c ON c.catalog_id = h.catalog_id
		WHERE h.status = 'active'
		  AND h.notified_at IS NULL
		  AND c.available_copies > 0
	`

	rows, err := pool.Query(ctx, query)
	if err != nil {
		log.Printf("Error querying fulfillable holds: %v", err)
		return
	}
	defer rows.Close()

	fulfilled := 0
	for rows.Next() {
		var holdID, userID, catalogID, userEmail, userName, bookTitle string
		if err := rows.Scan(&holdID, &userID, &catalogID, &userEmail, &userName, &bookTitle); err != nil {
			log.Printf("Error scanning hold row: %v", err)
			continue
		}

		_, err = pool.Exec(ctx, `
			UPDATE holds
			SET status = 'fulfilled', notified_at = now()
			WHERE hold_id = $1
		`, holdID)
		if err != nil {
			log.Printf("Error fulfilling hold %s: %v", holdID, err)
			continue
		}

		fulfilled++
		log.Printf("Hold %s fulfilled for %s (%s)", holdID, userName, bookTitle)

		if notifyErr := mailer.SendHoldAvailableNotification(userEmail, userName, bookTitle); notifyErr != nil {
			log.Printf("Hold-available email failed for %s: %v", userEmail, notifyErr)
		}
	}

	if fulfilled > 0 {
		log.Printf("Hold fulfillment complete: %d holds fulfilled", fulfilled)
	}
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
