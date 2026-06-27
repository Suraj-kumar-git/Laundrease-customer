-- ============================================================
-- 10-referral-profile.sql
-- 1. Referral program config (admin-managed)
-- 2. Customer referral codes
-- 3. Referral uses (referee tracking)
-- 4. Referral reward transactions
-- 5. customer_profiles modification (referred_by_code)
-- 6. Seed: referral_program_config, FIRST50 coupon
-- ============================================================

-- ============================================================
-- PART 1: referral_program_config
-- Single-row table. Admin manages via admin console.
-- All referral behavior derives from this — no hardcoded values.
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_program_config (
  id                                  SERIAL PRIMARY KEY,
  is_active                           BOOLEAN NOT NULL DEFAULT TRUE,
  program_name                        VARCHAR(100) NOT NULL DEFAULT 'Refer & Earn',
  program_description                 TEXT,

  -- Referrer rewards
  referrer_reward_percent             NUMERIC(5,2) NOT NULL DEFAULT 20.00
                                        CHECK (referrer_reward_percent > 0 AND referrer_reward_percent <= 100),
  referrer_max_reward_per_order       NUMERIC(10,2) NOT NULL DEFAULT 500.00
                                        CHECK (referrer_max_reward_per_order > 0),
  referrer_max_orders_per_referee     INTEGER NOT NULL DEFAULT 5
                                        CHECK (referrer_max_orders_per_referee > 0),

  -- Referee rewards (first order discount)
  referee_discount_type               VARCHAR(10) NOT NULL DEFAULT 'percent'
                                        CHECK (referee_discount_type IN ('percent', 'flat')),
  referee_discount_value              NUMERIC(10,2) NOT NULL DEFAULT 50.00
                                        CHECK (referee_discount_value > 0),
  -- If percent, max discount cap in INR (NULL = no cap)
  referee_discount_max_amount         NUMERIC(10,2) CHECK (referee_discount_max_amount IS NULL OR referee_discount_max_amount > 0),

  -- General eligibility
  min_order_amount_for_reward         NUMERIC(10,2) NOT NULL DEFAULT 200.00
                                        CHECK (min_order_amount_for_reward >= 0),

  -- Code format
  referral_code_prefix                VARCHAR(10) NOT NULL DEFAULT 'LDR',
  referral_code_length                INTEGER NOT NULL DEFAULT 10
                                        CHECK (referral_code_length BETWEEN 6 AND 20),

  -- Audit
  updated_by                          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce single row
  CONSTRAINT single_config_row CHECK (id = 1)
);

DROP TRIGGER IF EXISTS trg_referral_config_updated_at ON referral_program_config;
CREATE TRIGGER trg_referral_config_updated_at
  BEFORE UPDATE ON referral_program_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PART 2: customer_referral_codes
-- One per customer. Auto-generated on first access.
-- ============================================================

