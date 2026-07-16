package middleware

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus instrumentation (SDD §6.5). The prometheus service in
// infra/prometheus scrapes api:8080/metrics; these are the series it reads.
var (
	httpRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "HTTP requests by method, API area, and status code.",
	}, []string{"method", "area", "status"})

	httpDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request latency by API area.",
		Buckets: []float64{.01, .05, .1, .25, .5, 1, 2.5, 5, 10, 30},
	}, []string{"area"})
)

// Metrics records request counts and latency. Uses the coarse API area
// (auth/library/ai/…) as the path label to keep cardinality bounded.
func Metrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/metrics" || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(sw, r)

		area := resourceTypeOf(r.URL.Path)
		httpRequests.WithLabelValues(r.Method, area, strconv.Itoa(sw.status)).Inc()
		httpDuration.WithLabelValues(area).Observe(time.Since(start).Seconds())
	})
}
