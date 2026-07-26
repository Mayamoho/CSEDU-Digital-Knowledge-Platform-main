-- Migration 017: who downloaded what.
--
-- A published paper that its author edits is demoted to draft and re-enters
-- review, so anyone holding a downloaded copy is now carrying a superseded
-- version and has no way to know. This table is the audience for that notice.
--
-- One row per (user, item) rather than one per download: we need to reach each
-- reader once, not count clicks. last_downloaded_at still shows recency, and
-- download_count keeps the volume signal.
-- Idempotent: safe to re-run via scripts/deploy-remote.sh.

CREATE TABLE IF NOT EXISTS media_downloads (
    download_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id            UUID        NOT NULL REFERENCES media_items(item_id) ON DELETE CASCADE,
    user_id            UUID        NOT NULL REFERENCES users(user_id)       ON DELETE CASCADE,
    first_downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_downloaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    download_count     INT         NOT NULL DEFAULT 1,
    UNIQUE (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_downloads_item ON media_downloads (item_id);
CREATE INDEX IF NOT EXISTS idx_downloads_user ON media_downloads (user_id, last_downloaded_at DESC);
