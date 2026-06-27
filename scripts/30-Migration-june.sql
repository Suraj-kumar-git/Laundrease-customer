BEGIN;
ALTER TABLE payments
  ALTER COLUMN order_id DROP DEFAULT,
  ALTER COLUMN order_id DROP NOT NULL,
  ALTER COLUMN order_id TYPE BIGINT;
-- Drop existing FK to orders, because the new definition does not include it
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
-- 3) Rename existing columns
ALTER TABLE payments
  RENAME COLUMN transaction_id TO provider_txn_id;
ALTER TABLE payments
  RENAME COLUMN method_details TO gateway_response;
-- 4) Adjust existing column definitions
ALTER TABLE payments
  ALTER COLUMN provider_txn_id TYPE VARCHAR(100),
  ALTER COLUMN amount TYPE NUMERIC(10,2),
  ALTER COLUMN status TYPE VARCHAR(30),
  ALTER COLUMN gateway_response SET DEFAULT '{}'::jsonb;
-- Ensure gateway_response is not null before applying NOT NULL
UPDATE payments
SET gateway_response = '{}'::jsonb
WHERE gateway_response IS NULL;
ALTER TABLE payments
  ALTER COLUMN gateway_response SET NOT NULL;
-- 5) Remove old status check constraint and set new default
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments
  ALTER COLUMN status SET DEFAULT 'initiated';
-- 6) Add new columns
ALTER TABLE payments
  ADD COLUMN provider VARCHAR(30),
  ADD COLUMN merchant_txn_id VARCHAR(100),
  ADD COLUMN currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
-- 7) Backfill required values for existing rows
-- Replace these placeholder values with real business logic if needed
UPDATE payments
SET
  provider = COALESCE(provider, 'unknown'),
  merchant_txn_id = COALESCE(merchant_txn_id, 'MIG-' || id::text);
-- 8) Enforce NOT NULL and UNIQUE constraints after backfill
ALTER TABLE payments
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN merchant_txn_id SET NOT NULL;
ALTER TABLE payments
  ADD CONSTRAINT payments_merchant_txn_id_key UNIQUE (merchant_txn_id);
COMMIT;

-- Function
CREATE OR REPLACE FUNCTION set_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP Trigger
DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
-- Create Trigger
CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW
EXECUTE FUNCTION set_payments_updated_at();

ALTER TABLE payments
  ADD COLUMN gateway_config_id INTEGER NULL REFERENCES payment_gateway_config(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS payment_gateway_transactions (
  id BIGSERIAL PRIMARY KEY,
  payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  gateway_config_id INTEGER REFERENCES payment_gateway_config(id) ON DELETE SET NULL,
  provider VARCHAR(30) NOT NULL,
  merchant_txn_id VARCHAR(100) NOT NULL,
  provider_order_id VARCHAR(100),
  provider_payment_id VARCHAR(100),
  provider_txn_id VARCHAR(100),
  amount NUMERIC(10,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(30) NOT NULL DEFAULT 'initiated',
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  webhook_payload JSONB,
  error_code VARCHAR(100),
  error_message TEXT,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_gateway_transactions_merchant_txn_id_key UNIQUE (merchant_txn_id)
);

-- ============================================================
-- Migration 32: Order cancellation refund support
-- Adds wallet_credit_for_order(), the symmetric counterpart of
-- wallet_debit_for_order() (see 13-trigger-fix-and-wallet.sql),
-- used to refund a customer's wallet when a paid order is
-- cancelled before the laundry starts processing it.
-- ============================================================

CREATE OR REPLACE FUNCTION wallet_credit_for_order(
  p_user_id      BIGINT,
  p_order_id     BIGINT,
  p_amount       NUMERIC(12,2),
  p_reference    TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_wallet_id     INTEGER;
  v_wallet_txn_id INTEGER;
BEGIN
  -- Ensure a wallet exists, with row lock to keep this atomic
  v_wallet_id := ensure_wallet_exists(p_user_id);

  PERFORM 1 FROM wallet_accounts WHERE id = v_wallet_id FOR UPDATE;

  INSERT INTO wallet_transactions (wallet_id, order_id, kind, amount, reference, metadata)
  VALUES (
    v_wallet_id, p_order_id, 'credit', p_amount,
    COALESCE(p_reference, 'Order cancellation refund'),
    jsonb_build_object('order_id', p_order_id, 'type', 'order_cancellation_refund')
  )
  RETURNING id INTO v_wallet_txn_id;

  RETURN v_wallet_txn_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Migration 33: Estimated delivery date for orders
--
-- Adds the storage needed to compute and display an estimated
-- delivery DAY (not a time slot) to customers, based on the
-- slowest service in the order, the provider's per-service
-- turnaround overrides, and express-service turnaround.
-- ============================================================

-- 1) Where we cache the computed estimate (recomputed on create + reschedule)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE;

-- 2) Express turnaround is currently undefined for services — express only
--    affects price (express_multiplier), not how fast the order comes back.
--    Add explicit express turnaround fields so the estimate can reflect it.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS express_turnaround_hours INTEGER
    CHECK (express_turnaround_hours IS NULL OR express_turnaround_hours > 0);

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS express_turnaround_hours_override INTEGER
    CHECK (express_turnaround_hours_override IS NULL OR express_turnaround_hours_override > 0);

-- 3) Backfill sensible express turnaround defaults for existing express-capable
--    services that don't have one set yet — half the standard turnaround,
--    capped at 24h (matches the "express delivers within 12-24h" FAQ copy).
UPDATE services
SET express_turnaround_hours = LEAST(24, CEIL(turnaround_hours / 2.0))
WHERE is_express_available = TRUE
  AND express_turnaround_hours IS NULL;

