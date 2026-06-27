ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS onboarding_step        SMALLINT NOT NULL DEFAULT 0,
  -- 0 = not started, 1 = vehicle done, 2 = personal done,
  -- 3 = emergency done, 4 = banking done, 5 = docs submitted
  ADD COLUMN IF NOT EXISTS onboarding_step_data   JSONB    NOT NULL DEFAULT '{}'::jsonb;
  -- Stores each step's submitted data so the form can pre-fill on resume
 
-- ── 2. New banking fields ─────────────────────────────────────────────────────
ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS bank_name         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(20)
    CHECK (bank_account_type IN ('savings', 'current', 'salary'));
 
-- ── 3. Serving area ───────────────────────────────────────────────────────────
ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS service_area_locality TEXT;
ALTER TABLE "delivery_profiles"
ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE third_party_delivery_providers
 -- How Laundrease pays the provider company per delivery
ADD COLUMN IF NOT EXISTS commission_type VARCHAR(20) CHECK (commission_type IN ('flat', 'percent', 'none')) DEFAULT 'none',
  -- Flat = fixed ₹ per delivery. Percent = % of order total.
ADD COLUMN IF NOT EXISTS commission_value DECIMAL(10,2) CHECK (commission_value IS NULL OR commission_value >= 0),
 -- Separate secret for verifying incoming webhooks (HMAC-SHA256 signature)
ADD COLUMN IF NOT EXISTS webhook_secret_hash VARCHAR(255),
 -- Contract / agreement details
ADD COLUMN IF NOT EXISTS contract_start_date DATE, ADD COLUMN IF NOT EXISTS contract_end_date DATE;
 -- Index for active providers lookup
CREATE INDEX IF NOT EXISTS idx_third_party_providers_active ON third_party_delivery_providers (is_active);


-- ── 1. order_items — add status + delivery modification tracking ─────────────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',            -- not yet picked up
      'picked_up',          -- confirmed picked up by delivery partner
      'not_picked_up',      -- marked as not picked up (strikethrough in customer view)
      'added_by_delivery'   -- new item added by delivery partner at pickup
    )),
  ADD COLUMN IF NOT EXISTS modified_by_delivery_profile_id BIGINT
    REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS modified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modification_note TEXT,
  -- Preserve original price before any delivery modification
  ADD COLUMN IF NOT EXISTS original_unit_price DECIMAL(10,2);

ALTER TABLE order_items
  ALTER COLUMN modified_by_delivery_profile_id SET DEFAULT NULL;

-- ── 2. orders — preserve original pricing for customer comparison ────────────

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS original_subtotal      DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS original_total_amount  DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS delivery_attempt_count SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_attempt_count   SMALLINT NOT NULL DEFAULT 0,
  -- Bag code generated after pickup OTP confirmed
  ADD COLUMN IF NOT EXISTS bag_code               VARCHAR(64),
  ADD COLUMN IF NOT EXISTS bag_code_generated_at  TIMESTAMPTZ,
  -- Delivery modification flag (customer sees a "modified" banner)
  ADD COLUMN IF NOT EXISTS modified_by_delivery   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS delivery_modified_at   TIMESTAMPTZ;

-- ── 3. laundry_bags — add order_id FK ────────────────────────────────────────

ALTER TABLE laundry_bags
  ADD COLUMN IF NOT EXISTS order_id BIGINT
    REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE laundry_bags
  ALTER COLUMN order_id SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_laundry_bags_order
  ON laundry_bags (order_id);

-- ── 4. order_otp_sessions ─────────────────────────────────────────────────────
-- Separate from otp_sessions (which is user+purpose unique).
-- Here we need order_id + purpose unique so concurrent orders work fine.

CREATE TABLE IF NOT EXISTS order_otp_sessions (
  id                          SERIAL PRIMARY KEY,
  order_id                    BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  purpose                     VARCHAR(20) NOT NULL
    CHECK (purpose IN ('pickup', 'delivery')),
  otp_code                    VARCHAR(10) NOT NULL,
  triggered_by_delivery_profile_id BIGINT
    REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  expires_at                  TIMESTAMPTZ NOT NULL,
  attempts                    SMALLINT    NOT NULL DEFAULT 0,
  verified_at                 TIMESTAMPTZ,          -- set when successfully verified
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One active OTP per order per purpose
  UNIQUE (order_id, purpose)
);

ALTER TABLE order_otp_sessions
  ALTER COLUMN triggered_by_delivery_profile_id SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_order_otp_sessions_order
  ON order_otp_sessions (order_id, purpose);

