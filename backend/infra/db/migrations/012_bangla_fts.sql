-- Migration: Bangla full-text search configuration (SDD §5.2 / Appendix A#8).
-- PostgreSQL ships no Bangla stemmer, so we register a `bangla` FTS
-- config built on the `simple` dictionary (no stemming, case-insensitive
-- token match). Semantic retrieval is still handled by the multilingual
-- MiniLM embeddings; this config improves exact Bangla keyword recall.
-- Idempotent: safe to re-run via quick-update.sh.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_ts_config WHERE cfgname = 'bangla'
  ) THEN
    CREATE TEXT SEARCH CONFIGURATION bangla ( COPY = simple );
  END IF;
END $$;
