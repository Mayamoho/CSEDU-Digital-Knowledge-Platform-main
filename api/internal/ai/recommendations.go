package ai

import (
	"context"
	"net/http"
	"strings"

	authpkg "github.com/csedu/platform/api/internal/auth"
)

// FR-AI-017 (Recommendations): "the AI Agent shall provide personalized
// suggestions."
//
// Deliberately not an LLM call. The signal we need — what this user borrowed,
// uploaded and asked about — is already structured in our own tables, so
// content-based matching in SQL gives a better answer than a language model
// guessing, returns in milliseconds, and costs nothing against the Groq free
// tier. Every suggestion carries the reason it was picked, so the user can see
// why the platform is recommending it.

type recommendation struct {
	Kind      string `json:"kind"` // "book" | "media"
	ID        string `json:"id"`
	Title     string `json:"title"`
	Subtitle  string `json:"subtitle,omitempty"`
	ItemType  string `json:"item_type,omitempty"`
	Reason    string `json:"reason"`
	Available *bool  `json:"available,omitempty"`
}

// interestTerms gathers the user's topical fingerprint: topics of books they
// borrowed, keywords/tags on things they uploaded, and words from their recent
// assistant queries.
func (h *Handler) interestTerms(ctx context.Context, userID string) (topics []string, terms []string) {
	seenTopic := map[string]bool{}
	seenTerm := map[string]bool{}

	addTerm := func(s string) {
		s = strings.ToLower(strings.TrimSpace(s))
		if len(s) < 4 || seenTerm[s] || stopWords[s] {
			return
		}
		seenTerm[s] = true
		terms = append(terms, s)
	}

	if rows, err := h.db.Query(ctx,
		`SELECT DISTINCT lc.topic
		   FROM loans l JOIN library_catalog lc ON lc.catalog_id = l.catalog_id
		  WHERE l.user_id = $1`, userID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var t string
			if rows.Scan(&t) == nil && t != "" && !seenTopic[t] {
				seenTopic[t] = true
				topics = append(topics, t)
				addTerm(t)
			}
		}
	}

	if rows, err := h.db.Query(ctx,
		`SELECT unnest(mm.keywords || mm.tags)
		   FROM media_metadata mm JOIN media_items m ON m.item_id = mm.item_id
		  WHERE m.created_by = $1 LIMIT 100`, userID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var kw string
			if rows.Scan(&kw) == nil {
				addTerm(kw)
			}
		}
	}

	if rows, err := h.db.Query(ctx,
		`SELECT query FROM ai_chat_messages
		  WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`, userID); err == nil {
		defer rows.Close()
		for rows.Next() {
			var q string
			if rows.Scan(&q) == nil {
				for _, word := range strings.FieldsFunc(q, func(r rune) bool {
					return !('a' <= r && r <= 'z') && !('A' <= r && r <= 'Z') && !('0' <= r && r <= '9')
				}) {
					addTerm(word)
				}
			}
		}
	}

	// Cap the term list: beyond this the match stops being "personalized" and
	// starts matching everything.
	if len(terms) > 40 {
		terms = terms[:40]
	}
	return topics, terms
}

// stopWords are the query words that carry no topical signal. Kept small and
// English-only on purpose — Bangla queries fall through to the keyword and
// topic signals, which are language independent.
var stopWords = map[string]bool{
	"what": true, "when": true, "where": true, "which": true, "about": true,
	"there": true, "these": true, "those": true, "have": true, "with": true,
	"from": true, "that": true, "this": true, "your": true, "does": true,
	"tell": true, "show": true, "list": true, "give": true, "find": true,
	"please": true, "csedu": true, "platform": true, "library": true,
}

