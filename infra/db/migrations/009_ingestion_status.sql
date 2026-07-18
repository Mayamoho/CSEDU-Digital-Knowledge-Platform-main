-- 009_ingestion_status.sql
-- SDD gap: surface ingestion outcome per item and alert the uploader on failure.
--
-- These columns are SEPARATE from the workflow `status` (draft/review/published)
-- on purpose: overloading that enum would break the catalog/research/project
-- filters that key on it. `ingestion_status` tracks only the RAG indexing
-- lifecycle and defaults to NULL for items that have never been through it.
ALTER TABLE media_items
    ADD COLUMN IF NOT EXISTS ingestion_status TEXT,   -- NULL | 'indexed' | 'failed'
    ADD COLUMN IF NOT EXISTS ingestion_error  TEXT;   -- last failure message, NULL when ok

CREATE INDEX IF NOT EXISTS idx_media_ingestion_failed
    ON media_items (ingestion_status)
    WHERE ingestion_status = 'failed';