-- ============================================================
-- 31-customer-support-categories.sql
--
-- Customers currently have no way to raise support tickets from
-- the app (only laundry/delivery/admin portals use support_tickets
-- today). This script:
--
-- 1. Adds sub_categories_by_role JSONB to support_ticket_categories
--    so each role can see its own relevant sub-category options
--    instead of the laundry-oriented list that's there today.
-- 2. Opens up the 'wallet' category to the customer role too
--    (renamed in spirit to cover payments/refunds for customers).
-- 3. Seeds customer-specific sub-categories for order/wallet/
--    technical/account categories.
-- ============================================================

ALTER TABLE support_ticket_categories
  ADD COLUMN IF NOT EXISTS sub_categories_by_role JSONB DEFAULT NULL;

-- 'order' — customer-relevant sub-categories
UPDATE support_ticket_categories
SET sub_categories_by_role = COALESCE(sub_categories_by_role, '{}'::jsonb) || jsonb_build_object(
  'customer', '[
    "Order not picked up on time",
    "Order delayed",
    "Wrong items returned",
    "Item damaged or lost",
    "Missing item(s) in delivery",
    "Quality issue with cleaning",
    "Unable to cancel or reschedule",
    "Other order issue"
  ]'::jsonb
)
WHERE code = 'order';

-- 'wallet' — open to customers, and add customer-specific sub-categories.
-- (Covers payment/refund issues, including the online payment flow.)
UPDATE support_ticket_categories
SET allowed_roles = '["laundry","delivery","admin","customer"]'::jsonb,
    sub_categories_by_role = COALESCE(sub_categories_by_role, '{}'::jsonb) || jsonb_build_object(
      'customer', '[
        "Payment deducted but order not placed",
        "Refund not received",
        "Double payment charged",
        "Wallet balance incorrect",
        "Coupon discount not applied to refund",
        "Other payment issue"
      ]'::jsonb
    )
WHERE code = 'wallet';

-- 'technical' — customer-specific sub-categories
UPDATE support_ticket_categories
SET sub_categories_by_role = COALESCE(sub_categories_by_role, '{}'::jsonb) || jsonb_build_object(
  'customer', '[
    "Cannot log in",
    "App crashing or freezing",
    "Unable to place an order",
    "OTP not received",
    "Page not loading",
    "Other technical issue"
  ]'::jsonb
)
WHERE code = 'technical';

-- 'account' — customer-specific sub-categories
UPDATE support_ticket_categories
SET sub_categories_by_role = COALESCE(sub_categories_by_role, '{}'::jsonb) || jsonb_build_object(
  'customer', '[
    "Unable to update profile",
    "Change registered phone number",
    "Address not saving",
    "Delete my account",
    "Other account issue"
  ]'::jsonb
)
WHERE code = 'account';

