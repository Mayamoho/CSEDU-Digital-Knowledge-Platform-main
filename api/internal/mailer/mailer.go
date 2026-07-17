// Package mailer sends transactional email over SMTP (SDD §3.1.3).
//
// Configuration is entirely environment-driven:
//
//	SMTP_HOST     — server hostname; when empty the mailer is disabled and
//	                every Send becomes a logged no-op (safe default for dev)
//	SMTP_PORT     — default 587
//	SMTP_USER     — auth username (optional; unauthenticated relay if empty)
//	SMTP_PASSWORD — auth password
//	SMTP_FROM     — From address, default "CSEDU Platform <no-reply@cs.du.ac.bd>"
package mailer

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

// Enabled reports whether SMTP is configured.
func Enabled() bool {
	return os.Getenv("SMTP_HOST") != ""
}

// Send delivers a plain-text email. Errors are returned but callers are
// expected to treat delivery as best-effort (log, don't fail the request).
func Send(to, subject, body string) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		log.Printf("mailer disabled (SMTP_HOST unset) — would send to %s: %s", to, subject)
		return nil
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "CSEDU Platform <no-reply@cs.du.ac.bd>"
	}

	msg := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	var auth smtp.Auth
	if user := os.Getenv("SMTP_USER"); user != "" {
		auth = smtp.PlainAuth("", user, os.Getenv("SMTP_PASSWORD"), host)
	}

	addr := fmt.Sprintf("%s:%s", host, port)
	if err := smtp.SendMail(addr, auth, envelopeFrom(from), []string{to}, []byte(msg)); err != nil {
		log.Printf("mailer: FAILED to send %q to %s via %s: %v", subject, to, addr, err)
		return fmt.Errorf("smtp send to %s: %w", to, err)
	}
	// Success is logged so operators can confirm delivery attempts without a
	// debugger — the previous silent success made the mailer look broken.
	log.Printf("mailer: sent %q to %s via %s", subject, to, addr)
	return nil
}

// SendAsync fires Send in a goroutine and logs any failure.
func SendAsync(to, subject, body string) {
	go func() {
		if err := Send(to, subject, body); err != nil {
			log.Printf("mailer: %v", err)
		}
	}()
}

// envelopeFrom extracts the bare address from "Name <addr>" forms.
func envelopeFrom(from string) string {
	if i := strings.IndexByte(from, '<'); i >= 0 {
		if j := strings.IndexByte(from[i:], '>'); j > 0 {
			return from[i+1 : i+j]
		}
	}
	return from
}