// GET /api/v1/ai/recommendations
func (h *Handler) Recommendations(w http.ResponseWriter, r *http.Request) {
	userID, ok := authpkg.GetUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	roleTier, _ := authpkg.GetRoleTier(r)
	ctx := r.Context()

	topics, terms := h.interestTerms(ctx, userID)
	out := []recommendation{}
	seen := map[string]bool{}
	add := func(rec recommendation) {
		if seen[rec.ID] {
			return
		}
		seen[rec.ID] = true
		out = append(out, rec)
	}

	// ── Books ────────────────────────────────────────────────────────────────
	// Same topic as something the user already borrowed, still on the shelf,
	// and not a book they are holding right now.
	if len(topics) > 0 {
		if rows, err := h.db.Query(ctx,
			`SELECT lc.catalog_id::text, lc.title, lc.author, lc.topic,
			        lc.available_copies > 0
			   FROM library_catalog lc
			  WHERE lc.topic = ANY($1::text[])
			    AND NOT EXISTS (
			          SELECT 1 FROM loans l
			           WHERE l.catalog_id = lc.catalog_id AND l.user_id = $2
			                 AND l.return_date IS NULL)
			    AND NOT EXISTS (
			          SELECT 1 FROM loans l2
			           WHERE l2.catalog_id = lc.catalog_id AND l2.user_id = $2)
			  ORDER BY lc.available_copies DESC, lc.created_at DESC
			  LIMIT 4`, topics, userID); err == nil {
			defer rows.Close()
			for rows.Next() {
				var rec recommendation
				var author, topic string
				var available bool
				if rows.Scan(&rec.ID, &rec.Title, &author, &topic, &available) == nil {
					rec.Kind = "book"
					rec.Subtitle = author
					rec.Available = &available
					rec.Reason = "Same topic as books you borrowed (" + topic + ")"
					add(rec)
				}
			}
		}
	}

	// Cold start: a brand-new member has no history, so show what the
	// department actually reads rather than nothing at all.
	if len(out) == 0 {
		if rows, err := h.db.Query(ctx,
			`SELECT lc.catalog_id::text, lc.title, lc.author, lc.available_copies > 0
			   FROM library_catalog lc
			   LEFT JOIN loans l ON l.catalog_id = lc.catalog_id
			  GROUP BY lc.catalog_id
			  ORDER BY COUNT(l.loan_id) DESC, lc.created_at DESC
			  LIMIT 3`); err == nil {
			defer rows.Close()
			for rows.Next() {
				var rec recommendation
				var author string
				var available bool
				if rows.Scan(&rec.ID, &rec.Title, &author, &available) == nil {
					rec.Kind = "book"
					rec.Subtitle = author
					rec.Available = &available
					rec.Reason = "Popular with other members"
					add(rec)
				}
			}
		}
	}

	// ── Archive / research / projects ────────────────────────────────────────
	// Access tiers mirror the media listing rules, so a recommendation never
	// points at something the user is not allowed to open (FR-AI-007).
	tierFilter := `m.access_tier = 'public'`
	switch roleTier {
	case "researcher", "librarian", "administrator":
		tierFilter = `TRUE`
	case "student":
		tierFilter = `m.access_tier IN ('public', 'student')`
	}

	if len(terms) > 0 {
		if rows, err := h.db.Query(ctx,
			`SELECT m.item_id::text, m.title, m.item_type,
			        (SELECT string_agg(k, ', ') FROM unnest(mm.keywords) k
			          WHERE lower(k) = ANY($1::text[]))
			   FROM media_items m
			   JOIN media_metadata mm ON mm.item_id = m.item_id
			  WHERE m.status = 'published'
			    AND `+tierFilter+`
			    AND m.created_by IS DISTINCT FROM $2::uuid
			    AND EXISTS (
			          SELECT 1 FROM unnest(mm.keywords || mm.tags) k
			           WHERE lower(k) = ANY($1::text[]))
			  ORDER BY m.upload_date DESC
			  LIMIT 4`, terms, userID); err == nil {
			defer rows.Close()
			for rows.Next() {
				var rec recommendation
				var matched *string
				if rows.Scan(&rec.ID, &rec.Title, &rec.ItemType, &matched) == nil {
					rec.Kind = "media"
					rec.Reason = "Matches your interests"
					if matched != nil && *matched != "" {
						rec.Reason = "Matches your interest in " + *matched
					}
					add(rec)
				}
			}
		}
	}

	// Nothing matched the profile — fall back to the newest published work the
	// user is allowed to see.
	if len(out) < 4 {
		if rows, err := h.db.Query(ctx,
			`SELECT m.item_id::text, m.title, m.item_type
			   FROM media_items m
			  WHERE m.status = 'published'
			    AND `+tierFilter+`
			    AND m.created_by IS DISTINCT FROM $1::uuid
			  ORDER BY m.upload_date DESC
			  LIMIT 3`, userID); err == nil {
			defer rows.Close()
			for rows.Next() {
				var rec recommendation
				if rows.Scan(&rec.ID, &rec.Title, &rec.ItemType) == nil {
					rec.Kind = "media"
					rec.Reason = "Recently published on the platform"
					add(rec)
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"recommendations": out,
		"personalized":    len(topics) > 0 || len(terms) > 0,
	})
}