-- ============================================================
-- 32-fix-auto-assign-delivery.sql
--
-- Fixes two bugs found while cross-verifying auto_assign_delivery_partner()
-- (originally defined in scripts/12-fixes-and-fees.sql):
--
-- 1. shift_status check incorrectly treated 'off_duty' partners as eligible
--    regardless of is_online — any partner not on 'break' qualified, which
--    contradicts the function's own doc comment ("must be on_duty or online").
--
-- 2. The delivery_availability EXISTS check had no fallback for partners who
--    never configured a weekly schedule — unlike the zone check (which falls
--    back to "available everywhere" when no zones are configured), an
--    unconfigured partner was permanently invisible to auto-assignment with
--    no error or signal. Now mirrors the zone fallback: a partner with zero
--    delivery_availability rows at all is treated as available anytime,
--    until they configure a real schedule.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_assign_delivery_partner(
  p_order_id BIGINT
)
RETURNS BIGINT AS $$
DECLARE
  v_order             RECORD;
  v_pickup_date       DATE;
  v_pickup_day        SMALLINT;
  v_pickup_slot_start TIME;
  v_best_profile_id   BIGINT;
BEGIN
  SELECT o.id, o.pickup_date, o.pickup_time_slot, o.is_express,
         o.assignment_status, o.status,
         (o.pickup_address::jsonb ->> 'city') AS pickup_city,
         (o.pickup_address::jsonb ->> 'postal_code') AS pickup_postal
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.assignment_status <> 'unassigned' THEN
    RAISE EXCEPTION 'Order % is already assigned', p_order_id;
  END IF;

  v_pickup_date := v_order.pickup_date;
  v_pickup_day  := EXTRACT(DOW FROM v_pickup_date)::SMALLINT;
  BEGIN
    v_pickup_slot_start := (split_part(v_order.pickup_time_slot, '-', 1))::TIME;
  EXCEPTION WHEN OTHERS THEN
    v_pickup_slot_start := '09:00'::TIME;
  END;

  SELECT dp.id INTO v_best_profile_id
  FROM delivery_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.status = 'active'
    AND dp.is_verified = TRUE
    AND u.status = 'active'
    -- Fix 1: off_duty-and-not-online partners are no longer eligible.
    AND (dp.shift_status = 'on_duty' OR dp.is_online = TRUE)
    -- Fix 2: availability check now has the same "unconfigured = available
    -- everywhere" fallback the zone check already had.
    AND (
      EXISTS (
        SELECT 1 FROM delivery_availability da
        WHERE da.delivery_profile_id = dp.id
          AND da.day_of_week = v_pickup_day
          AND da.start_time <= v_pickup_slot_start
          AND da.end_time   >= v_pickup_slot_start
          AND (da.effective_from IS NULL OR da.effective_from <= v_pickup_date)
          AND (da.effective_to   IS NULL OR da.effective_to   >= v_pickup_date)
      )
      OR NOT EXISTS (
        SELECT 1 FROM delivery_availability WHERE delivery_profile_id = dp.id
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM delivery_profile_service_zones dpsz
        JOIN service_zones sz ON sz.id = dpsz.service_zone_id
        WHERE dpsz.delivery_profile_id = dp.id
        AND (sz.shape->>'postal_code' = v_order.pickup_postal
             OR sz.shape->>'city' ILIKE v_order.pickup_city)
      )
      OR NOT EXISTS (
        SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id
      )
    )
  ORDER BY
    (SELECT COUNT(*) FROM orders o2
     WHERE o2.delivery_profile_id = dp.id
       AND o2.status NOT IN ('delivered','cancelled','completed','returned')
    ) ASC,
    CASE WHEN dp.shift_status = 'on_duty' THEN 0 ELSE 1 END ASC,
    dp.rating DESC
  LIMIT 1;

  IF v_best_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE orders
  SET delivery_profile_id = v_best_profile_id,
      assignment_status   = 'auto_assigned',
      assigned_at         = NOW(),
      updated_at          = NOW()
  WHERE id = p_order_id;

  INSERT INTO order_delivery_assignments (
    order_id, delivery_profile_id, assigned_by, assignment_type, selection_meta
  ) VALUES (
    p_order_id, v_best_profile_id, NULL, 'auto',
    jsonb_build_object(
      'pickup_city',   v_order.pickup_city,
      'pickup_postal', v_order.pickup_postal,
      'pickup_day',    v_pickup_day,
      'is_express',    v_order.is_express
    )
  );

  RETURN v_best_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 33-testimonial-ownership.sql
