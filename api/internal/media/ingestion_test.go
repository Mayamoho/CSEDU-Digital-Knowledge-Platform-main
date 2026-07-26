package media

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// The fallback has to reach the RAG service the same way the rest of the stack
// does, or a Redis outage silently indexes nothing.
func TestRAGServiceURL(t *testing.T) {
	orig, had := os.LookupEnv("RAG_SERVICE_URL")
	t.Cleanup(func() {
		if had {
			os.Setenv("RAG_SERVICE_URL", orig)
		} else {
			os.Unsetenv("RAG_SERVICE_URL")
		}
	})

	os.Unsetenv("RAG_SERVICE_URL")
	if got := ragServiceURL(); got != "http://rag:8001" {
		t.Errorf("default = %q, want the in-network rag service", got)
	}

	os.Setenv("RAG_SERVICE_URL", "http://localhost:8001")
	if got := ragServiceURL(); got != "http://localhost:8001" {
		t.Errorf("override = %q, want the configured URL", got)
	}
}

// With Redis absent, queueIngestion must call the RAG service itself rather
// than dropping the item on the floor — the failure this fixes was uploads that
// were stored and listed but never indexed.
func TestQueueIngestionFallsBackToRAGWhenRedisMissing(t *testing.T) {
	hit := make(chan string, 1)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit <- r.URL.Path
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"indexed":3}`))
	}))
	defer srv.Close()

	t.Setenv("RAG_SERVICE_URL", srv.URL)

	// redis nil is exactly the "Redis unavailable" case from SDD §3.2.
	h := &Handler{redis: nil}
	h.queueIngestion(context.Background(), "abc-123", "uploads/x.pdf", "pdf", "user-1")

	select {
	case path := <-hit:
		if path != "/ingest/abc-123" {
			t.Errorf("called %q, want /ingest/abc-123", path)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("RAG service was never called — the item would never be indexed")
	}
}
