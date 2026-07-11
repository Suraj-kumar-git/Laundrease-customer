-- 35-fix-delivery-notify-trigger.sql
-- 1) Fix: notify_admin_new_delivery() referenced NEW.full_name, but delivery_profiles
--    has no full_name column (it lives on users). This broke every INSERT into
--    delivery_profiles ("record \"new\" has no field \"full_name\"") — e.g. the
--    first onboarding step. Look the name up from users via NEW.user_id instead.
-- 2) Allow 'email_verification' purpose in otp_sessions (delivery registration
--    now verifies both phone and email with separate OTPs).

-- ── 1. otp_sessions: allow email_verification purpose ─────────────────────────
ALTER TABLE otp_sessions DROP CONSTRAINT IF EXISTS otp_sessions_purpose_check;
ALTER TABLE otp_sessions ADD CONSTRAINT otp_sessions_purpose_check
  CHECK (purpose IN ('phone_verification', 'email_verification', 'login'));

-- ── 2. Fix delivery admin-notification trigger ────────────────────────────────

CREATE OR REPLACE FUNCTION notify_admin_new_delivery()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  SELECT full_name INTO v_full_name FROM users WHERE id = NEW.user_id;

  INSERT INTO admin_notifications (type, title, body, entity_id)
  VALUES (
    'new_delivery_registration',
    'New delivery partner registered',
    COALESCE(v_full_name, 'A new delivery person') || ' has registered and is awaiting verification.',
    NEW.public_id::TEXT
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- Delivery partner in-app notifications
--               + auto-assign moved to laundry confirmation
-- ============================================================
-- 1. delivery_notifications table (mirrors laundry_notifications)
-- 2. Trigger: notify the partner whenever an order is assigned to
--    them (auto, self-accept, or admin manual — all set
--    orders.delivery_profile_id, so one trigger covers every path).
-- 3. auto_assign_delivery_partner(): small enhancement — partners
--    whose registered pincode matches the pickup postal code are
--    preferred over otherwise-equal candidates.
--    (The call site moved in code: it now runs when the LAUNDRY
--    CONFIRMS the order, not at order creation.)
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delivery_notifications (
  id                   BIGSERIAL    PRIMARY KEY,
  delivery_profile_id  BIGINT       NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  type                 TEXT         NOT NULL,           -- 'order_assigned' | future types
  title                TEXT         NOT NULL,
  body                 TEXT         NOT NULL,
  order_id             BIGINT       REFERENCES orders(id) ON DELETE SET NULL,
  is_read              BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_notifications_partner_unread
  ON delivery_notifications (delivery_profile_id, is_read, created_at DESC);

-- ── 2. Trigger: order assigned to partner ────────────────────

CREATE OR REPLACE FUNCTION notify_delivery_order_assigned()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Fire only when delivery_profile_id is first set or changes to a new partner
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

DROP TRIGGER IF EXISTS trg_delivery_order_assigned ON orders;
CREATE TRIGGER trg_delivery_order_assigned
  AFTER INSERT OR UPDATE OF delivery_profile_id ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_delivery_order_assigned();

-- ── 3. auto_assign_delivery_partner: pincode-proximity boost ─

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
    -- Fewest active orders first (load balancing)
    (SELECT COUNT(*) FROM orders o2
     WHERE o2.delivery_profile_id = dp.id
       AND o2.status NOT IN ('delivered','cancelled','completed','returned')
    ) ASC,
    -- ENHANCEMENT: prefer partners registered in the pickup pincode / city
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

-- ============================================================
--'out_for_pickup' order status
-- ============================================================
-- New lifecycle step between assignment and pickup:
--   assigned_for_pickup → out_for_pickup → picked_up
-- Set by the delivery partner when they head out to collect the
-- order from the customer. Customer is notified (SMS + email).
-- ============================================================

INSERT INTO order_statuses (code, description, sort_order, is_terminal) VALUES
  ('out_for_pickup', 'Delivery partner heading to customer for pickup', 27, FALSE)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE delivery_profiles ALTER COLUMN vehicle_type   DROP NOT NULL;
ALTER TABLE delivery_profiles ALTER COLUMN license_number DROP NOT NULL;

ALTER TABLE partner_monthly_payouts
  ADD COLUMN IF NOT EXISTS payslip_s3_key VARCHAR(500);

INSERT INTO order_statuses (code, description, sort_order, is_terminal) VALUES
  ('rejected', 'Order rejected by the laundry provider before confirmation', 3, TRUE)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE provider_payouts ADD COLUMN IF NOT EXISTS payslip_s3_key VARCHAR(500);

INSERT INTO platform_config (key, value, description) VALUES
  ('default_support_password', '"Support@123"', 'Default password assigned to newly created support agents — they must change it on first login')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
