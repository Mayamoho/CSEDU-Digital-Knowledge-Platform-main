-- Migration: add hold-fulfillment notification tracking (SDD Flow 3 / §4.1 holds).
-- Idempotent: safe to re-run via quick-update.sh.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'holds' AND column_name = 'notified_at'
  ) THEN
    ALTER TABLE holds ADD COLUMN notified_at TIMESTAMPTZ;
  END IF;
END $$;