CREATE TABLE IF NOT EXISTS customer_referral_codes (
  id                    SERIAL PRIMARY KEY,
  customer_profile_id   BIGINT NOT NULL UNIQUE REFERENCES customer_profiles(id) ON DELETE CASCADE,
  user_id               BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  code                  VARCHAR(20) NOT NULL UNIQUE,
  -- Aggregate stats (maintained by triggers/functions)
  total_referrals       INTEGER NOT NULL DEFAULT 0 CHECK (total_referrals >= 0),
  total_earnings        NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_earnings >= 0),
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON customer_referral_codes (code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON customer_referral_codes (user_id);

DROP TRIGGER IF EXISTS trg_referral_codes_updated_at ON customer_referral_codes;
CREATE TRIGGER trg_referral_codes_updated_at
  BEFORE UPDATE ON customer_referral_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PART 3: referral_uses
-- One row per referee. A user can only ever be referred once.
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_uses (
  id                          SERIAL PRIMARY KEY,
  referral_code_id            INTEGER NOT NULL REFERENCES customer_referral_codes(id) ON DELETE RESTRICT,
  referrer_user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referee_user_id             BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
                              -- UNIQUE ensures one referral per user ever
  -- Reward tracking
  orders_counted              INTEGER NOT NULL DEFAULT 0 CHECK (orders_counted >= 0),
  total_earned_by_referrer    NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  -- Referee discount
  referee_coupon_code         VARCHAR(50),              -- generated coupon code for referee
  referee_discount_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  referee_discount_order_id   BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  -- Status
  status                      VARCHAR(20) NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'completed', 'voided')),
  -- completed = referrer_max_orders_per_referee reached
  -- voided    = referee account deleted or fraud detected
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_uses_code ON referral_uses (referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referrer ON referral_uses (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_referee ON referral_uses (referee_user_id);
CREATE INDEX IF NOT EXISTS idx_referral_uses_status ON referral_uses (status);

DROP TRIGGER IF EXISTS trg_referral_uses_updated_at ON referral_uses;
CREATE TRIGGER trg_referral_uses_updated_at
  BEFORE UPDATE ON referral_uses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PART 4: referral_reward_transactions
-- One row per order that triggered a referrer reward.
-- ============================================================

CREATE TABLE IF NOT EXISTS referral_reward_transactions (
  id                    SERIAL PRIMARY KEY,
  referral_use_id       INTEGER NOT NULL REFERENCES referral_uses(id) ON DELETE RESTRICT,
  order_id              BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  referrer_user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referee_user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- Snapshot at time of reward
  order_amount          NUMERIC(10,2) NOT NULL CHECK (order_amount > 0),
  reward_percent        NUMERIC(5,2) NOT NULL,
  reward_amount         NUMERIC(10,2) NOT NULL CHECK (reward_amount > 0),
  -- Wallet credit created for referrer
  wallet_transaction_id INTEGER REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent double-crediting for same order
  CONSTRAINT uq_referral_reward_order UNIQUE (referral_use_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_rrt_referrer ON referral_reward_transactions (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_rrt_order ON referral_reward_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_rrt_use ON referral_reward_transactions (referral_use_id);

-- ============================================================
-- PART 5: Modify customer_profiles
-- ============================================================

ALTER TABLE customer_profiles
  ADD COLUMN IF NOT EXISTS referred_by_code VARCHAR(20)
    REFERENCES customer_referral_codes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cp_referred_by ON customer_profiles (referred_by_code)
  WHERE referred_by_code IS NOT NULL;

-- ============================================================
-- PART 6: DB Functions
-- ============================================================

-- Generate a referral code for a user (called after registration)
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id BIGINT)
RETURNS VARCHAR AS $$
DECLARE
  v_config     RECORD;
  v_cp_id      BIGINT;
  v_code       VARCHAR(20);
  v_prefix     VARCHAR(10);
  v_len        INTEGER;
  v_random_len INTEGER;
  v_chars      TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no confusable chars
  v_attempt    INTEGER := 0;
BEGIN
  -- Get config
  SELECT referral_code_prefix, referral_code_length
    INTO v_prefix, v_len
  FROM referral_program_config WHERE id = 1;

  IF NOT FOUND THEN
    v_prefix := 'LDR';
    v_len    := 10;
  END IF;

  -- Random part length = total length - prefix length - 1 (hyphen)
  v_random_len := v_len - LENGTH(v_prefix) - 1;

  -- Get customer_profile_id
  SELECT id INTO v_cp_id FROM customer_profiles WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No customer profile found for user %', p_user_id;
  END IF;

  -- Already has a code?
  IF EXISTS (SELECT 1 FROM customer_referral_codes WHERE user_id = p_user_id) THEN
    SELECT code INTO v_code FROM customer_referral_codes WHERE user_id = p_user_id;
    RETURN v_code;
  END IF;

  -- Generate unique code
  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > 100 THEN
      RAISE EXCEPTION 'Could not generate unique referral code after 100 attempts';
    END IF;

    -- Build random suffix
    v_code := v_prefix || '-';
    FOR i IN 1..v_random_len LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)) + 1)::int, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (SELECT 1 FROM customer_referral_codes WHERE code = v_code);
  END LOOP;

  INSERT INTO customer_referral_codes (customer_profile_id, user_id, code)
  VALUES (v_cp_id, p_user_id, v_code);

  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- Apply referral: called when a new user provides a referral code at registration.
-- Creates the referral_use record and generates a personal coupon for the referee.
-- Returns JSON with result details.
CREATE OR REPLACE FUNCTION apply_referral_code(
  p_referee_user_id BIGINT,
  p_referral_code   VARCHAR
)
RETURNS JSONB AS $$
DECLARE
  v_config          RECORD;
  v_code_record     RECORD;
  v_coupon_code     VARCHAR(50);
  v_discount_type   VARCHAR(10);
  v_discount_value  NUMERIC(10,2);
  v_max_amount      NUMERIC(10,2);
BEGIN
  -- Program active?
  SELECT * INTO v_config FROM referral_program_config WHERE id = 1;
  IF NOT FOUND OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'referral_program_inactive');
  END IF;

  -- Valid code?
  SELECT crc.*, u.id AS referrer_user_id
    INTO v_code_record
  FROM customer_referral_codes crc
  JOIN users u ON u.id = crc.user_id
  WHERE crc.code = UPPER(p_referral_code)
    AND crc.is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'invalid_code');
  END IF;

  -- Self-referral?
  IF v_code_record.referrer_user_id = p_referee_user_id THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'self_referral');
  END IF;

  -- Already referred?
  IF EXISTS (SELECT 1 FROM referral_uses WHERE referee_user_id = p_referee_user_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'already_referred');
  END IF;

  -- Generate personal coupon code for referee
  v_coupon_code    := 'REF-' || upper(encode(gen_random_bytes(4), 'hex'));
  v_discount_type  := v_config.referee_discount_type;
  v_discount_value := v_config.referee_discount_value;
  v_max_amount     := v_config.referee_discount_max_amount;

  -- Insert coupon into coupons table (reusing existing infrastructure)
  INSERT INTO coupons (
    code, name, description,
    discount_type, discount_value, max_discount,
    min_order_amount, applicable_to_user,
    usage_limit_global, usage_limit_per_user,
    stackable, starts_at, ends_at, is_active
  ) VALUES (
    v_coupon_code,
    'Referral Welcome Discount',
    'Applied automatically for joining via a referral. Valid on your first order only.',
    v_discount_type,
    v_discount_value,
    v_max_amount,
    v_config.min_order_amount_for_reward,
    p_referee_user_id,
    1,   -- global usage limit: 1 (one-time)
    1,   -- per user limit: 1
    FALSE,
    NOW(),
    NOW() + INTERVAL '90 days',  -- expires in 90 days
    TRUE
  );

  -- Create referral_use record
  INSERT INTO referral_uses (
    referral_code_id, referrer_user_id, referee_user_id,
    referee_coupon_code
  ) VALUES (
    v_code_record.id,
    v_code_record.referrer_user_id,
    p_referee_user_id,
    v_coupon_code
  );

  -- Update referred_by on customer_profile
  UPDATE customer_profiles
    SET referred_by_code = UPPER(p_referral_code)
  WHERE user_id = p_referee_user_id;

  RETURN jsonb_build_object(
    'success',         TRUE,
    'coupon_code',     v_coupon_code,
    'discount_type',   v_discount_type,
    'discount_value',  v_discount_value,
    'expires_in_days', 90
  );
