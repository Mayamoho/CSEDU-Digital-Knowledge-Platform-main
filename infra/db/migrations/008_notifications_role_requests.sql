-- 008: In-app notifications + self-service role-upgrade requests. Idempotent.
--
-- role_requests: a user asks an administrator to raise their tier (e.g. a
-- researcher who signed up as the default student). Admins approve/reject from
-- the admin panel; approval applies the role and notifies the user.
--
-- notifications: in-app notification centre. Rows are also created alongside
-- the existing best-effort SMTP emails (hold ready, research review outcome),
-- so users see updates even when SMTP is disabled.

CREATE TABLE IF NOT EXISTS role_requests (
    request_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    requested_role role_tier   NOT NULL,
    justification  TEXT        NOT NULL DEFAULT '',
    status         TEXT        NOT NULL DEFAULT 'pending',  -- pending|approved|rejected
    decided_by     UUID        REFERENCES users(user_id) ON DELETE SET NULL,
    decision_notes TEXT        NOT NULL DEFAULT '',
    decided_at     TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_requests_status ON role_requests (status);
CREATE INDEX IF NOT EXISTS idx_role_requests_user   ON role_requests (user_id);
-- At most one open request per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_requests_one_pending
    ON role_requests (user_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title           TEXT        NOT NULL,
    body            TEXT        NOT NULL DEFAULT '',
    link            TEXT,
    read            BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications (user_id, read, created_at DESC);
