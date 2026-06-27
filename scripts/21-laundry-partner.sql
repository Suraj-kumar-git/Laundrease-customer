-- ============================================================
-- 21-laundry-partner.sql
-- 1. laundry_subscription_plans
-- 2. laundry_subscription_offers
-- 3. laundry_subscription_offer_providers
-- 4. provider_otp_sessions
-- 5. laundry_provider_subscriptions
-- 6. laundry_partner_stats view
-- ============================================================

-- ============================================================
-- 1. Subscription Plans (admin-managed)
-- ============================================================
CREATE TABLE IF NOT EXISTS laundry_subscription_plans (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(50)    NOT NULL UNIQUE,        -- 'Basic', 'Standard', 'Premium'
  monthly_price    NUMERIC(10,2)  NOT NULL CHECK (monthly_price >= 0),
  -- Commission charged per order
  commission_type  VARCHAR(10)    NOT NULL DEFAULT 'percent'
                     CHECK (commission_type IN ('percent', 'flat')),
  commission_value NUMERIC(10,2)  NOT NULL CHECK (commission_value >= 0),
  -- NULL = unlimited
  max_orders       INTEGER        CHECK (max_orders IS NULL OR max_orders > 0),
  -- Array of feature strings shown on the landing page
  features         JSONB          NOT NULL DEFAULT '[]'::jsonb,
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
  is_popular       BOOLEAN        NOT NULL DEFAULT FALSE,  -- highlights "Most Popular" badge
  sort_order       SMALLINT       NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(features) = 'array')
);

DROP TRIGGER IF EXISTS trg_laundry_plans_updated_at ON laundry_subscription_plans;
CREATE TRIGGER trg_laundry_plans_updated_at
  BEFORE UPDATE ON laundry_subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 2. Subscription Offers (time-bounded price overrides)
-- scope = 'global'   → applies to ALL providers
-- scope = 'specific' → applies only to providers listed in
--                      laundry_subscription_offer_providers
-- override_price = 0 → free for that period
-- ============================================================
CREATE TABLE IF NOT EXISTS laundry_subscription_offers (
  id             SERIAL PRIMARY KEY,
  plan_id        INTEGER        NOT NULL REFERENCES laundry_subscription_plans(id) ON DELETE CASCADE,
  label          VARCHAR(100),                             -- e.g. "Launch Month Free"
  override_price NUMERIC(10,2)  NOT NULL CHECK (override_price >= 0),
  starts_at      TIMESTAMPTZ    NOT NULL,
  ends_at        TIMESTAMPTZ    NOT NULL,
  scope          VARCHAR(10)    NOT NULL DEFAULT 'global'
                   CHECK (scope IN ('global', 'specific')),
  is_active      BOOLEAN        NOT NULL DEFAULT TRUE,
  created_by     BIGINT         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

DROP TRIGGER IF EXISTS trg_laundry_offers_updated_at ON laundry_subscription_offers;
CREATE TRIGGER trg_laundry_offers_updated_at
  BEFORE UPDATE ON laundry_subscription_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_laundry_offers_active
  ON laundry_subscription_offers (plan_id, is_active, starts_at, ends_at)
  WHERE is_active = TRUE;

-- ============================================================
-- 3. Offer → specific provider targeting
-- ============================================================
CREATE TABLE IF NOT EXISTS laundry_subscription_offer_providers (
  offer_id    INTEGER NOT NULL REFERENCES laundry_subscription_offers(id) ON DELETE CASCADE,
  provider_id BIGINT  NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, provider_id)
);

