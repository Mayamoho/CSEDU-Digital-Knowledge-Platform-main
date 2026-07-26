package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// Server-Sent Events only work if the handler can assert http.Flusher on the
// writer it is given. The audit and metrics middleware wrap every response, so
// that wrapper has to carry Flush through — otherwise the AI chat stream falls
// back to the non-streaming path on every request.
func TestStatusWriterIsFlusher(t *testing.T) {
	rec := httptest.NewRecorder()
	sw := &statusWriter{ResponseWriter: rec, status: http.StatusOK}

	f, ok := interface{}(sw).(http.Flusher)
	if !ok {
		t.Fatal("statusWriter must implement http.Flusher or SSE responses break")
	}
	f.Flush()
	if !rec.Flushed {
		t.Error("Flush did not reach the underlying ResponseWriter")
	}

	if u, ok := interface{}(sw).(interface{ Unwrap() http.ResponseWriter }); !ok {
		t.Error("statusWriter should expose Unwrap for http.ResponseController")
	} else if u.Unwrap() != http.ResponseWriter(rec) {
		t.Error("Unwrap returned the wrong writer")
	}
}
