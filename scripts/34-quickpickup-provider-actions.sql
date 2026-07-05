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

