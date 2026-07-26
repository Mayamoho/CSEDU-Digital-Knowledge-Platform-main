package media

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// Ingestion dispatch with a Redis-free fallback (SDD §3.2).
//
// The design says: "If Redis is unavailable, the Go API falls back to
// synchronous ingestion inline." Until now it only logged the failed push, so a
// Redis outage meant uploads silently never reached the index — the file was
// stored and listed, but the assistant could not answer about it, and nothing
// ever retried.
//
// The fallback calls the RAG service's /ingest/{item_id} endpoint, which runs
// the same extract → chunk → embed → pgvector path the queue worker uses. It
// runs on a detached context rather than blocking the HTTP response: embedding a
// 100 MB PDF takes far longer than a browser will wait, and the SDD's intent is
// that the API performs the work itself instead of queueing it, not that the
// uploader sits and watches. The upload still returns immediately either way.

const ingestionQueue = "ingestion_jobs"

// ingestFallbackTimeout bounds the inline path. Generous, because it covers
// text extraction plus embedding of a large document, but finite so a wedged
// RAG service cannot leak goroutines.
const ingestFallbackTimeout = 10 * time.Minute

func ragServiceURL() string {
	if u := os.Getenv("RAG_SERVICE_URL"); u != "" {
		return u
	}
	return "http://rag:8001"
}

// queueIngestion asks for an item to be indexed. It prefers the Redis queue and
// falls back to indexing inline when Redis is absent or refuses the push.
// Best-effort throughout: indexing must never fail the upload that triggered it.
func (h *Handler) queueIngestion(ctx context.Context, itemID, filePath, format, userID string) {
	if h.redis != nil {
		job, err := json.Marshal(map[string]any{
			"item_id":   itemID,
			"file_path": filePath,
			"format":    format,
			"user_id":   userID,
			"timestamp": time.Now().Format(time.RFC3339),
		})
		if err == nil {
			if err := h.redis.LPush(ctx, ingestionQueue, job).Err(); err == nil {
				return
			} else {
				log.Printf("ingestion: queue push failed for %s (%v) — indexing inline instead", itemID, err)
			}
		}
	} else {
		log.Printf("ingestion: no Redis configured — indexing %s inline", itemID)
	}

	h.ingestInline(itemID)
}

// ingestInline drives the RAG service directly. Detached from the request
// context on purpose: the client's connection closing must not abort an
// ingestion that is already under way.
func (h *Handler) ingestInline(itemID string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), ingestFallbackTimeout)
		defer cancel()

		url := fmt.Sprintf("%s/ingest/%s", ragServiceURL(), itemID)
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(nil))
		if err != nil {
			log.Printf("ingestion: could not build inline request for %s: %v", itemID, err)
			h.markIngestionFailed(ctx, itemID, "inline ingestion could not be started")
			return
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: ingestFallbackTimeout}
		resp, err := client.Do(req)
		if err != nil {
			log.Printf("ingestion: inline ingest failed for %s: %v", itemID, err)
			h.markIngestionFailed(ctx, itemID, "inline ingestion failed: "+err.Error())
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Printf("ingestion: inline ingest for %s returned %d", itemID, resp.StatusCode)
			h.markIngestionFailed(ctx, itemID,
				fmt.Sprintf("inline ingestion returned HTTP %d", resp.StatusCode))
			return
		}
		log.Printf("ingestion: indexed %s inline (Redis unavailable)", itemID)
	}()
}

// markIngestionFailed records the failure on the item so the uploader sees it,
// matching what the queue worker writes on its own failures (migration 009).
func (h *Handler) markIngestionFailed(ctx context.Context, itemID, reason string) {
	_, _ = h.db.Exec(ctx,
		`UPDATE media_items
		    SET ingestion_status = 'failed', ingestion_error = $2
		  WHERE item_id = $1`,
		itemID, reason)
}
