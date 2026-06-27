-- ============================================================
-- 27-subscription-enhancements.sql
-- 1. Add columns to laundry_subscription_plans
-- 2. Add columns to laundry_provider_subscriptions
-- 3. Function: assign_basic_plan_on_approval()
-- 4. Trigger: auto-assign Basic when provider approved
-- 5. Function: expire_subscriptions_and_fallback()
--    (call via pg_cron or admin action nightly)
-- 6. Function: get_effective_commission(provider_id)
--    (used by payout calculation)
-- ============================================================

-- ============================================================
-- 1. laundry_subscription_plans enhancements
-- ============================================================

ALTER TABLE laundry_subscription_plans
  -- Whether providers can override the plan's default commission type
  ADD COLUMN IF NOT EXISTS allow_commission_override BOOLEAN NOT NULL DEFAULT FALSE,
  -- Description shown on plan card (short tagline)
  ADD COLUMN IF NOT EXISTS tagline VARCHAR(150),
  -- Color accent for the plan card (hex or tailwind key)
  ADD COLUMN IF NOT EXISTS color VARCHAR(30) DEFAULT 'violet';

-- ============================================================
-- 2. laundry_provider_subscriptions enhancements
-- ============================================================

ALTER TABLE laundry_provider_subscriptions
  -- Provider-specific commission override (NULL = use plan default)
  ADD COLUMN IF NOT EXISTS commission_type_override  VARCHAR(10)
    CHECK (commission_type_override IS NULL OR commission_type_override IN ('percent', 'flat')),
  ADD COLUMN IF NOT EXISTS commission_value_override NUMERIC(10,2)
    CHECK (commission_value_override IS NULL OR commission_value_override >= 0),
  -- Payment info for paid subscriptions
  ADD COLUMN IF NOT EXISTS payment_transaction_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payment_gateway         VARCHAR(30),  -- 'razorpay' | 'cashfree' | 'payu'
  ADD COLUMN IF NOT EXISTS payment_gateway_order_id VARCHAR(255), -- gateway-side order id
  -- Auto-renew (default true — admin can disable per provider)
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  -- Cancellation tracking
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  -- Which offer was applied (NULL = no offer)
  ADD COLUMN IF NOT EXISTS offer_id INTEGER REFERENCES laundry_subscription_offers(id) ON DELETE SET NULL;

-- Index for finding subscriptions expiring soon (for notifications + cron)
CREATE INDEX IF NOT EXISTS idx_lps_expiring
  ON laundry_provider_subscriptions (ends_at, status)
  WHERE status = 'active';