-- ── 5. order_delivery_proofs ──────────────────────────────────────────────────
-- Photo proof for pickup bypass or third-party delivery.

CREATE TABLE IF NOT EXISTS order_delivery_proofs (
  id                      SERIAL PRIMARY KEY,
  order_id                BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_profile_id     BIGINT      REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  purpose                 VARCHAR(30) NOT NULL
    CHECK (purpose IN ('pickup_bypass', 'delivery_third_party', 'delivery_proof')),
  s3_key                  VARCHAR(500) NOT NULL,
  -- Third party delivery fields
  is_third_party_delivery BOOLEAN     NOT NULL DEFAULT FALSE,
  third_party_note        TEXT,                    -- "Left with security guard, Flat 4B"
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_delivery_proofs
  ALTER COLUMN delivery_profile_id SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_order_delivery_proofs_order
  ON order_delivery_proofs (order_id);

-- ── 6. order_pickup_failures ──────────────────────────────────────────────────
-- Logs every failed pickup or delivery attempt with reason.

CREATE TABLE IF NOT EXISTS order_pickup_failures (
  id                  SERIAL PRIMARY KEY,
  order_id            BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_profile_id BIGINT      REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  failure_type        VARCHAR(20) NOT NULL
    CHECK (failure_type IN ('pickup', 'delivery')),
  reason_code         VARCHAR(50) NOT NULL
    CHECK (reason_code IN (
      'customer_not_available',
      'customer_rejected',
      'customer_asked_reschedule',
      'customer_unreachable',
      'address_not_found',
      'access_denied',
      'other'
    )),
  reason_note         TEXT,        -- optional free-text from delivery partner
  attempt_number      SMALLINT    NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE order_pickup_failures
  ALTER COLUMN delivery_profile_id SET DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_order_pickup_failures_order
  ON order_pickup_failures (order_id, failure_type);

 
-- ── 1. platform_holidays ─────────────────────────────────────────────────────
-- Admin-managed holidays applicable to all delivery partners platform-wide.
 
CREATE TABLE IF NOT EXISTS platform_holidays (
  id          SERIAL PRIMARY KEY,
  date        DATE        NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  created_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
ALTER TABLE platform_holidays ALTER COLUMN created_by SET DEFAULT NULL;
 
CREATE INDEX IF NOT EXISTS idx_platform_holidays_date
  ON platform_holidays (date);
 
-- ── 2. delivery_leaves ───────────────────────────────────────────────────────
-- Delivery partner leave applications.
-- Self-service: no admin approval required.
-- Partners can apply retroactively (e.g. mark yesterday's leave today).
 
CREATE TABLE IF NOT EXISTS delivery_leaves (
  id                  SERIAL PRIMARY KEY,
  delivery_profile_id BIGINT      NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  date                DATE        NOT NULL,
  reason_code         VARCHAR(30) NOT NULL
    CHECK (reason_code IN (
      'personal',
      'medical',
      'family_emergency',
      'travel',
      'vehicle_breakdown',
      'other'
    )),
  reason_note         TEXT,        -- optional free-text
  -- 'approved' by default (self-service, no approval needed)
  -- 'cancelled_by_admin' when admin overrides
  status              VARCHAR(30) NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'cancelled_by_admin')),
  cancelled_by        BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  cancelled_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One leave per partner per date
  UNIQUE (delivery_profile_id, date)
);
 
ALTER TABLE delivery_leaves ALTER COLUMN cancelled_by SET DEFAULT NULL;
 
CREATE INDEX IF NOT EXISTS idx_delivery_leaves_profile_date
  ON delivery_leaves (delivery_profile_id, date);
CREATE INDEX IF NOT EXISTS idx_delivery_leaves_date
  ON delivery_leaves (date);
CREATE INDEX IF NOT EXISTS idx_delivery_leaves_status
  ON delivery_leaves (status, date);
 
-- ── 3. updated_at triggers ───────────────────────────────────────────────────
 
DROP TRIGGER IF EXISTS trg_platform_holidays_updated_at ON platform_holidays;
CREATE TRIGGER trg_platform_holidays_updated_at
  BEFORE UPDATE ON platform_holidays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
DROP TRIGGER IF EXISTS trg_delivery_leaves_updated_at ON delivery_leaves;
CREATE TRIGGER trg_delivery_leaves_updated_at
  BEFORE UPDATE ON delivery_leaves
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();