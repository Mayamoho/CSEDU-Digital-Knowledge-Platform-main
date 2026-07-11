-- Payment gateway support: simulated bKash/Nagad online payment with OTP,
-- plus in-person (counter) cash payments confirmed by a librarian.
--
-- payment_sessions tracks an in-flight payment attempt (OTP lifecycle for
-- online, awaiting-counter state for cash). The existing `payments` table
-- still records the final settled payment; we add `method` and `confirmed_by`
-- so a receipt knows how it was paid and which librarian took the cash.

-- How the fine was settled (bkash | nagad | cash) and, for cash, who confirmed.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method       TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(user_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payment_sessions (
    session_id     UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    fine_id        UUID          NOT NULL REFERENCES fines(fine_id) ON DELETE CASCADE,
    user_id        UUID          NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    method         TEXT          NOT NULL,                       -- bkash | nagad | cash
    account_number TEXT,                                         -- payer wallet (online only), stored masked
    amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    otp_code       TEXT,                                         -- online only
    otp_expires_at TIMESTAMPTZ,                                  -- online only
    attempts       INT           NOT NULL DEFAULT 0,
    status         TEXT          NOT NULL DEFAULT 'pending',     -- pending | otp_sent | awaiting_counter | completed | failed | cancelled
    confirmed_by   UUID          REFERENCES users(user_id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ
);

-- Only one live (unsettled) session per fine at a time keeps the flow sane.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_sessions_active
    ON payment_sessions (fine_id)
    WHERE status IN ('pending', 'otp_sent', 'awaiting_counter');

CREATE INDEX IF NOT EXISTS idx_payment_sessions_counter
    ON payment_sessions (status)
    WHERE status = 'awaiting_counter';
