-- ============================================================
-- 20-admin-auth.sql
-- 1. admin_otp_sessions  — short-lived pre-auth token + OTP store
-- 2. admin_signin_logs   — full audit trail (attempts, logouts)
-- 3. Root admin seed     — sets metadata.is_root_admin = true
-- ============================================================

-- ============================================================
-- TABLE 1: admin_otp_sessions
-- Created after password check succeeds, before OTP is verified.
-- Holds a hashed pre-auth token and a hashed OTP.
-- Expires in 10 minutes. Cleaned up on verification or expiry.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_otp_sessions (
  id           SERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 of the pre_auth_token sent to client
  otp_hash     VARCHAR(64) NOT NULL,           -- SHA-256 of the 6-digit OTP
  expires_at   TIMESTAMPTZ NOT NULL,
  verified     BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address   VARCHAR(45),
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_otp_sessions_token_hash
  ON admin_otp_sessions(token_hash);

CREATE INDEX IF NOT EXISTS idx_admin_otp_sessions_user_id
  ON admin_otp_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_otp_sessions_expires_at
  ON admin_otp_sessions(expires_at)
  WHERE verified = FALSE;

-- ============================================================
-- TABLE 2: admin_signin_logs
-- Immutable audit log. Never update or delete rows.
-- event_type covers the full session lifecycle.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_signin_logs (
  id           BIGSERIAL PRIMARY KEY,

  -- NULL for events before identity is resolved (e.g. unknown_email attempts)
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,

  -- Attempted email — captured even when user_id cannot be resolved
  email        CITEXT,

  event_type   VARCHAR(30) NOT NULL
    CHECK (event_type IN (
      'login_attempt',      -- password step initiated
      'login_failed',       -- wrong password or inactive account
      'otp_sent',           -- OTP dispatched successfully
      'otp_failed',         -- wrong / expired OTP
      'login_success',      -- full 2FA passed, session issued
      'logout',             -- explicit logout
      'session_expired',    -- token expired / refresh failed
      'account_locked'      -- too many failures triggered lock
    )),

  -- Human-readable detail for the admin log viewer
  detail       TEXT,

  -- Failure reason code — NULL on success events
  failure_reason VARCHAR(50)
    CHECK (failure_reason IN (
      'invalid_password',
      'account_inactive',
      'account_suspended',
      'invalid_otp',
      'expired_otp',
      'expired_session',
      'too_many_attempts',
      NULL
    )),

  ip_address   VARCHAR(45),
  user_agent   TEXT,

  -- Session tied to this event (NULL for pre-session events)
  session_id   VARCHAR(255),

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_signin_logs_user_id
  ON admin_signin_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_admin_signin_logs_event_type
  ON admin_signin_logs(event_type);

CREATE INDEX IF NOT EXISTS idx_admin_signin_logs_created_at
  ON admin_signin_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_signin_logs_email
  ON admin_signin_logs(email);

-- Composite index for the most common dashboard query:
-- "show all events for this user, newest first"
CREATE INDEX IF NOT EXISTS idx_admin_signin_logs_user_created
  ON admin_signin_logs(user_id, created_at DESC);

-- ============================================================
-- CLEANUP FUNCTION: purge expired, unverified OTP sessions
-- Call via pg_cron: SELECT cron.schedule('cleanup-admin-otp', '*/15 * * * *', 'SELECT cleanup_expired_admin_otp_sessions()');
-- ============================================================
CREATE OR REPLACE FUNCTION cleanup_expired_admin_otp_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM admin_otp_sessions
  WHERE expires_at < NOW()
    AND verified = FALSE;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROOT ADMIN SEED
-- Sets is_root_admin flag in metadata JSONB.
-- Run this AFTER your base seed (05-seed-data.sql) has created
-- the admin user. Adjust the email to match your seeded admin.
-- The root admin cannot be deactivated by any other admin.
-- ============================================================
UPDATE users
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"is_root_admin": true}'::jsonb
WHERE email = 'admin@laundrease.com'
  AND role_id = (SELECT id FROM roles WHERE name = 'admin');

-- Confirm the update (informational — does not fail migration if 0 rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE metadata->>'is_root_admin' = 'true'
      AND role_id = (SELECT id FROM roles WHERE name = 'admin')
  ) THEN
    RAISE WARNING 'Root admin seed: no admin user found with email admin@laundrease.com. Run this after seeding the admin user.';
  END IF;
END;
$$;

-- ============================================================
-- service-zones-enhancements
-- 1. Add is_active to service_zones (missing from original schema)
-- 2. Audit log: zone_status_log — every toggle is audited
-- 3. Indexes
-- ============================================================

-- 1. Add is_active to service_zones
ALTER TABLE service_zones
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_service_zones_active
  ON service_zones (is_active);

-- 2. Audit log for zone status changes
--    Records every time a zone is toggled active/inactive,
--    including cascade effects on providers and delivery partners.
CREATE TABLE IF NOT EXISTS zone_status_log (
  id              SERIAL PRIMARY KEY,
  zone_id         INTEGER NOT NULL REFERENCES service_zones(id) ON DELETE CASCADE,
  changed_by      BIGINT  REFERENCES users(id) ON DELETE SET NULL,
  previous_status BOOLEAN NOT NULL,
  new_status      BOOLEAN NOT NULL,
  -- Summary of cascade effects
  providers_affected   INTEGER NOT NULL DEFAULT 0,
  delivery_affected    INTEGER NOT NULL DEFAULT 0,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zone_status_log_zone ON zone_status_log (zone_id);

-- ============================================================
-- services-settings-enhancements.sql
-- 1. Add is_active + updated_at to services table
-- 2. Add updated_at to product_service_prices
-- 3. Create platform_config table (single-row, JSONB blobs per key)
-- ============================================================
 
-- ---- 1. services table enhancements -------------------------
 
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();
 
CREATE INDEX IF NOT EXISTS idx_services_active ON services (is_active);
 
-- Backfill updated_at
UPDATE services SET updated_at = created_at WHERE updated_at IS NULL;
 
DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
CREATE OR REPLACE FUNCTION set_services_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION set_services_updated_at();
 
-- ---- 2. product_service_prices: add updated_at --------------
-- No primary key mutation needed; (product_type_id, service_id) PK is fine.
-- The unit_price column already serves as per_unit OR per_kg price
-- depending on product_types.pricing_model. No new column needed.
 
ALTER TABLE product_service_prices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
 
UPDATE product_service_prices SET updated_at = NOW() WHERE updated_at IS NULL;
 
DROP TRIGGER IF EXISTS trg_psp_updated_at ON product_service_prices;
CREATE OR REPLACE FUNCTION set_psp_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_psp_updated_at
  BEFORE UPDATE ON product_service_prices
  FOR EACH ROW EXECUTE FUNCTION set_psp_updated_at();
 
-- ---- 3. platform_config table --------------------------------
-- Single-row per key. Stores miscellaneous platform configuration
-- that doesn't fit into existing domain tables.
-- Admin can edit these in the Settings > Platform tab.
 
CREATE TABLE IF NOT EXISTS platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
-- Seed default platform config entries
INSERT INTO platform_config (key, value, description) VALUES
  ('platform_name',    '"Laundrease"',            'Platform display name'),
  ('support_email',    '"support@laundrease.com"', 'Customer support email'),
  ('support_phone',    '"+91 98765-43210"',         'Customer support phone'),
  ('business_address', '"Pune, Maharashtra, India"','Registered business address'),
  ('min_order_amount', '100',                       'Minimum order subtotal in INR'),
  ('max_addresses',    '10',                        'Max saved addresses per customer'),
  ('loyalty_earn_rate','1',                         'Loyalty points earned per ₹100 of order (% of order value)'),
  ('loyalty_min_redeem','100',                      'Minimum loyalty points required to redeem'),
  ('loyalty_rate_per_point','1',                    '₹ value per loyalty point (1 pt = ₹1)'),
  ('social_instagram', '"https://instagram.com/laundrease"', 'Instagram URL'),
  ('social_twitter',   '"https://twitter.com/laundrease"',   'Twitter / X URL'),
  ('social_facebook',  '""',                                 'Facebook page URL'),
  ('app_store_url',    '""',                                  'iOS App Store URL'),
  ('play_store_url',   '""',                                  'Google Play Store URL')
ON CONFLICT (key) DO NOTHING;