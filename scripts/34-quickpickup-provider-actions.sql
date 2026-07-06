-- ============================================================
-- Migration 35: Per-provider quick-pickup action tracking
-- ============================================================
-- 1. Slim global quick_pickup_requests.status to open|claimed|closed
-- 2. Add quick_pickup_provider_actions for per-provider lifecycle
-- 3. Fix broken notification trigger from migration 34
-- ============================================================

-- ── 1. Update global status values ────────────────────────

-- Drop old check constraint (name may vary, so try both common names)
ALTER TABLE quick_pickup_requests
  DROP CONSTRAINT IF EXISTS quick_pickup_requests_status_check,
  DROP CONSTRAINT IF EXISTS qpr_status_check;

-- Migrate existing data to new global statuses
UPDATE quick_pickup_requests SET status = 'open'    WHERE status IN ('new', 'contacted');
UPDATE quick_pickup_requests SET status = 'claimed'  WHERE status = 'converted';

-- Add new constraint
ALTER TABLE quick_pickup_requests
  ADD CONSTRAINT quick_pickup_requests_status_check
    CHECK (status IN ('open', 'claimed', 'closed'));

-- Update default
ALTER TABLE quick_pickup_requests ALTER COLUMN status SET DEFAULT 'open';

-- ── 2. Per-provider action tracking ───────────────────────