--
-- platform_testimonials had no link back to the customer who submitted it —
-- the API matched "the customer's existing testimonial" by display_name +
-- is_active = FALSE, which breaks the moment a testimonial gets approved
-- (is_active = TRUE): the next submission no longer matches anything and
-- becomes a brand-new row instead of updating the original. Customers could
-- end up with multiple testimonials, which isn't intended — one customer
-- should have at most one piece of feedback, editable/deletable any time.
--
-- Adds a proper customer_id FK so ownership is unambiguous.
-- ============================================================

ALTER TABLE platform_testimonials
  ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES users(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_testimonials_customer_unique
  ON platform_testimonials (customer_id)
  WHERE customer_id IS NOT NULL;

-- ============================================================
-- 34-services-icon-sort.sql
--
-- The public services catalog page (app/customer/services/page.tsx) showed
-- a hardcoded service list. Moving it to be DB-driven from the `services`
-- table — but that table had no icon/sort_order columns (the public API at
-- app/api/customer/public/services/route.ts was actually already querying
-- s.icon_url/s.unit/s.features/s.sort_order, none of which exist — it would
-- have errored if ever hit). Adds icon (emoji, matching the product_types
-- convention) + sort_order, and seeds sensible defaults for existing rows.
-- ============================================================

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS icon       VARCHAR(10) DEFAULT '🧺',
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE services SET icon = '👕', sort_order = 10 WHERE category = 'wash'       AND icon = '🧺';
UPDATE services SET icon = '🧥', sort_order = 20 WHERE category = 'dry_clean'  AND icon = '🧺';
UPDATE services SET icon = '🔥', sort_order = 30 WHERE category = 'iron'       AND icon = '🧺';
UPDATE services SET icon = '💨', sort_order = 40 WHERE category = 'steam'      AND icon = '🧺';
UPDATE services SET icon = '⚡', sort_order = 50 WHERE category = 'express'    AND icon = '🧺';

-- ============================================================
-- Migration 34: COD cash-collection confirmation at delivery
-- A delivery partner must enter the cash amount actually received from
-- the customer before the "send delivery OTP" action is enabled for COD
-- (or wallet+cod) orders. Recorded here so verify-otp/route.ts can
-- finalize payment_status and, if the collected amount exceeds what was
-- due (change unavailable), credit the difference to the customer's
-- wallet via wallet_credit_for_order().
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cod_amount_collected DECIMAL(10,2);

-- ============================================================
-- Migration 35: Fix delivery region-matching + assignment race
--
-- 1. orders.pickup_pincode (added in scripts/29-Delivery-payout.sql) was
--    never actually populated at order creation (fixed going forward in
--    app/api/customer/orders/create/route.ts). It was always NULL, so
--    available-orders/route.ts's pincode match never fired and silently
--    fell through to a fragile city-substring match on the raw address
--    text — explaining "orders not appearing in the right region".
--    Best-effort backfill for existing orders: pull a 6-digit pincode out
--    of the stored pickup_address (works whether it's a JSON blob with a
--    postal_code field or a plain formatted string ending in the pincode).
-- 2. The race-condition fix itself is in app/api/laundry/orders/[id]/status/
--    route.ts (don't reset assignment_status on confirm if a partner was
--    already auto-assigned) and the available-orders/accept routes (added
--    explicit delivery_profile_id IS NULL checks) — no schema change
--    needed for those, just query/logic fixes.
-- ============================================================

UPDATE orders
SET pickup_pincode = COALESCE(
  (pickup_address::jsonb ->> 'postal_code'),
  (regexp_match(pickup_address, '\d{6}'))[1]
)
WHERE pickup_pincode IS NULL
  AND pickup_address IS NOT NULL
  AND (
    pickup_address ~ '^\s*[\{\[]'  -- looks like JSON
    OR pickup_address ~ '\d{6}'    -- has a 6-digit run somewhere
  );

-- ============================================================
-- Migration 36: Laundry registration — banking step + revised document set
--
-- 1. laundry_profiles already has bank_account_number, bank_ifsc_code,
--    bank_account_holder_name (01-create-tables.sql) and bank_account_type
--    (22-payouts.sql), but never bank_name — added here to match the new
--    dedicated Banking step in the laundry registration wizard.
-- 2. The document set itself (selfie_inside_laundry, identity_proof,
--    address_proof, bank_proof, tax_registration, trade_license,
--    environmental_permit, facility_photos) needs no schema change —
--    provider_documents.doc_key is a free-form VARCHAR, so the new keys
--    just flow through the existing upload/review pipeline.
-- ============================================================

ALTER TABLE laundry_profiles
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100);

