-- Bug: auto_assign_delivery_partner() was assigning orders to delivery
-- partners who don't serve the pickup postal code at all — e.g. a Chennai
-- order got auto-assigned to a Pune-based partner.
--
-- Root cause: the eligibility check treated "no delivery_profile_service_zones
-- rows for this partner" as "this partner serves everywhere":
--
--   AND (
--     EXISTS (... zone matches pickup postal/city ...)
--     OR NOT EXISTS (SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id)
--   )
--
-- The service_zones feature has zero rows in delivery_profile_service_zones
-- across the whole platform today — every partner instead records their area
-- via delivery_profiles.pincode / delivery_profiles.city (set during
-- onboarding). So the "OR NOT EXISTS" branch was true for 100% of partners,
-- making the postal-code filter a complete no-op.
--
-- Fix: when a partner has no service zones configured, fall back to a real
-- pincode/city match instead of matching unconditionally. Partners with
-- explicit service zones configured still match against those (unchanged —
-- lets the existing admin service-zone feature keep working once adopted).
-- Everything else about the function (availability window check, load
-- balancing, pincode/city preference ordering, fallback to
-- 'pending_acceptance' when nobody matches) is unchanged.

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
    AND (dp.shift_status = 'on_duty' OR dp.is_online = TRUE)
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
      -- Partner has explicit service zones configured — must match one.
      EXISTS (
        SELECT 1
        FROM delivery_profile_service_zones dpsz
        JOIN service_zones sz ON sz.id = dpsz.service_zone_id
        WHERE dpsz.delivery_profile_id = dp.id
        AND (sz.shape->>'postal_code' = v_order.pickup_postal
             OR sz.shape->>'city' ILIKE v_order.pickup_city)
      )
      -- No service zones configured — require a genuine pincode/city match
      -- against the partner's registered area instead of matching everyone.
      OR (
        NOT EXISTS (SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id)
        AND (dp.pincode = v_order.pickup_postal OR dp.city ILIKE v_order.pickup_city)
      )
    )
  ORDER BY
    -- Fewest active orders first (load balancing)
    (SELECT COUNT(*) FROM orders o2
     WHERE o2.delivery_profile_id = dp.id
       AND o2.status NOT IN ('delivered','cancelled','completed','returned')
    ) ASC,
    -- Prefer partners registered in the exact pickup pincode over a city-only match
    CASE WHEN dp.pincode IS NOT NULL AND dp.pincode = v_order.pickup_postal THEN 0
         WHEN dp.city    IS NOT NULL AND dp.city ILIKE v_order.pickup_city  THEN 1
         ELSE 2 END ASC,
    CASE WHEN dp.shift_status = 'on_duty' THEN 0 ELSE 1 END ASC,
    dp.rating DESC
  LIMIT 1;

  IF v_best_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE orders
  SET delivery_profile_id = v_best_profile_id,
      assignment_status   = 'auto_assigned',
      -- Align with the self-accept path: the pickup OTP flow requires
      -- status = 'assigned_for_pickup', so auto-assigned orders must reach
      -- the same state or the partner can never start the pickup.
      status              = 'assigned_for_pickup',
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
      'is_express',    v_order.is_express,
      'trigger',       'laundry_confirmation'
    )
  );

  RETURN v_best_profile_id;
END;
$$ LANGUAGE plpgsql;

-- Reworks item-protection claims from a single support-review step into the
-- full multi-stage chain:
--
--   submitted ──(laundry approves w/ mandatory comment)──▶ provider_approved
--             ──(laundry rejects  w/ mandatory comment)──▶ provider_rejected  (final)
--   provider_approved ──(ops-lead issues amount ≤ cap)──▶ amount_issued
--   amount_issued ──(admin approves)──▶ paid   (wallet credited, closed)
--                 ──(admin rejects)───▶ provider_approved  (bounced back to
--                                       support with a note to re-issue)
--
-- Escalation: if the provider hasn't decided within
-- item_protection_policy.provider_response_hours (default 72), an Operations
-- lead may decide on the provider's behalf (tracked via decided_via_escalation).
--
-- Lost-in-transit: when approving a 'lost' claim the provider can flag that
-- the garment was lost in transit — this increments a running counter on the
-- assigned delivery partner's profile (visibility for admin only; no payout
-- liability for the partner).

