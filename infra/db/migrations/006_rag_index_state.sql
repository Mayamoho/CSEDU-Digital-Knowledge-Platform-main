-- Tracks what the RAG service has already embedded, so the reconcile sweep can
-- tell "never indexed" apart from "indexed, but the item changed since".
-- content_hash covers title + abstract + keywords + tags + file_path + external_url;
-- when it differs from the stored hash the item is re-embedded.

CREATE TABLE IF NOT EXISTS rag_index_state (
    item_id      UUID PRIMARY KEY REFERENCES media_items(item_id) ON DELETE CASCADE,
    content_hash TEXT        NOT NULL,
    chunk_count  INT         NOT NULL DEFAULT 0,
    indexed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_index_state_indexed_at ON rag_index_state(indexed_at DESC);
