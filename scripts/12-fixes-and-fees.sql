-- ============================================================
-- 12-fixes-and-fees.sql
-- Run this in order — all changes are idempotent / safe to re-run.
-- ============================================================

-- ============================================================
-- PART 1: Fix the BIGSERIAL nullable FK bug
-- ============================================================
-- Root cause: BIGSERIAL creates an implicit sequence and sets it as the
-- column default. Even after DROP NOT NULL, INSERT still auto-fills the
-- column from the sequence instead of leaving it NULL.
-- Fix: set the default to NULL for every nullable FK that was declared BIGSERIAL.

-- orders table
ALTER TABLE orders ALTER COLUMN delivery_profile_id SET DEFAULT NULL;
ALTER TABLE orders ALTER COLUMN laundry_profile_id   SET DEFAULT NULL;

-- reviews table (same pattern)
ALTER TABLE reviews ALTER COLUMN laundry_profile_id  SET DEFAULT NULL;
ALTER TABLE reviews ALTER COLUMN delivery_profile_id SET DEFAULT NULL;

-- laundry_bags
ALTER TABLE laundry_bags ALTER COLUMN user_id               SET DEFAULT NULL;
ALTER TABLE laundry_bags ALTER COLUMN provider_id           SET DEFAULT NULL;
ALTER TABLE laundry_bags ALTER COLUMN delivery_profile_id   SET DEFAULT NULL;

-- bag_service_items — status is NOT NULL so leave it, but service_id is fine
-- bag_status_events — no nullable FKs with BIGSERIAL

-- order_status_history
ALTER TABLE order_status_history ALTER COLUMN updated_by    SET DEFAULT NULL;

-- coupon_redemptions
ALTER TABLE coupon_redemptions ALTER COLUMN order_id        SET DEFAULT NULL;

-- wallet_transactions
ALTER TABLE wallet_transactions ALTER COLUMN order_id       SET DEFAULT NULL;

-- payments
ALTER TABLE payments ALTER COLUMN order_id                  SET DEFAULT NULL; -- already BIGSERIAL NOT NULL, skip
-- (payments.order_id IS NOT NULL intentionally — a payment must belong to an order)

-- support_tickets
ALTER TABLE support_tickets ALTER COLUMN order_id           SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN assigned_to        SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN wallet_transaction_id SET DEFAULT NULL;

-- support_ticket_comments / attachments / status_history
ALTER TABLE support_ticket_attachments ALTER COLUMN uploaded_by    SET DEFAULT NULL;
ALTER TABLE support_ticket_status_history ALTER COLUMN updated_by  SET DEFAULT NULL;

-- promotion tables
ALTER TABLE promotions ALTER COLUMN created_by              SET DEFAULT NULL;
ALTER TABLE promotion_redemptions ALTER COLUMN order_id     SET DEFAULT NULL;
ALTER TABLE order_promotions ALTER COLUMN order_id          SET DEFAULT NULL;
ALTER TABLE promotion_unique_codes ALTER COLUMN assigned_to_user_id SET DEFAULT NULL;

-- laundry_status_history
ALTER TABLE laundry_status_history ALTER COLUMN changed_by  SET DEFAULT NULL;

-- ============================================================
-- PART 2: Delivery assignment architecture
-- ============================================================
-- Delivery partners are NOT assigned at order creation time.
-- Assignment happens asynchronously via one of:
--   A) Admin manually assigns from the admin console
--   B) System auto-assigns based on availability/proximity (future)
--   C) Delivery partner self-claims available orders (future)
--
-- We add a dedicated status + assignment tracking table.

-- 2a. Add assignment tracking columns to orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(30) NOT NULL DEFAULT 'unassigned'
    CHECK (assignment_status IN ('unassigned','auto_assigned','manually_assigned','self_claimed','reassigned')),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assignment_notes TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_assignment_status ON orders(assignment_status)
  WHERE assignment_status = 'unassigned';