END;
$$ LANGUAGE plpgsql;

-- Process referral reward when a qualifying order is placed by a referee.
-- Call this AFTER an order is confirmed/paid.
-- Returns JSONB with reward details.
CREATE OR REPLACE FUNCTION process_referral_reward(p_order_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_config       RECORD;
  v_order        RECORD;
  v_use          RECORD;
  v_reward_amt   NUMERIC(10,2);
  v_wallet_id    INTEGER;
  v_wallet_txn   INTEGER;
BEGIN
  SELECT * INTO v_config FROM referral_program_config WHERE id = 1;
  IF NOT FOUND OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'program_inactive');
  END IF;

  -- Get order
  SELECT o.id, o.customer_id, o.total_amount, o.status
    INTO v_order
  FROM orders o WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'order_not_found');
  END IF;

  -- MOA check
  IF v_order.total_amount < v_config.min_order_amount_for_reward THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'below_min_order_amount');
  END IF;

  -- Is the customer a referee?
  SELECT ru.* INTO v_use
  FROM referral_uses ru
  WHERE ru.referee_user_id = v_order.customer_id
    AND ru.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'not_a_referee');
  END IF;

  -- Max orders already counted?
  IF v_use.orders_counted >= v_config.referrer_max_orders_per_referee THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'max_orders_reached');
  END IF;

  -- Already processed this order?
  IF EXISTS (SELECT 1 FROM referral_reward_transactions WHERE referral_use_id = v_use.id AND order_id = p_order_id) THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'already_processed');
  END IF;

  -- Calculate reward
  v_reward_amt := ROUND(v_order.total_amount * v_config.referrer_reward_percent / 100.0, 2);
  v_reward_amt := LEAST(v_reward_amt, v_config.referrer_max_reward_per_order);

  IF v_reward_amt <= 0 THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'zero_reward');
  END IF;

  -- Get or create referrer wallet
  SELECT id INTO v_wallet_id
  FROM wallet_accounts
  WHERE user_id = v_use.referrer_user_id AND currency = 'INR';

  IF NOT FOUND THEN
    INSERT INTO wallet_accounts (user_id, currency, balance)
    VALUES (v_use.referrer_user_id, 'INR', 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet
  INSERT INTO wallet_transactions (wallet_id, order_id, kind, amount, reference, metadata)
  VALUES (
    v_wallet_id, p_order_id, 'credit', v_reward_amt,
    'Referral reward',
    jsonb_build_object(
      'referral_use_id', v_use.id,
      'referee_user_id', v_order.customer_id,
      'order_id', p_order_id,
      'reward_percent', v_config.referrer_reward_percent
    )
  )
  RETURNING id INTO v_wallet_txn;

  -- Update wallet balance
  UPDATE wallet_accounts SET balance = balance + v_reward_amt WHERE id = v_wallet_id;

  -- Record the reward transaction
  INSERT INTO referral_reward_transactions (
    referral_use_id, order_id,
    referrer_user_id, referee_user_id,
    order_amount, reward_percent, reward_amount,
    wallet_transaction_id
  ) VALUES (
    v_use.id, p_order_id,
    v_use.referrer_user_id, v_order.customer_id,
    v_order.total_amount, v_config.referrer_reward_percent, v_reward_amt,
    v_wallet_txn
  );

  -- Update referral_use counters
  UPDATE referral_uses
    SET orders_counted           = orders_counted + 1,
        total_earned_by_referrer = total_earned_by_referrer + v_reward_amt,
        status = CASE
                   WHEN orders_counted + 1 >= v_config.referrer_max_orders_per_referee
                   THEN 'completed'
                   ELSE 'active'
                 END
  WHERE id = v_use.id;

  -- Update referral code aggregate stats
  UPDATE customer_referral_codes
    SET total_earnings = total_earnings + v_reward_amt,
    total_referrals = total_referrals + 1
  WHERE id = v_use.referral_code_id;

  RETURN jsonb_build_object(
    'processed',     TRUE,
    'reward_amount', v_reward_amt,
    'wallet_id',     v_wallet_id
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 7: Seed data
-- ============================================================

-- Referral program config (single row)
INSERT INTO referral_program_config (
  id, is_active, program_name, program_description,
  referrer_reward_percent, referrer_max_reward_per_order, referrer_max_orders_per_referee,
  referee_discount_type, referee_discount_value, referee_discount_max_amount,
  min_order_amount_for_reward,
  referral_code_prefix, referral_code_length
) VALUES (
  1, TRUE, 'Refer & Earn',
  'Earn wallet credits every time someone you refer places an order. They get a discount, you earn rewards.',
  20.00, 500.00, 5,
  'percent', 50.00, NULL,
  200.00,
  'LDR', 10
)
ON CONFLICT (id) DO UPDATE
  SET is_active                       = EXCLUDED.is_active,
      referrer_reward_percent         = EXCLUDED.referrer_reward_percent,
      referrer_max_reward_per_order   = EXCLUDED.referrer_max_reward_per_order,
      referrer_max_orders_per_referee = EXCLUDED.referrer_max_orders_per_referee,
      referee_discount_type           = EXCLUDED.referee_discount_type,
      referee_discount_value          = EXCLUDED.referee_discount_value,
      min_order_amount_for_reward     = EXCLUDED.min_order_amount_for_reward,
      updated_at                      = NOW();

-- FIRST50 coupon for non-referred first-time customers
INSERT INTO coupons (
  code, name, description,
  discount_type, discount_value,
  min_order_amount,
  usage_limit_global, usage_limit_per_user,
  stackable, starts_at, is_active
) VALUES (
  'FIRST50',
  'First Order Discount',
  'Get ₹50 off on your first order with Laundrease. For new customers only.',
  'flat', 50.00,
  100.00,
  NULL,   -- unlimited global uses
  1,      -- one per user
  FALSE,
  NOW(),
  TRUE
)
ON CONFLICT (code) DO UPDATE
  SET discount_value        = EXCLUDED.discount_value,
      usage_limit_per_user  = EXCLUDED.usage_limit_per_user,
      is_active             = EXCLUDED.is_active,
      updated_at            = NOW();
