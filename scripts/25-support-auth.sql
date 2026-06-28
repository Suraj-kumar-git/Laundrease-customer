-- ============================================================
-- 29-support-auth.sql
-- 1. support_otp_sessions  — pre-auth token + OTP store for support agents
-- 2. support_signin_logs   — immutable audit trail
-- ============================================================

-- ============================================================
-- 1. support_otp_sessions
-- Identical pattern to admin_otp_sessions but scoped to support role.
-- Created after password check passes, before OTP is verified.
-- Expires in 10 minutes. Cleaned up on verification or expiry.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_otp_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256 of the pre_auth_token sent to client
  otp_hash     VARCHAR(64)  NOT NULL,          -- SHA-256 of the 6-digit OTP
  expires_at   TIMESTAMPTZ  NOT NULL,          -- NOW() + 10 minutes
  verified     BOOLEAN      NOT NULL DEFAULT FALSE,
  attempt_count SMALLINT    NOT NULL DEFAULT 0, -- max 5 attempts
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_otp_token_hash
  ON support_otp_sessions (token_hash);

CREATE INDEX IF NOT EXISTS idx_support_otp_user_id
  ON support_otp_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_support_otp_expires_at
  ON support_otp_sessions (expires_at)
  WHERE verified = FALSE;

-- ============================================================
-- 2. support_signin_logs
-- Immutable. Never update or delete rows.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_signin_logs (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  email          CITEXT,
  event_type     VARCHAR(30)  NOT NULL
    CHECK (event_type IN (
      'login_attempt',
      'login_failed',
      'otp_sent',
      'otp_failed',
      'login_success',
      'logout',
      'session_expired',
      'account_locked'
    )),
  detail         TEXT,
  failure_reason VARCHAR(50)
    CHECK (failure_reason IN (
      'invalid_password',
      'account_inactive',
      'account_suspended',
      'not_support_role',
      'invalid_otp',
      'expired_otp',
      'expired_session',
      'too_many_attempts',
      NULL
    )),
  ip_address     VARCHAR(45),
  user_agent     TEXT,
  session_id     VARCHAR(255),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_signin_logs_user_id
  ON support_signin_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_support_signin_logs_event_type
  ON support_signin_logs (event_type);

CREATE INDEX IF NOT EXISTS idx_support_signin_logs_created_at
  ON support_signin_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_signin_logs_user_created
  ON support_signin_logs (user_id, created_at DESC);

-- ============================================================
-- 3. Cleanup function (call via pg_cron or scheduled task)
-- ============================================================

CREATE OR REPLACE FUNCTION cleanup_expired_support_otp_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM support_otp_sessions
  WHERE expires_at < NOW()
    AND verified = FALSE;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. Seed support groups if they don't exist yet
--    (Admin creates agents via admin panel; groups seeded here)
-- ============================================================

INSERT INTO support_groups (name, description) VALUES
  ('Tier 1 - General',   'First-line support for general queries, account issues, and basic order help'),
  ('Tier 2 - Billing',   'Payments, refunds, commissions, payout disputes'),
  ('Tier 3 - Technical', 'App bugs, API issues, dashboard errors, escalated technical problems'),
  ('Operations',         'Delivery partner issues, laundry partner issues, SLA escalations')
ON CONFLICT (name) DO NOTHING;
