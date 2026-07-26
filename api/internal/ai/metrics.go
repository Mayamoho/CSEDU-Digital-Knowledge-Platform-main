package ai

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// FR-AI-015 (AI Performance Monitoring): "logs response time, usage count" and
// "admin dashboard displays metrics".
//
// Two layers, on purpose:
//   - Prometheus series below, scraped from /metrics by the prometheus
//     container — live operational view, no database load.
//   - GET /api/v1/admin/ai-metrics, which aggregates ai_chat_messages so the
//     admin dashboard can show usage and quality without a Grafana login.

var (
	aiQueries = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ai_queries_total",
		Help: "AI assistant queries answered, by the model that produced the answer",
	}, []string{"model"})

	aiLatency = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "ai_query_duration_seconds",
		Help:    "End-to-end AI answer latency as measured by the Go API",
		Buckets: []float64{0.25, 0.5, 1, 2, 3, 5, 10, 20, 30},
	})

	aiCacheHits = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ai_cache_hits_total",
		Help: "AI answers served from the Redis response cache instead of the LLM",
	})

	aiBlockedQueries = promauto.NewCounter(prometheus.CounterOpts{
		Name: "ai_blocked_queries_total",
		Help: "Queries rejected by the prompt-injection guard before reaching an LLM",
	})

	aiFeedback = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "ai_feedback_total",
		Help: "Ratings submitted on AI answers",
	}, []string{"rating"})
)

func observeQuery(model string, d time.Duration) {
	if model == "" {
		model = "unknown"
	}
	aiQueries.WithLabelValues(model).Inc()
	aiLatency.Observe(d.Seconds())
}

// GET /api/v1/admin/ai-metrics — usage and quality summary for the admin
// dashboard. Mounted behind RequireRole("administrator").
func (h *Handler) AdminMetrics(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var summary struct {
		TotalQueries  int      `json:"total_queries"`
		Queries24h    int      `json:"queries_24h"`
		Queries7d     int      `json:"queries_7d"`
		UniqueUsers   int      `json:"unique_users"`
		Sessions      int      `json:"sessions"`
		AvgLatencyMS  *float64 `json:"avg_latency_ms"`
		P95LatencyMS  *float64 `json:"p95_latency_ms"`
		RatedHelpful  int      `json:"rated_helpful"`
		RatedUnhelp   int      `json:"rated_unhelpful"`
		WithCitations int      `json:"answers_with_citations"`
	}

	if err := h.db.QueryRow(ctx, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours'),
		       COUNT(*) FILTER (WHERE created_at > now() - interval '7 days'),
		       COUNT(DISTINCT user_id),
		       COUNT(DISTINCT session_id),
		       AVG(latency_ms)::float8,
		       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::float8,
		       COUNT(*) FILTER (WHERE rating = 1),
		       COUNT(*) FILTER (WHERE rating = -1),
		       COUNT(*) FILTER (WHERE array_length(source_doc_ids, 1) > 0)
		FROM ai_chat_messages`,
	).Scan(&summary.TotalQueries, &summary.Queries24h, &summary.Queries7d,
		&summary.UniqueUsers, &summary.Sessions, &summary.AvgLatencyMS,
		&summary.P95LatencyMS, &summary.RatedHelpful, &summary.RatedUnhelp,
		&summary.WithCitations); err != nil {
		writeError(w, http.StatusInternalServerError, "could not load AI metrics")
		return
	}

	type modelRow struct {
		Model        string   `json:"model"`
		Count        int      `json:"count"`
		AvgLatencyMS *float64 `json:"avg_latency_ms"`
	}
	models := []modelRow{}
	if rows, err := h.db.Query(ctx, `
		SELECT model_used, COUNT(*), AVG(latency_ms)::float8
		FROM ai_chat_messages
		GROUP BY model_used ORDER BY COUNT(*) DESC LIMIT 20`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var m modelRow
			if rows.Scan(&m.Model, &m.Count, &m.AvgLatencyMS) == nil {
				models = append(models, m)
			}
		}
	}

	type dayRow struct {
		Day   string `json:"day"`
		Count int    `json:"count"`
	}
	daily := []dayRow{}
	if rows, err := h.db.Query(ctx, `
		SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD'), COUNT(*)
		FROM ai_chat_messages
		WHERE created_at > now() - interval '14 days'
		GROUP BY 1 ORDER BY 1`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var d dayRow
			if rows.Scan(&d.Day, &d.Count) == nil {
				daily = append(daily, d)
			}
		}
	}

	// Most recent answers the users marked unhelpful — the actionable half of
	// the feedback loop (R01 in the SDD risk register).
	type gripe struct {
		Query     string  `json:"query"`
		Model     string  `json:"model_used"`
		Note      *string `json:"note"`
		CreatedAt string  `json:"created_at"`
	}
	gripes := []gripe{}
	if rows, err := h.db.Query(ctx, `
		SELECT query, model_used, feedback_note,
		       to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM ai_chat_messages
		WHERE rating = -1
		ORDER BY created_at DESC LIMIT 10`); err == nil {
		defer rows.Close()
		for rows.Next() {
			var g gripe
			if rows.Scan(&g.Query, &g.Model, &g.Note, &g.CreatedAt) == nil {
				gripes = append(gripes, g)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"summary":           summary,
		"by_model":          models,
		"daily":             daily,
		"recent_unhelpful":  gripes,
		"prometheus_scrape": "/metrics",
	})
}
