-- Migration 016
--   * media_versions       — FR-TXX-015 content version history
--   * ai_chat_messages.*   — FR-AI-016 response feedback, FR-AI-015 latency metric
-- Idempotent: safe to re-run via scripts/deploy-remote.sh.

-- ── FR-TXX-015: version history ─────────────────────────────────────────────
-- One row per *previous* state of a media item. A snapshot is written before
-- every metadata edit or file replacement, so version_no N holds what the item
-- looked like before edit N and the live row is always the newest state.
CREATE TABLE IF NOT EXISTS media_versions (
    version_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id     UUID        NOT NULL REFERENCES media_items(item_id) ON DELETE CASCADE,
    version_no  INT         NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    abstract    TEXT        NOT NULL DEFAULT '',
    keywords    TEXT[]      NOT NULL DEFAULT '{}',
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    language    TEXT        NOT NULL DEFAULT 'en',
    access_tier TEXT        NOT NULL DEFAULT 'public',
    status      TEXT        NOT NULL DEFAULT 'draft',
    format      TEXT        NOT NULL DEFAULT '',
    file_path   TEXT,
    change_note TEXT        NOT NULL DEFAULT '',
    changed_by  UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_media_versions_item
    ON media_versions (item_id, version_no DESC);

-- ── FR-AI-016 / FR-AI-015: feedback + latency on AI answers ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_messages' AND column_name = 'rating'
  ) THEN
    -- -1 = unhelpful, 1 = helpful, NULL = not rated
    ALTER TABLE ai_chat_messages ADD COLUMN rating SMALLINT;
    ALTER TABLE ai_chat_messages
      ADD CONSTRAINT chk_chat_rating CHECK (rating IS NULL OR rating IN (-1, 1));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_messages' AND column_name = 'feedback_note'
  ) THEN
    ALTER TABLE ai_chat_messages ADD COLUMN feedback_note TEXT;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_chat_messages' AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE ai_chat_messages ADD COLUMN latency_ms INT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_created ON ai_chat_messages (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_rating  ON ai_chat_messages (rating) WHERE rating IS NOT NULL;