CREATE TABLE IF NOT EXISTS quick_pickup_provider_actions (
  id           BIGSERIAL PRIMARY KEY,
  request_id   BIGINT      NOT NULL REFERENCES quick_pickup_requests(id) ON DELETE CASCADE,
  provider_id  INTEGER     NOT NULL REFERENCES laundry_profiles(id)      ON DELETE CASCADE,
  my_status    TEXT        NOT NULL
                 CHECK (my_status IN (
                   'contacted',
                   'pickup_confirmed',
                   'pickup_not_confirmed',
                   'order_received_at_laundry',
                   'order_processing',
                   'out_for_delivery',
                   'order_delivered'
                 )),
  contacted_at  TIMESTAMPTZ,
  confirmed_at  TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_qppa_provider
  ON quick_pickup_provider_actions (provider_id, my_status);

CREATE INDEX IF NOT EXISTS idx_qppa_request
  ON quick_pickup_provider_actions (request_id);

-- ── 3. Fix notification trigger (migration 34 referenced    ──
--       laundry_profile_id which does not exist on that table)

-- Drop the broken trigger and function
DROP TRIGGER  IF EXISTS trg_laundry_quick_pickup ON quick_pickup_requests;
DROP FUNCTION IF EXISTS notify_laundry_quick_pickup();

-- Correct trigger: fan-out to every active provider serving the request's pincode
CREATE OR REPLACE FUNCTION notify_laundry_quick_pickup_new()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO laundry_notifications (provider_id, type, title, body, quick_pickup_request_id)
    SELECT
      psa.provider_id,
      'quick_pickup',
      'New quick pickup request',
      'A customer in ' || COALESCE(NEW.city, NEW.pincode) || ' needs pickup. Tap to view.',
      NEW.id
    FROM provider_service_areas psa
    INNER JOIN laundry_profiles lp ON lp.id = psa.provider_id
    WHERE psa.postal_code = NEW.pincode
      AND psa.is_active   = TRUE
      AND lp.status       = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_laundry_quick_pickup_new ON quick_pickup_requests;
CREATE TRIGGER trg_laundry_quick_pickup_new
  AFTER INSERT ON quick_pickup_requests
  FOR EACH ROW EXECUTE FUNCTION notify_laundry_quick_pickup_new();

-- ============================================================
-- The customer search route requires lp.is_verified = TRUE before a provider
-- shows up in search results. Previously, verification was manual (admin action).
--
-- Going forward, providers are auto-verified when their subscription payment
-- succeeds (in the PayU callback route). This migration backfills the flag for
-- all existing providers who already have an active subscription so they
-- become visible to customers without re-paying.
--
-- Admin can still unverify bad actors via the admin panel.
-- ============================================================

UPDATE laundry_profiles lp
SET
  is_verified = TRUE,
  verified_at = COALESCE(lp.verified_at, NOW()),
  updated_at  = NOW()
WHERE
  lp.is_verified = FALSE
  AND EXISTS (
    SELECT 1 FROM laundry_provider_subscriptions lps
    WHERE lps.provider_id = lp.id
      AND lps.status      = 'active'
      AND lps.ends_at     > NOW()
  );

-- ============================================================
-- 1. Add 'scheduled' status for deferred subscription activations
-- 2. Add basic_trial_used to laundry_profiles
-- 3. Add renewal_reminder_sent_7d / _1d to track notification dedup
-- 4. Update expire_subscriptions_and_fallback to promote scheduled → active
-- 5. Update assign_basic_plan_on_approval to set basic_trial_used = TRUE
-- 6. Add grace_period_ends_at for 3-day post-expiry visibility
-- 7. Backfill basic_trial_used for existing providers
-- ============================================================

-- ── 1. Allow 'scheduled' subscription status ────────────────────────────────
-- Drop the existing CHECK constraint (name may vary; use pg_constraint lookup)
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'laundry_provider_subscriptions'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE laundry_provider_subscriptions DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END $$;

ALTER TABLE laundry_provider_subscriptions
  ADD CONSTRAINT lps_status_check
    CHECK (status IN ('active', 'expired', 'cancelled', 'scheduled'));

-- Index for finding pending scheduled subs that are ready to activate
CREATE INDEX IF NOT EXISTS idx_lps_scheduled
  ON laundry_provider_subscriptions (provider_id, starts_at)
  WHERE status = 'scheduled';

-- ── 2. Track first-time Basic trial usage on laundry_profiles ───────────────
ALTER TABLE laundry_profiles
  ADD COLUMN IF NOT EXISTS basic_trial_used BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Renewal reminder dedup columns ───────────────────────────────────────
ALTER TABLE laundry_provider_subscriptions
  ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at TIMESTAMPTZ;

-- ── 4. Grace period: provider stays visible 3 days after expiry ─────────────
--    We store the grace end date so the customer search can filter cleanly.
ALTER TABLE laundry_provider_subscriptions
  DROP COLUMN IF EXISTS grace_period_ends_at;

ALTER TABLE laundry_provider_subscriptions
  ADD COLUMN grace_period_ends_at TIMESTAMPTZ;

UPDATE laundry_provider_subscriptions
SET grace_period_ends_at = ends_at + INTERVAL '3 days';

CREATE OR REPLACE FUNCTION set_grace_period_ends_at()
RETURNS trigger AS $$
BEGIN
  NEW.grace_period_ends_at := NEW.ends_at + INTERVAL '3 days';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_grace_period_ends_at
ON laundry_provider_subscriptions;

CREATE TRIGGER trg_set_grace_period_ends_at
BEFORE INSERT OR UPDATE OF ends_at, grace_period_ends_at
ON laundry_provider_subscriptions
FOR EACH ROW
EXECUTE FUNCTION set_grace_period_ends_at();

-- ── 5. Backfill: mark providers who already consumed their Basic trial ────────
UPDATE laundry_profiles lp
SET basic_trial_used = TRUE
WHERE EXISTS (
  SELECT 1
  FROM laundry_provider_subscriptions lps
  JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
  WHERE lps.provider_id = lp.id
    AND lsp.name ILIKE 'basic'
    AND lps.is_trial = TRUE
);

-- ── 6. Update assign_basic_plan_on_approval: set basic_trial_used = TRUE ─────
CREATE OR REPLACE FUNCTION assign_basic_plan_on_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_basic_plan_id INTEGER;
  v_offer_id      INTEGER;
  v_offer_price   NUMERIC(10,2);
  v_is_trial      BOOLEAN;
BEGIN
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF OLD.status = 'active' THEN RETURN NEW; END IF;

  -- Only if no active subscription already exists
  IF EXISTS (
    SELECT 1 FROM laundry_provider_subscriptions
    WHERE provider_id = NEW.id AND status = 'active'
  ) THEN RETURN NEW; END IF;

  -- Don't re-assign if trial already used
  IF NEW.basic_trial_used THEN RETURN NEW; END IF;

  SELECT id INTO v_basic_plan_id
  FROM laundry_subscription_plans
  WHERE LOWER(name) = 'basic' AND is_active = TRUE
  LIMIT 1;

  IF v_basic_plan_id IS NULL THEN
    RAISE WARNING 'assign_basic_plan_on_approval: No active Basic plan for provider %', NEW.id;
    RETURN NEW;
  END IF;

  SELECT id, override_price INTO v_offer_id, v_offer_price
  FROM laundry_subscription_offers
  WHERE plan_id = v_basic_plan_id
    AND is_active = TRUE
    AND scope = 'global'
    AND NOW() BETWEEN starts_at AND ends_at
  ORDER BY override_price ASC
  LIMIT 1;

  v_is_trial := (v_offer_id IS NOT NULL AND v_offer_price = 0);

  INSERT INTO laundry_provider_subscriptions (
    provider_id, plan_id, is_trial, amount_paid,
    starts_at, ends_at, status, offer_id, auto_renew
  ) VALUES (
    NEW.id, v_basic_plan_id,
    v_is_trial,
    COALESCE(v_offer_price, (SELECT monthly_price FROM laundry_subscription_plans WHERE id = v_basic_plan_id)),
    NOW(), NOW() + INTERVAL '1 month',
    'active', v_offer_id, TRUE
  );

  -- Mark trial as consumed
  UPDATE laundry_profiles SET basic_trial_used = TRUE WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_basic_on_approval ON laundry_profiles;
CREATE TRIGGER trg_assign_basic_on_approval
  AFTER UPDATE OF status ON laundry_profiles
  FOR EACH ROW
  EXECUTE FUNCTION assign_basic_plan_on_approval();

-- ── 7. Update expire_subscriptions_and_fallback: promote scheduled → active ──
CREATE OR REPLACE FUNCTION expire_subscriptions_and_fallback()
RETURNS INTEGER AS $$
DECLARE
  v_sub            RECORD;
  v_scheduled      RECORD;
  v_basic_plan_id  INTEGER;
  v_count          INTEGER := 0;
BEGIN
  SELECT id INTO v_basic_plan_id
  FROM laundry_subscription_plans
  WHERE LOWER(name) = 'basic' AND is_active = TRUE
  LIMIT 1;

  FOR v_sub IN
    SELECT lps.id, lps.provider_id, lps.plan_id
    FROM laundry_provider_subscriptions lps
    WHERE lps.status = 'active' AND lps.ends_at < NOW()
  LOOP
    -- Expire current subscription
    UPDATE laundry_provider_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE id = v_sub.id;

    -- Check for a scheduled subscription ready to activate
    SELECT * INTO v_scheduled
    FROM laundry_provider_subscriptions
    WHERE provider_id = v_sub.provider_id
      AND status = 'scheduled'
      AND starts_at <= NOW()
    ORDER BY starts_at ASC
    LIMIT 1;

    IF FOUND THEN
      -- Promote scheduled → active
      UPDATE laundry_provider_subscriptions
      SET status = 'active', updated_at = NOW()
      WHERE id = v_scheduled.id;
    ELSE
      -- No scheduled sub: fall back to expired Basic placeholder
      IF v_basic_plan_id IS NOT NULL AND v_sub.plan_id <> v_basic_plan_id THEN
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
            NOW(), NOW() - INTERVAL '1 second',
            'expired', FALSE
          );
        END IF;
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS admin_notifications (
  id          BIGSERIAL    PRIMARY KEY,
  type        TEXT         NOT NULL,   -- 'new_laundry_registration' | 'new_delivery_registration'
  title       TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  entity_id   TEXT,                    -- public_id of the laundry/delivery profile
  is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread
  ON admin_notifications (is_read, created_at DESC);

-- ── Trigger: new laundry provider registered ──────────────────

CREATE OR REPLACE FUNCTION notify_admin_new_laundry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO admin_notifications (type, title, body, entity_id)
  VALUES (
    'new_laundry_registration',
    'New laundry partner registered',
    COALESCE(NEW.business_name, 'A new laundry provider') || ' has registered and is awaiting verification.',
    NEW.public_id::TEXT
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_new_laundry ON laundry_profiles;
CREATE TRIGGER trg_admin_new_laundry
  AFTER INSERT ON laundry_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_admin_new_laundry();

-- ── Trigger: new delivery person registered ───────────────────

CREATE OR REPLACE FUNCTION notify_admin_new_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO admin_notifications (type, title, body, entity_id)
  VALUES (
    'new_delivery_registration',
    'New delivery partner registered',
    COALESCE(NEW.full_name, 'A new delivery person') || ' has registered and is awaiting verification.',
    NEW.public_id::TEXT
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_new_delivery ON delivery_profiles;
CREATE TRIGGER trg_admin_new_delivery
  AFTER INSERT ON delivery_profiles
  FOR EACH ROW EXECUTE FUNCTION notify_admin_new_delivery();