-- ============================================================
-- 4. Provider OTP Sessions (registration + login 2FA)
-- ============================================================
CREATE TABLE IF NOT EXISTS provider_otp_sessions (
  id            SERIAL PRIMARY KEY,
  phone         VARCHAR(20)  NOT NULL,
  otp_hash      VARCHAR(64)  NOT NULL,                    -- SHA-256 of the 6-digit OTP
  purpose       VARCHAR(20)  NOT NULL
                  CHECK (purpose IN ('registration', 'login')),
  expires_at    TIMESTAMPTZ  NOT NULL,                    -- 10 minutes
  verified      BOOLEAN      NOT NULL DEFAULT FALSE,
  attempt_count SMALLINT     NOT NULL DEFAULT 0,          -- max 5 attempts
  ip_address    VARCHAR(45),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_otp_phone
  ON provider_otp_sessions (phone, purpose, verified)
  WHERE verified = FALSE;

CREATE INDEX IF NOT EXISTS idx_provider_otp_expires
  ON provider_otp_sessions (expires_at)
  WHERE verified = FALSE;

-- ============================================================
-- 5. Provider Subscriptions (one active row per provider)
-- ============================================================
CREATE TABLE IF NOT EXISTS laundry_provider_subscriptions (
  id          SERIAL PRIMARY KEY,
  provider_id BIGINT         NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  plan_id     INTEGER        NOT NULL REFERENCES laundry_subscription_plans(id) ON DELETE RESTRICT,
  is_trial    BOOLEAN        NOT NULL DEFAULT FALSE,       -- first month free
  amount_paid NUMERIC(10,2)  NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  starts_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  ends_at     TIMESTAMPTZ    NOT NULL,                    -- starts_at + 1 month
  status      VARCHAR(20)    NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'expired', 'cancelled')),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_lps_provider_status
  ON laundry_provider_subscriptions (provider_id, status, ends_at);

DROP TRIGGER IF EXISTS trg_lps_updated_at ON laundry_provider_subscriptions;
CREATE TRIGGER trg_lps_updated_at
  BEFORE UPDATE ON laundry_provider_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Enforce only one active subscription per provider
CREATE UNIQUE INDEX IF NOT EXISTS uq_lps_provider_active
  ON laundry_provider_subscriptions (provider_id)
  WHERE status = 'active';

-- ============================================================
-- 6. Laundry Partner Stats View (landing page)
-- ============================================================
CREATE OR REPLACE VIEW laundry_partner_stats AS
SELECT
  -- Active (approved) providers
  COUNT(*)                                              AS active_partners,
  -- Avg monthly revenue placeholder — will be replaced with real
  -- order data once provider orders flow. For now admin seeds via
  -- home_platform_stats or a separate config table.
  -- Cities served (distinct cities from laundry_profiles)
  COUNT(DISTINCT lp.city)                              AS cities_covered,
  -- Avg provider rating
  ROUND(AVG(lp.rating)::NUMERIC, 1)                   AS avg_rating,
  -- Total orders served (from orders table)
  COUNT(DISTINCT o.id)                                 AS total_orders
FROM laundry_profiles lp
LEFT JOIN orders o ON o.laundry_profile_id = lp.id
WHERE lp.status = 'active'
  AND lp.is_verified = TRUE;

-- ============================================================
-- 7. Seed Plans
-- ============================================================
INSERT INTO laundry_subscription_plans
  (name, monthly_price, commission_type, commission_value, max_orders, features, is_popular, sort_order)
VALUES
  (
    'Basic', 999.00, 'percent', 30.00, 100,
    '["Up to 100 orders/month","Basic dashboard access","Email support","Standard listing","Payment gateway"]'::jsonb,
    FALSE, 1
  ),
  (
    'Standard', 1999.00, 'percent', 20.00, 300,
    '["Up to 300 orders/month","Advanced dashboard","Priority support","Featured listing","Payment gateway","Marketing tools"]'::jsonb,
    TRUE, 2
  ),
  (
    'Premium', 3999.00, 'percent', 15.00, NULL,
    '["Unlimited orders","Full analytics suite","24/7 dedicated support","Top listing & badge","Payment gateway","Full marketing suite","Business coaching"]'::jsonb,
    FALSE, 3
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 8. Seed: "First Month Free" global offer for all plans
-- Active from now, valid for 100 years (platform default —
-- admin can end it by setting is_active = FALSE or ends_at)
-- ============================================================
DO $$
DECLARE
  v_plan RECORD;
BEGIN
  FOR v_plan IN SELECT id FROM laundry_subscription_plans LOOP
    INSERT INTO laundry_subscription_offers
      (plan_id, label, override_price, starts_at, ends_at, scope, is_active)
    VALUES
      (v_plan.id, 'First Month Free', 0.00, NOW(), NOW() + INTERVAL '100 years', 'global', TRUE)
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