-- ── 1. New workflow statuses ─────────────────────────────────────────────────
-- Legacy values ('under_review', 'approved') stay valid so old rows keep
-- passing the constraint; new claims never enter them.

ALTER TABLE garment_claims DROP CONSTRAINT IF EXISTS garment_claims_status_check;
ALTER TABLE garment_claims ADD CONSTRAINT garment_claims_status_check
  CHECK (status IN (
    'submitted', 'under_review', 'approved',          -- legacy
    'provider_approved', 'provider_rejected',         -- laundry decision
    'amount_issued',                                   -- ops-lead issued amount
    'paid', 'rejected'                                 -- terminal
  ));

-- The "one open claim per item" guard must cover the new in-flight statuses,
-- or a customer could file a second claim while the first is mid-pipeline.
DROP INDEX IF EXISTS uq_garment_claims_open_item;
CREATE UNIQUE INDEX uq_garment_claims_open_item
  ON garment_claims (order_item_id)
  WHERE status IN ('submitted', 'under_review', 'provider_approved', 'amount_issued');

-- ── 2. Stage-tracking columns ────────────────────────────────────────────────

ALTER TABLE garment_claims
  ADD COLUMN IF NOT EXISTS provider_comment       TEXT,
  ADD COLUMN IF NOT EXISTS provider_decided_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_decided_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_via_escalation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lost_in_transit        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS issued_by              BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_at              TIMESTAMPTZ;
-- Admin's final decision reuses the existing decided_by / decided_at /
-- decision_note columns; compensation_amount holds the issued amount.

-- ── 3. Provider response window (escalation threshold) ──────────────────────

ALTER TABLE item_protection_policy
  ADD COLUMN IF NOT EXISTS provider_response_hours INTEGER NOT NULL DEFAULT 72
    CHECK (provider_response_hours > 0);

-- ── 4. Support in-app notifications ──────────────────────────────────────────
-- Mirrors laundry_notifications, but targeted per support user (rows are
-- fanned out to each Operations lead at event time — the group is small).