-- Index for payment lookup
CREATE INDEX IF NOT EXISTS idx_lps_payment_txn
  ON laundry_provider_subscriptions (payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

-- ============================================================
-- 3. Function: assign_basic_plan_on_approval
--    Called by trigger when laundry_profiles.status → 'active'
--    Only fires if provider has NO active subscription yet.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_basic_plan_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_basic_plan_id INTEGER;
  v_offer_id      INTEGER;
  v_offer_price   NUMERIC(10,2);
  v_is_trial      BOOLEAN;
BEGIN
  -- Only fire when status changes TO 'active' from something else
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF OLD.status = 'active' THEN RETURN NEW; END IF;

  -- Check if provider already has an active subscription
  IF EXISTS (
    SELECT 1 FROM laundry_provider_subscriptions
    WHERE provider_id = NEW.id AND status = 'active'
  ) THEN
    RETURN NEW;
  END IF;

  -- Get Basic plan
  SELECT id INTO v_basic_plan_id
  FROM laundry_subscription_plans
  WHERE LOWER(name) = 'basic' AND is_active = TRUE
  LIMIT 1;

  IF v_basic_plan_id IS NULL THEN
    RAISE WARNING 'assign_basic_plan_on_approval: No active Basic plan found for provider %', NEW.id;
    RETURN NEW;
  END IF;

  -- Check for an active global offer on the Basic plan (first month free)
  SELECT id, override_price INTO v_offer_id, v_offer_price
  FROM laundry_subscription_offers
  WHERE plan_id = v_basic_plan_id
    AND is_active = TRUE
    AND scope = 'global'
    AND NOW() BETWEEN starts_at AND ends_at
  ORDER BY override_price ASC  -- pick cheapest offer if multiple
  LIMIT 1;

  v_is_trial := (v_offer_id IS NOT NULL AND v_offer_price = 0);

  INSERT INTO laundry_provider_subscriptions (
    provider_id, plan_id, is_trial, amount_paid,
    starts_at, ends_at, status, offer_id, auto_renew
  ) VALUES (
    NEW.id, v_basic_plan_id,
    v_is_trial,
    COALESCE(v_offer_price, (SELECT monthly_price FROM laundry_subscription_plans WHERE id = v_basic_plan_id)),
    NOW(),
    NOW() + INTERVAL '1 month',
    'active',
    v_offer_id,
    TRUE
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_basic_on_approval ON laundry_profiles;
CREATE TRIGGER trg_assign_basic_on_approval
  AFTER UPDATE OF status ON laundry_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_basic_plan_on_approval();

-- ============================================================
-- 4. Function: expire_subscriptions_and_fallback
--    Call nightly via pg_cron or admin cron endpoint.
--    Expires overdue subscriptions → assigns Basic (non-trial).
--    Blocks providers from receiving orders until they renew.
-- ============================================================

CREATE OR REPLACE FUNCTION expire_subscriptions_and_fallback()
RETURNS INTEGER AS $$
DECLARE
  v_sub            RECORD;
  v_basic_plan_id  INTEGER;
  v_count          INTEGER := 0;
BEGIN
  -- Get Basic plan ID
  SELECT id INTO v_basic_plan_id
  FROM laundry_subscription_plans
  WHERE LOWER(name) = 'basic' AND is_active = TRUE
  LIMIT 1;

  -- Find all active subscriptions that have ended
  FOR v_sub IN
    SELECT lps.id, lps.provider_id, lps.plan_id
    FROM laundry_provider_subscriptions lps
    WHERE lps.status = 'active'
      AND lps.ends_at < NOW()
  LOOP
    -- Expire the current subscription
    UPDATE laundry_provider_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_sub.id;

    -- If already on Basic plan, just leave expired — provider needs to pay to reactivate
    -- If on Standard/Premium, fall back to Basic (expired) — they need to renew
    -- In either case, insert a new EXPIRED Basic row so provider sees they're on basic
    IF v_basic_plan_id IS NOT NULL AND v_sub.plan_id <> v_basic_plan_id THEN
      -- Only insert if no active subscription exists (shouldn't, but guard anyway)
      IF NOT EXISTS (
        SELECT 1 FROM laundry_provider_subscriptions
        WHERE provider_id = v_sub.provider_id AND status = 'active'
      ) THEN
        INSERT INTO laundry_provider_subscriptions (
          provider_id, plan_id, is_trial, amount_paid,
          starts_at, ends_at, status, auto_renew
        ) VALUES (
          v_sub.provider_id, v_basic_plan_id,
          FALSE, 0,
          NOW(), NOW() - INTERVAL '1 second',  -- immediately expired
          'expired', FALSE
        );
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Function: get_effective_commission(provider_id)
--    Returns the commission type + value actually charged
--    for the provider's current active subscription.
--    Used in payout calculations.
-- ============================================================

CREATE OR REPLACE FUNCTION get_effective_commission(p_provider_id BIGINT)
RETURNS TABLE (
  commission_type  VARCHAR(10),
  commission_value NUMERIC(10,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(lps.commission_type_override,  lsp.commission_type)  AS commission_type,
    COALESCE(lps.commission_value_override, lsp.commission_value) AS commission_value
  FROM laundry_provider_subscriptions lps
  INNER JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
  WHERE lps.provider_id = p_provider_id
    AND lps.status = 'active'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 6. Update existing Basic plan — set tagline + allow_commission_override
-- ============================================================

UPDATE laundry_subscription_plans SET
  tagline                  = 'Get started with the essentials',
  color                    = 'blue',
  allow_commission_override = FALSE
WHERE LOWER(name) = 'basic';

UPDATE laundry_subscription_plans SET
  tagline                  = 'The right plan for growing businesses',
  color                    = 'violet',
  allow_commission_override = TRUE
WHERE LOWER(name) = 'standard';

UPDATE laundry_subscription_plans SET
  tagline                  = 'Unlimited scale, premium support',
  color                    = 'amber',
  allow_commission_override = TRUE
WHERE LOWER(name) = 'premium';

-- ============================================================
-- 7. Verify
-- ============================================================
-- SELECT id, name, monthly_price, commission_type, commission_value,
--        allow_commission_override, tagline, color
-- FROM laundry_subscription_plans ORDER BY sort_order;

-- SELECT progroutine_name FROM information_schema.routines
-- WHERE routine_name IN (
--   'assign_basic_plan_on_approval',
--   'expire_subscriptions_and_fallback',
--   'get_effective_commission'
-- );