-- ============================================================
-- Migration 37: Record actual delivery completion timestamp
--
-- orders.delivery_date is a DATE only, and gets overwritten to
-- CURRENT_DATE when the order goes out_for_delivery (see status/route.ts) —
-- it was never the "delivered at" moment, so order detail pages had no
-- field to show once an order was actually completed. Added here and set
-- in delivery/orders/[id]/verify-otp/route.ts when status -> 'delivered'.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;


-- ============================================================
-- Migration 38: Subscription checkout integrity — persist intent
--
-- verify/route.ts previously trusted the client-submitted plan_id/offer_id
-- to decide what to activate, with no link back to what checkout/route.ts
-- actually told the gateway to charge. A client could pay for a cheap
-- plan's gateway order, then call verify with a different (pricier)
-- plan_id and get it activated at the wrong price — and amount_paid was
-- always plan.monthly_price, ignoring any offer discount actually applied
-- at checkout. This table records exactly what checkout/route.ts created
-- the gateway order for; verify/route.ts now looks up by gateway_order_id
-- instead of trusting the request body.
-- ============================================================

CREATE TABLE IF NOT EXISTS laundry_subscription_checkout_intents (
  id                          SERIAL PRIMARY KEY,
  provider_id                 INTEGER NOT NULL REFERENCES laundry_profiles(id),
  plan_id                     INTEGER NOT NULL REFERENCES laundry_subscription_plans(id),
  offer_id                    INTEGER REFERENCES laundry_subscription_offers(id),
  amount                      NUMERIC(10,2) NOT NULL,
  commission_type_override    VARCHAR(10),
  commission_value_override   NUMERIC(10,2),
  gateway                     VARCHAR(20) NOT NULL,
  gateway_order_id            VARCHAR(100) NOT NULL UNIQUE,
  consumed_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_checkout_intents_gateway_order
  ON laundry_subscription_checkout_intents(gateway_order_id);

-- ============================================================
-- Migration 39: Support ticket auto-routing + group-scoped permissions
--
-- 1. Seeds the 5th support group ('Tier 2 - Technical', splitting the old
--    single Technical tier into Tier 2/Tier 3) — idempotent, since this
--    group already exists in some environments created ad-hoc via the
--    admin Support Agents page. The other 4 groups were already seeded by
--    scripts/25-support-auth.sql; re-inserting here is a no-op for them.
-- 2. No schema change needed for auto-assignment itself — category→group
--    routing lives in lib/support-routing.ts (resolved by group NAME, not
--    a stored mapping column) and simply populates the existing
--    support_tickets.assigned_group_id column at ticket-creation time.
-- 3. No schema change needed for the new group-scoped permission model
--    either — it's enforced in app code (lib/support-permissions.ts)
--    against the existing support_group_members table.
-- ============================================================

INSERT INTO support_groups (name, description) VALUES
  ('Tier 1 - General',   'First-line support for general queries, account issues, and basic order help'),
  ('Tier 2 - Billing',   'Payments, refunds, commissions, payout disputes'),
  ('Tier 2 - Technical', 'First-line technical support — app bugs, login issues, dashboard errors'),
  ('Tier 3 - Technical', 'Escalated technical issues — API problems, data integrity, complex bugs'),
  ('Operations',         'Delivery partner issues, laundry partner issues, SLA escalations')
ON CONFLICT (name) DO NOTHING;