CREATE TABLE IF NOT EXISTS support_notifications (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT         NOT NULL,           -- 'claim_provider_approved' | 'claim_bounced' | future types
  title       TEXT         NOT NULL,
  body        TEXT         NOT NULL,
  claim_id    BIGINT       REFERENCES garment_claims(id) ON DELETE SET NULL,
  is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_notifications_user_unread
  ON support_notifications (user_id, is_read, created_at DESC);

-- ── 5. Lost-in-transit flag counter on delivery partners ────────────────────

ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS lost_in_transit_flags INTEGER NOT NULL DEFAULT 0
    CHECK (lost_in_transit_flags >= 0);

-- recalc_order_totals() is the DB-side source of truth for orders.subtotal /
-- total_amount — it fires from triggers on order_item_services (insert/
-- update/delete), order_adjustments (insert/update/delete), and on
-- tax_amount/discount_amount updates. Its old formula had three bugs that
-- fought every app-side computation:
--
--   1. subtotal counted ALL items — including ones marked 'not_picked_up'
--      by the delivery partner at pickup, so removals never reduced totals.
--   2. total added tax_amount on top of the adjustments sum, but GST already
--      lives in adjustments as a fee row (metadata.fee_code = 'gst') —
--      double-counting tax.
--   3. total subtracted discount_amount on top of the adjustments sum, but a
--      coupon already lives in adjustments as a negative row —
--      double-counting the discount.
--
-- New canonical formula (matches app/api/customer/orders/create exactly):
--   subtotal = SUM(line_total) of items not marked 'not_picked_up'
--   total    = GREATEST(0, subtotal + SUM(adjustments))
--              (fee rows are positive and include GST; coupon rows are negative)
--   tax_amount is kept in sync from the GST fee row(s) for invoice display.

CREATE OR REPLACE FUNCTION recalc_order_totals(p_order_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_subtotal    DECIMAL(10,2);
  v_adjustments DECIMAL(10,2);
  v_tax         DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(ois.line_total), 0) INTO v_subtotal
  FROM order_item_services ois
  JOIN order_items oi ON oi.id = ois.order_item_id
  WHERE oi.order_id = p_order_id
    AND oi.status IS DISTINCT FROM 'not_picked_up';

  SELECT COALESCE(SUM(amount), 0) INTO v_adjustments
  FROM order_adjustments WHERE order_id = p_order_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_tax
  FROM order_adjustments
  WHERE order_id = p_order_id AND metadata->>'fee_code' = 'gst';

  UPDATE orders
     SET subtotal     = v_subtotal,
         tax_amount   = v_tax,
         total_amount = GREATEST(0, v_subtotal + COALESCE(v_adjustments, 0)),
         updated_at   = NOW()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- The tax/discount-update trigger would now recurse pointlessly (the recalc
-- itself writes tax_amount) — restrict it to discount changes only, which
-- the recalc never writes.
CREATE OR REPLACE FUNCTION recalc_order_totals_on_order_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    PERFORM recalc_order_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_recalc_totals ON orders;
CREATE TRIGGER trg_orders_recalc_totals
AFTER UPDATE OF discount_amount ON orders
FOR EACH ROW
EXECUTE FUNCTION recalc_order_totals_on_order_update();

-- Splits an order's delivery work into TWO independent jobs ("legs"):
--
--   pickup   — collect from the customer, drop at the laundry.
--              Completed the moment the bag is dropped at the laundry;
--              counts as one successful pickup for that partner.
--   delivery — collect from the laundry, deliver to the customer.
--              Assigned FRESH when the provider marks the order
--              ready_for_delivery — same auto-assignment rules as pickup
--              (availability, service area, load, rating), with a preference
--              boost for the partner who did the pickup leg. If nobody
--              matches, the leg goes to the pending_acceptance pool where
--              any eligible partner can self-accept it.
--   return   — reserved for failed-delivery returns (wired later).
--
-- orders.delivery_profile_id keeps meaning "partner of the currently active
-- leg" so every existing join/notification/OTP flow stays correct during the
-- transition; order_delivery_legs is the per-leg source of truth for
-- attribution (payouts, COD ledger, history).

-- ── 1. Legs table ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_delivery_legs (
  id                   BIGSERIAL   PRIMARY KEY,
  order_id             BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  leg_type             VARCHAR(10) NOT NULL CHECK (leg_type IN ('pickup', 'delivery', 'return')),
  delivery_profile_id  BIGINT      REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  status               VARCHAR(30) NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'pending_acceptance', 'assigned', 'in_progress', 'completed', 'cancelled')),
  assignment_type      VARCHAR(20) CHECK (assignment_type IS NULL OR assignment_type IN ('auto', 'self_accept', 'admin')),
  assigned_at          TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,   -- partner heads out (out_for_pickup / out_for_delivery)
  completed_at         TIMESTAMPTZ,   -- bag dropped at laundry / delivered to customer
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, leg_type)
);