-- 2b. Delivery assignment events log (full audit trail)
CREATE TABLE IF NOT EXISTS order_delivery_assignments (
  id              SERIAL PRIMARY KEY,
  order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_profile_id BIGINT REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  assigned_by     BIGINT REFERENCES users(id) ON DELETE SET NULL, -- NULL = auto-assigned
  assignment_type VARCHAR(30) NOT NULL
    CHECK (assignment_type IN ('auto','manual','self_claim','reassign','release')),
  reason          TEXT,
  -- For auto-assignment: snapshot of why this partner was chosen
  selection_meta  JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_delivery_assignments_order ON order_delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_assignments_profile ON order_delivery_assignments(delivery_profile_id);

-- 2c. Function: auto-assign delivery partner for an order
-- Logic:
--   1. Order must be 'confirmed' and 'unassigned'
--   2. Find delivery partners who:
--      a. Are active + verified + on_duty or online
--      b. Cover the pickup area (delivery_profile_service_zones or city match)
--      c. Have availability window covering the pickup time slot
--      d. Have the lowest current active order count (load balancing)
--      e. For express: prioritize on_duty partners first
--   3. Assign the best match, log the assignment event
--
-- Returns: the assigned delivery_profile_id, or NULL if none available

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
  v_active_count      INT;
BEGIN
  -- Load order details
  SELECT o.id, o.pickup_date, o.pickup_time_slot, o.is_express,
         o.assignment_status, o.status,
         -- Extract city from pickup_address JSON
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

  -- Parse pickup time slot (format: "HH:MM-HH:MM")
  v_pickup_date := v_order.pickup_date;
  v_pickup_day  := EXTRACT(DOW FROM v_pickup_date)::SMALLINT;
  BEGIN
    v_pickup_slot_start := (split_part(v_order.pickup_time_slot, '-', 1))::TIME;
  EXCEPTION WHEN OTHERS THEN
    v_pickup_slot_start := '09:00'::TIME; -- fallback
  END;

  -- Find best available delivery partner
  SELECT dp.id INTO v_best_profile_id
  FROM delivery_profiles dp
  JOIN users u ON u.id = dp.user_id
  -- Must be active and available
  WHERE dp.status = 'active'
    AND dp.is_verified = TRUE
    AND u.status = 'active'
    AND (dp.shift_status IN ('on_duty','off_duty') OR dp.is_online = TRUE)
    -- Must have availability on pickup day covering the slot
    AND EXISTS (
      SELECT 1 FROM delivery_availability da
      WHERE da.delivery_profile_id = dp.id
        AND da.day_of_week = v_pickup_day
        AND da.start_time <= v_pickup_slot_start
        AND da.end_time   >= v_pickup_slot_start
        AND (da.effective_from IS NULL OR da.effective_from <= v_pickup_date)
        AND (da.effective_to   IS NULL OR da.effective_to   >= v_pickup_date)
    )
    -- Must serve the pickup area
    AND (
      -- Via service zones
      EXISTS (
        SELECT 1
        FROM delivery_profile_service_zones dpsz
        JOIN service_zones sz ON sz.id = dpsz.service_zone_id
        WHERE dpsz.delivery_profile_id = dp.id
        -- Shape-based check (app-side geofencing is complex;
        -- for postal code shapes we do a simple JSON match)
        AND (sz.shape->>'postal_code' = v_order.pickup_postal
             OR sz.shape->>'city' ILIKE v_order.pickup_city)
      )
      -- Fallback: no zones configured for this partner → available everywhere
      OR NOT EXISTS (
        SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id
      )
    )
  -- Load balance: sort by current active order count ASC, then on_duty partners first
  ORDER BY
    (SELECT COUNT(*) FROM orders o2
     WHERE o2.delivery_profile_id = dp.id
       AND o2.status NOT IN ('delivered','cancelled','completed','returned')
    ) ASC,
    CASE WHEN dp.shift_status = 'on_duty' THEN 0 ELSE 1 END ASC,
    dp.rating DESC
  LIMIT 1;

  IF v_best_profile_id IS NULL THEN
    RETURN NULL; -- No partner available right now
  END IF;

  -- Assign the order
  UPDATE orders
  SET delivery_profile_id = v_best_profile_id,
      assignment_status   = 'auto_assigned',
      assigned_at         = NOW(),
      updated_at          = NOW()
  WHERE id = p_order_id;

  -- Log the assignment event
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

-- 2d. Function: manually assign or reassign delivery partner (admin action)
CREATE OR REPLACE FUNCTION assign_delivery_partner_manual(
  p_order_id          BIGINT,
  p_delivery_profile_id BIGINT,
  p_admin_user_id     BIGINT,
  p_reason            TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_prev_profile_id BIGINT;
  v_assignment_type VARCHAR(30);
BEGIN
  SELECT delivery_profile_id INTO v_prev_profile_id
  FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  v_assignment_type := CASE
    WHEN v_prev_profile_id IS NULL THEN 'manual'
    ELSE 'reassign'
  END;

  UPDATE orders
  SET delivery_profile_id = p_delivery_profile_id,
      assignment_status   = 'manually_assigned',
      assigned_at         = NOW(),
      assignment_notes    = p_reason,
      updated_at          = NOW()
  WHERE id = p_order_id;

  INSERT INTO order_delivery_assignments (
    order_id, delivery_profile_id, assigned_by, assignment_type, reason
  ) VALUES (
    p_order_id, p_delivery_profile_id, p_admin_user_id, v_assignment_type, p_reason
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 3: order_fee_config — admin-managed dynamic fees
-- ============================================================

CREATE TABLE IF NOT EXISTS order_fee_config (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(50) NOT NULL UNIQUE,     -- e.g. 'delivery_fee','convenience_fee','express_surcharge'
  display_name  VARCHAR(100) NOT NULL,
  description   TEXT,
  -- Charge model
  charge_type   VARCHAR(10) NOT NULL CHECK (charge_type IN ('flat','percent')),
  value         NUMERIC(10,2) NOT NULL CHECK (value >= 0),
  max_amount    NUMERIC(10,2) CHECK (max_amount IS NULL OR max_amount >= 0),
  -- What the percent applies to
  applies_to    VARCHAR(20) NOT NULL DEFAULT 'subtotal'
                  CHECK (applies_to IN ('subtotal','total','fixed')),
  -- Free delivery config (for delivery_fee code only)
  free_above_amount   NUMERIC(10,2),   -- NULL = never free based on amount
  free_within_km      NUMERIC(6,2),    -- NULL = distance not checked
  -- Display config
  sort_order    SMALLINT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  -- Audit
  updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_fee_config_active ON order_fee_config(is_active);

DROP TRIGGER IF EXISTS trg_order_fee_config_updated_at ON order_fee_config;
CREATE TRIGGER trg_order_fee_config_updated_at
  BEFORE UPDATE ON order_fee_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default fees (safe to run multiple times)
INSERT INTO order_fee_config (code, display_name, description, charge_type, value, max_amount, applies_to, free_above_amount, free_within_km, sort_order)
VALUES
  ('delivery_fee',     'Delivery Fee',       'Pickup & delivery charges',         'flat',    50.00, NULL, 'fixed',    500.00, 5.0,  10),
  ('convenience_fee',  'Convenience Fee',    'Platform convenience charge',        'percent',  2.00, 30.00,'subtotal', NULL,   NULL, 20),
  ('express_surcharge','Express Surcharge',  'Additional charge for express orders','percent', 50.00, NULL,'subtotal', NULL,   NULL, 30)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- PART 4: Cart enhancements — add provider_id + address_id
-- ============================================================

ALTER TABLE shopping_carts
  ADD COLUMN IF NOT EXISTS provider_id  BIGINT REFERENCES laundry_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS address_id   INT    REFERENCES customer_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pickup_date       DATE,
  ADD COLUMN IF NOT EXISTS pickup_time_slot VARCHAR(20),
  ADD COLUMN IF NOT EXISTS current_step     SMALLINT DEFAULT 1;

-- Set defaults to NULL for these (they were BIGSERIAL)
ALTER TABLE shopping_carts ALTER COLUMN provider_id SET DEFAULT NULL;
ALTER TABLE shopping_carts ALTER COLUMN address_id  SET DEFAULT NULL;

-- ============================================================
-- PART 5: Helper function — calculate order fees from config
-- ============================================================
-- Returns a JSON array of fee rows to be applied to an order.
-- Call this from application code to get all active fees.

CREATE OR REPLACE FUNCTION calculate_order_fees(
  p_subtotal     NUMERIC,
  p_is_express   BOOLEAN DEFAULT FALSE,
  p_distance_km  NUMERIC DEFAULT NULL,  -- NULL = distance check skipped
  p_provider_id  BIGINT  DEFAULT NULL   -- reserved for future provider-specific overrides
)
RETURNS JSONB AS $$
DECLARE
  v_fee       RECORD;
  v_amount    NUMERIC(10,2);
  v_fees      JSONB := '[]'::jsonb;
BEGIN
  FOR v_fee IN
    SELECT * FROM order_fee_config
    WHERE is_active = TRUE
    ORDER BY sort_order
  LOOP
    -- Skip express_surcharge if not express
    IF v_fee.code = 'express_surcharge' AND NOT p_is_express THEN
      CONTINUE;
    END IF;

    -- Calculate amount
    IF v_fee.charge_type = 'flat' OR v_fee.applies_to = 'fixed' THEN
      v_amount := v_fee.value;
    ELSIF v_fee.charge_type = 'percent' THEN
      IF v_fee.applies_to = 'subtotal' THEN
        v_amount := ROUND(p_subtotal * v_fee.value / 100.0, 2);
      ELSE
        -- 'total' — requires running total; approximated as subtotal for now
        v_amount := ROUND(p_subtotal * v_fee.value / 100.0, 2);
      END IF;
    END IF;

    -- Apply max cap
    IF v_fee.max_amount IS NOT NULL THEN
      v_amount := LEAST(v_amount, v_fee.max_amount);
    END IF;

    -- Free delivery checks
    IF v_fee.code = 'delivery_fee' THEN
      IF v_fee.free_above_amount IS NOT NULL AND p_subtotal >= v_fee.free_above_amount THEN
        v_amount := 0;
      END IF;
      IF v_fee.free_within_km IS NOT NULL AND p_distance_km IS NOT NULL
         AND p_distance_km <= v_fee.free_within_km THEN
        v_amount := 0;
      END IF;
    END IF;

    v_fees := v_fees || jsonb_build_object(
      'code',         v_fee.code,
      'display_name', v_fee.display_name,
      'charge_type',  v_fee.charge_type,
      'amount',       v_amount,
      'is_free',      (v_amount = 0)
    );
  END LOOP;

  RETURN v_fees;
END;
$$ LANGUAGE plpgsql STABLE;

-- Manually created via SQL Editor in NeonDB but not in use, why?
-- In 13th script file we are making it ledger-driven computed balance
CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id BIGINT)
  RETURNS NUMERIC
  LANGUAGE plpgsql
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  SELECT wa.balance
    INTO v_balance
  FROM wallet_accounts wa
  WHERE wa.user_id = p_user_id;
  RETURN v_balance;
END;
$$;