CREATE INDEX IF NOT EXISTS idx_odl_partner_status
  ON order_delivery_legs (delivery_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_odl_pool
  ON order_delivery_legs (leg_type, created_at)
  WHERE status = 'pending_acceptance';
CREATE INDEX IF NOT EXISTS idx_odl_order
  ON order_delivery_legs (order_id);

-- ── 2. Backfill legs from current order states ───────────────────────────────

-- Pickup legs
INSERT INTO order_delivery_legs (order_id, leg_type, delivery_profile_id, status, assignment_type, assigned_at, started_at, completed_at)
SELECT
  o.id, 'pickup', o.delivery_profile_id,
  CASE
    WHEN o.status = 'assigned_for_pickup'                                   THEN 'assigned'
    WHEN o.status IN ('out_for_pickup', 'picked_up')                        THEN 'in_progress'
    WHEN o.status IN ('at_laundry', 'processing', 'ready_for_delivery',
                      'out_for_delivery', 'delivered', 'completed')         THEN 'completed'
    WHEN o.status = 'confirmed' AND o.assignment_status = 'pending_acceptance' THEN 'pending_acceptance'
    ELSE NULL
  END,
  CASE o.assignment_status
    WHEN 'auto_assigned' THEN 'auto'
    WHEN 'assigned'      THEN 'self_accept'
    ELSE NULL
  END,
  o.assigned_at,
  CASE WHEN o.status IN ('out_for_pickup', 'picked_up') THEN o.updated_at ELSE NULL END,
  CASE WHEN o.status IN ('at_laundry', 'processing', 'ready_for_delivery',
                         'out_for_delivery', 'delivered', 'completed') THEN o.updated_at ELSE NULL END
FROM orders o
WHERE (
  (o.delivery_profile_id IS NOT NULL
   AND o.status IN ('assigned_for_pickup', 'out_for_pickup', 'picked_up', 'at_laundry',
                    'processing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'))
  OR (o.status = 'confirmed' AND o.assignment_status = 'pending_acceptance')
)
ON CONFLICT (order_id, leg_type) DO NOTHING;

-- Delivery legs (old model kept the same partner for the whole journey)
INSERT INTO order_delivery_legs (order_id, leg_type, delivery_profile_id, status, assignment_type, assigned_at, started_at, completed_at)
SELECT
  o.id, 'delivery', o.delivery_profile_id,
  CASE
    WHEN o.status = 'ready_for_delivery'          THEN 'assigned'
    WHEN o.status = 'out_for_delivery'            THEN 'in_progress'
    WHEN o.status IN ('delivered', 'completed')   THEN 'completed'
  END,
  'auto',
  o.assigned_at,
  CASE WHEN o.status = 'out_for_delivery' THEN o.updated_at ELSE NULL END,
  o.delivered_at
FROM orders o
WHERE o.delivery_profile_id IS NOT NULL
  AND o.status IN ('ready_for_delivery', 'out_for_delivery', 'delivered', 'completed')
ON CONFLICT (order_id, leg_type) DO NOTHING;

-- ── 3. Leg-aware auto-assignment ──────────────────────────────────────────────
-- Same eligibility rules for both legs (active/verified/on-duty, availability
-- window, genuine service-area match — see migration 38). Ordering for the
-- delivery leg prefers the partner who completed this order's pickup leg.

DROP FUNCTION IF EXISTS auto_assign_delivery_partner(BIGINT);

CREATE OR REPLACE FUNCTION auto_assign_delivery_partner(
  p_order_id BIGINT,
  p_leg_type VARCHAR DEFAULT 'pickup'
)
RETURNS BIGINT AS $$
DECLARE
  v_order             RECORD;
  v_target_date       DATE;
  v_target_day        SMALLINT;
  v_slot_start        TIME;
  v_best_profile_id   BIGINT;
  v_pickup_partner_id BIGINT;
BEGIN
  IF p_leg_type NOT IN ('pickup', 'delivery') THEN
    RAISE EXCEPTION 'Unsupported leg type %', p_leg_type;
  END IF;

  SELECT o.id, o.order_number, o.pickup_date, o.pickup_time_slot,
         o.delivery_date, o.delivery_time_slot, o.is_express,
         o.assignment_status, o.status,
         (o.pickup_address::jsonb ->> 'city') AS pickup_city,
         (o.pickup_address::jsonb ->> 'postal_code') AS pickup_postal
  INTO v_order
  FROM orders o
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Leg-level guard: never double-assign a leg.
  IF EXISTS (
    SELECT 1 FROM order_delivery_legs
    WHERE order_id = p_order_id AND leg_type = p_leg_type
      AND status IN ('assigned', 'in_progress', 'completed')
  ) THEN
    RAISE EXCEPTION 'Order % already has an active % leg', p_order_id, p_leg_type;
  END IF;

  -- Order-level guard kept for the pickup leg (same as before this migration).
  IF p_leg_type = 'pickup' AND v_order.assignment_status <> 'unassigned' THEN
    RAISE EXCEPTION 'Order % is already assigned', p_order_id;
  END IF;

  -- The delivery leg targets the delivery date/slot when set; both legs fall
  -- back to the pickup schedule (delivery slots are often unset until later).
  IF p_leg_type = 'delivery' AND v_order.delivery_date IS NOT NULL THEN
    v_target_date := v_order.delivery_date;
  ELSE
    v_target_date := COALESCE(v_order.pickup_date, CURRENT_DATE);
  END IF;
  v_target_day := EXTRACT(DOW FROM v_target_date)::SMALLINT;
  BEGIN
    v_slot_start := (split_part(
      CASE WHEN p_leg_type = 'delivery' AND v_order.delivery_time_slot IS NOT NULL
           THEN v_order.delivery_time_slot ELSE v_order.pickup_time_slot END,
      '-', 1))::TIME;
  EXCEPTION WHEN OTHERS THEN
    v_slot_start := '09:00'::TIME;
  END;

  -- Who did the pickup leg (for the same-partner preference boost)?
  SELECT delivery_profile_id INTO v_pickup_partner_id
  FROM order_delivery_legs
  WHERE order_id = p_order_id AND leg_type = 'pickup' AND status = 'completed';

  SELECT dp.id INTO v_best_profile_id
  FROM delivery_profiles dp
  JOIN users u ON u.id = dp.user_id
  WHERE dp.status = 'active'
    AND dp.is_verified = TRUE
    AND u.status = 'active'
    AND (dp.shift_status = 'on_duty' OR dp.is_online = TRUE)
    AND NOT EXISTS (
      SELECT 1 FROM delivery_leaves dl
      WHERE dl.delivery_profile_id = dp.id
        AND dl.date = v_target_date AND dl.status = 'approved'
    )
    AND (
      EXISTS (
        SELECT 1 FROM delivery_availability da
        WHERE da.delivery_profile_id = dp.id
          AND da.day_of_week = v_target_day
          AND da.start_time <= v_slot_start
          AND da.end_time   >= v_slot_start
          AND (da.effective_from IS NULL OR da.effective_from <= v_target_date)
          AND (da.effective_to   IS NULL OR da.effective_to   >= v_target_date)
      )
      OR NOT EXISTS (
        SELECT 1 FROM delivery_availability WHERE delivery_profile_id = dp.id
      )
    )
    AND (
      -- Partner has explicit service zones configured — must match one.
      EXISTS (
        SELECT 1
        FROM delivery_profile_service_zones dpsz
        JOIN service_zones sz ON sz.id = dpsz.service_zone_id
        WHERE dpsz.delivery_profile_id = dp.id
        AND (sz.shape->>'postal_code' = v_order.pickup_postal
             OR sz.shape->>'city' ILIKE v_order.pickup_city)
      )
      -- No service zones configured — require a genuine pincode/city match.
      OR (
        NOT EXISTS (SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id)
        AND (dp.pincode = v_order.pickup_postal OR dp.city ILIKE v_order.pickup_city)
      )
    )
  ORDER BY
    -- Familiarity first: the partner who already did this order's pickup
    CASE WHEN p_leg_type = 'delivery' AND dp.id = v_pickup_partner_id THEN 0 ELSE 1 END ASC,
    -- Fewest active legs first (load balancing)
    (SELECT COUNT(*) FROM order_delivery_legs l2
     WHERE l2.delivery_profile_id = dp.id
       AND l2.status IN ('assigned', 'in_progress')
    ) ASC,
    -- Prefer partners registered in the exact pickup pincode over a city match
    CASE WHEN dp.pincode IS NOT NULL AND dp.pincode = v_order.pickup_postal THEN 0
         WHEN dp.city    IS NOT NULL AND dp.city ILIKE v_order.pickup_city  THEN 1
         ELSE 2 END ASC,
    CASE WHEN dp.shift_status = 'on_duty' THEN 0 ELSE 1 END ASC,
    dp.rating DESC
  LIMIT 1;

  IF v_best_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Record the leg (upsert over an unassigned/cancelled/pooled placeholder).
  INSERT INTO order_delivery_legs (order_id, leg_type, delivery_profile_id, status, assignment_type, assigned_at)
  VALUES (p_order_id, p_leg_type, v_best_profile_id, 'assigned', 'auto', NOW())
  ON CONFLICT (order_id, leg_type) DO UPDATE
    SET delivery_profile_id = EXCLUDED.delivery_profile_id,
        status              = 'assigned',
        assignment_type     = 'auto',
        assigned_at         = NOW(),
        updated_at          = NOW();

  IF p_leg_type = 'pickup' THEN
    UPDATE orders
    SET delivery_profile_id = v_best_profile_id,
        assignment_status   = 'auto_assigned',
        -- The pickup OTP flow requires status = 'assigned_for_pickup'.
        status              = 'assigned_for_pickup',
        assigned_at         = NOW(),
        updated_at          = NOW()
    WHERE id = p_order_id;
  ELSE
    -- Delivery leg: point the order at the new partner (OTP/status routes key
    -- off delivery_profile_id) but leave orders.status = 'ready_for_delivery'.
    UPDATE orders
    SET delivery_profile_id = v_best_profile_id,
        assignment_status   = 'auto_assigned',
        assigned_at         = NOW(),
        updated_at          = NOW()
    WHERE id = p_order_id;

    -- Delivery-leg notification is inserted here with the right wording (the
    -- generic assignment trigger skips ready_for_delivery — see below).
    INSERT INTO delivery_notifications (delivery_profile_id, type, title, body, order_id)
    VALUES (
      v_best_profile_id,
      'order_ready',
      'New delivery assigned',
      'Order ' || COALESCE(v_order.order_number, '#' || p_order_id) ||
      ' is ready — collect it from the laundry and deliver to the customer.',
      p_order_id
    );
  END IF;

  INSERT INTO order_delivery_assignments (
    order_id, delivery_profile_id, assigned_by, assignment_type, selection_meta
  ) VALUES (
    p_order_id, v_best_profile_id, NULL, 'auto',
    jsonb_build_object(
      'leg_type',      p_leg_type,
      'pickup_city',   v_order.pickup_city,
      'pickup_postal', v_order.pickup_postal,
      'target_day',    v_target_day,
      'is_express',    v_order.is_express,
      'trigger',       CASE WHEN p_leg_type = 'pickup' THEN 'laundry_confirmation' ELSE 'ready_for_delivery' END
    )
  );

  RETURN v_best_profile_id;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Assignment trigger: pickup-stage only ──────────────────────────────────
-- Delivery-leg assignments write their own correctly-worded notification (in
-- the function above and the app-side accept/admin paths), so the generic
-- "assigned to you for pickup" trigger must not also fire for them.

CREATE OR REPLACE FUNCTION notify_delivery_order_assigned()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('ready_for_delivery', 'out_for_delivery') THEN
    RETURN NEW;  -- delivery-leg assignment; notification handled explicitly
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.delivery_profile_id IS NOT NULL)
     OR
     (TG_OP = 'UPDATE' AND NEW.delivery_profile_id IS NOT NULL
      AND (OLD.delivery_profile_id IS NULL OR OLD.delivery_profile_id <> NEW.delivery_profile_id))
  THEN
    INSERT INTO delivery_notifications (delivery_profile_id, type, title, body, order_id)
    VALUES (
      NEW.delivery_profile_id,
      'order_assigned',
      'New order assigned',
      'Order ' || COALESCE(NEW.order_number, '#' || NEW.id) ||
      ' has been assigned to you for pickup on ' || COALESCE(NEW.pickup_date::TEXT, 'TBD') || '.',
      NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;