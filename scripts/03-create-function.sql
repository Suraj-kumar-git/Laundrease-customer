-- **********************************************************************************
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Automatically set completed_at when bag hits 'completed'
CREATE OR REPLACE FUNCTION set_bag_completed_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.completed_at := COALESCE(NEW.completed_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Log status changes into the audit trail
CREATE OR REPLACE FUNCTION log_bag_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'UPDATE') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO bag_status_events (bag_id, status, note, occurred_at)
    VALUES (NEW.id, NEW.status, NULL, NOW());
  ELSIF (TG_OP = 'INSERT') THEN
    INSERT INTO bag_status_events (bag_id, status, note, occurred_at)
    VALUES (NEW.id, NEW.status, 'initial', NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Touch orders.updated_at on any update
CREATE OR REPLACE FUNCTION set_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Compute line_total for order_item_services based on unit_price and the parent item
--    If order_items.weight_kg IS NOT NULL then per-kg, else per-item quantity.
CREATE OR REPLACE FUNCTION compute_order_item_service_line_total()
RETURNS TRIGGER AS $$
DECLARE
  v_quantity INTEGER;
  v_weight DECIMAL(6,2);
  v_line DECIMAL(10,2);
BEGIN
  SELECT quantity, weight_kg INTO v_quantity, v_weight
  FROM order_items
  WHERE id = NEW.order_item_id;
  IF v_weight IS NOT NULL THEN
    v_line := COALESCE(NEW.unit_price, 0) * COALESCE(v_weight, 0);
  ELSE
    v_line := COALESCE(NEW.unit_price, 0) * COALESCE(v_quantity, 1);
  END IF;
  -- Apply express multiplier if applicable
  IF NEW.is_express AND NEW.express_multiplier IS NOT NULL THEN
    v_line := v_line * NEW.express_multiplier;
  END IF;
  NEW.line_total := v_line;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recompute dependent service totals when the parent item quantity/weight changes
CREATE OR REPLACE FUNCTION recompute_services_for_item()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE order_item_services
     SET unit_price = unit_price -- no change; triggers will recompute line_total
   WHERE order_item_id = NEW.id
   AND (OLD.quantity IS DISTINCT FROM NEW.quantity OR OLD.weight_kg IS DISTINCT FROM NEW.weight_kg);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- CART: Totals computation triggers
CREATE OR REPLACE FUNCTION set_cart_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Compute line_total for cart_item_services
CREATE OR REPLACE FUNCTION compute_cart_item_service_line_total()
RETURNS TRIGGER AS $$
DECLARE
  v_qty INTEGER;
  v_weight DECIMAL(6,2);
  v_line DECIMAL(10,2);
BEGIN
  SELECT quantity, weight_kg INTO v_qty, v_weight
  FROM cart_items WHERE id = NEW.cart_item_id;
  IF v_weight IS NOT NULL THEN
    v_line := COALESCE(NEW.unit_price, 0) * COALESCE(v_weight, 0);
  ELSE
    v_line := COALESCE(NEW.unit_price, 0) * COALESCE(v_qty, 1);
  END IF;
  IF NEW.is_express AND NEW.express_multiplier IS NOT NULL THEN
    v_line := v_line * NEW.express_multiplier;
  END IF;
  NEW.line_total := v_line;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recompute child service totals when parent item changes
CREATE OR REPLACE FUNCTION recompute_services_for_cart_item()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE cart_item_services
     SET unit_price = unit_price
   WHERE cart_item_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recalculate cart totals (subtotal from services + adjustments and discount/tax)
CREATE OR REPLACE FUNCTION recalc_cart_totals(p_cart_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_subtotal DECIMAL(10,2);
  v_tax DECIMAL(10,2);
  v_discount DECIMAL(10,2);
  v_adjustments DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(cis.line_total), 0)
    INTO v_subtotal
  FROM cart_item_services cis
  JOIN cart_items ci ON ci.id = cis.cart_item_id
  WHERE ci.cart_id = p_cart_id;
  SELECT tax_amount, discount_amount
    INTO v_tax, v_discount
  FROM shopping_carts WHERE id = p_cart_id;
  SELECT COALESCE(SUM(amount), 0)
    INTO v_adjustments
  FROM cart_adjustments
  WHERE cart_id = p_cart_id;
  UPDATE shopping_carts
     SET subtotal = v_subtotal,
         adjustments_total = v_adjustments,
         total_amount = GREATEST(0, v_subtotal - COALESCE(v_discount,0) + COALESCE(v_tax,0) + COALESCE(v_adjustments,0)),
         updated_at = NOW()
   WHERE id = p_cart_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_cart_totals_from_item_service()
RETURNS TRIGGER AS $$
DECLARE
  v_cart_id INTEGER;
BEGIN
  SELECT ci.cart_id INTO v_cart_id
  FROM cart_items ci
  WHERE ci.id = COALESCE(NEW.cart_item_id, OLD.cart_item_id);
  PERFORM recalc_cart_totals(v_cart_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recalc when cart adjustments change
CREATE OR REPLACE FUNCTION recalc_cart_totals_from_adjustment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalc_cart_totals(COALESCE(NEW.cart_id, OLD.cart_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Keep cart totals in sync when tax/discount amounts change directly
CREATE OR REPLACE FUNCTION touch_cart_totals_on_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    PERFORM recalc_cart_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recalculate order totals: items + adjustments + tax - discount_amount
CREATE OR REPLACE FUNCTION recalc_order_totals(p_order_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_subtotal DECIMAL(10,2);
  v_tax DECIMAL(10,2);
  v_discount DECIMAL(10,2);
  v_adjustments DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(ois.line_total), 0) INTO v_subtotal
  FROM order_item_services ois
  JOIN order_items oi ON oi.id = ois.order_item_id
  WHERE oi.order_id = p_order_id;
  SELECT tax_amount, discount_amount INTO v_tax, v_discount
  FROM orders WHERE id = p_order_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_adjustments
  FROM order_adjustments WHERE order_id = p_order_id;
  UPDATE orders
     SET subtotal = v_subtotal,
         total_amount = GREATEST(0, v_subtotal - COALESCE(v_discount,0) + COALESCE(v_tax,0) + COALESCE(v_adjustments,0)),
         updated_at = NOW()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION recalc_order_totals_from_item_service()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id INTEGER;
BEGIN
  SELECT oi.order_id INTO v_order_id
  FROM order_items oi
  WHERE oi.id = COALESCE(NEW.order_item_id, OLD.order_item_id);
  PERFORM recalc_order_totals(v_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recalc totals when order-level tax/discount change
CREATE OR REPLACE FUNCTION recalc_order_totals_on_order_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.discount_amount IS DISTINCT FROM OLD.discount_amount THEN
    PERFORM recalc_order_totals(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Recalc totals when order adjustments change
CREATE OR REPLACE FUNCTION recalc_order_totals_from_adjustment()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalc_order_totals(COALESCE(NEW.order_id, OLD.order_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Auto-log order status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN
  BEGIN
    v_changed_by := current_setting('app.current_user_id', TRUE)::BIGINT;
  EXCEPTION WHEN others THEN
    v_changed_by := NULL;
  END;
 
  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (order_id, status, notes, created_at, updated_by)
    VALUES (NEW.id, NEW.status, 'initial', NOW(), v_changed_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history (order_id, status, notes, created_at, updated_by)
    VALUES (NEW.id, NEW.status, NULL, NOW(), v_changed_by);
  END IF;
 
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION touch_reviews_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Trigger: enforce consistency with the related order
-- Ensures:
--  - The review's customer_id matches orders.customer_id
--  - If provided, laundry_profile_id matches orders.laundry_profile_id
--  - If provided, delivery_profile_id matches orders.delivery_profile_id
CREATE OR REPLACE FUNCTION validate_review_order_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id INTEGER;
  v_laundry_profile_id INTEGER;
  v_delivery_profile_id INTEGER;
BEGIN
  SELECT customer_id, laundry_profile_id, delivery_profile_id
    INTO v_customer_id, v_laundry_profile_id, v_delivery_profile_id
  FROM orders
  WHERE id = NEW.order_id;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Order % not found or has no customer_id', NEW.order_id;
  END IF;
  IF NEW.customer_id <> v_customer_id THEN
    RAISE EXCEPTION 'Review customer_id (%) does not match order.customer_id (%) for order %',
      NEW.customer_id, v_customer_id, NEW.order_id;
  END IF;
  IF NEW.laundry_profile_id IS NOT NULL AND NEW.laundry_profile_id <> v_laundry_profile_id THEN
    RAISE EXCEPTION 'Review laundry_profile_id (%) does not match order.laundry_profile_id (%) for order %',
      NEW.laundry_profile_id, v_laundry_profile_id, NEW.order_id;
  END IF;
  IF NEW.delivery_profile_id IS NOT NULL AND NEW.delivery_profile_id <> v_delivery_profile_id THEN
    RAISE EXCEPTION 'Review delivery_profile_id (%) does not match order.delivery_profile_id (%) for order %',
      NEW.delivery_profile_id, v_delivery_profile_id, NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION touch_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Compute SLA due times from priority table
CREATE OR REPLACE FUNCTION compute_ticket_sla_due_times(p_priority VARCHAR, p_created TIMESTAMPTZ)
RETURNS TABLE(first_due TIMESTAMPTZ, resolution_due TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE WHEN stp.first_response_sla_minutes IS NOT NULL
         THEN p_created + (stp.first_response_sla_minutes || ' minutes')::INTERVAL
         ELSE NULL END AS first_due,
    CASE WHEN stp.resolution_sla_minutes IS NOT NULL
         THEN p_created + (stp.resolution_sla_minutes || ' minutes')::INTERVAL
         ELSE NULL END AS resolution_due
  FROM support_ticket_priorities stp
  WHERE stp.code = p_priority;
END;
$$ LANGUAGE plpgsql STABLE;

-- Set SLA due_at on insert; recompute on priority changes
CREATE OR REPLACE FUNCTION set_or_recompute_ticket_sla()
RETURNS TRIGGER AS $$
DECLARE
  v_first TIMESTAMPTZ;
  v_res TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT first_due, resolution_due INTO v_first, v_res
    FROM compute_ticket_sla_due_times(NEW.priority, COALESCE(NEW.created_at, NOW()));
    NEW.first_response_due_at := COALESCE(NEW.first_response_due_at, v_first);
    NEW.resolution_due_at := COALESCE(NEW.resolution_due_at, v_res);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      SELECT first_due, resolution_due INTO v_first, v_res
      FROM compute_ticket_sla_due_times(NEW.priority, OLD.created_at);
      -- Recompute only if corresponding events haven't happened yet
      IF NEW.first_response_at IS NULL THEN
        NEW.first_response_due_at := v_first;
      END IF;
      IF NEW.resolved_at IS NULL THEN
        NEW.resolution_due_at := v_res;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Set resolved_at/closed_at on status transition and log history
CREATE OR REPLACE FUNCTION handle_ticket_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, updated_by, note, created_at)
    VALUES (NEW.id, NULL, NEW.status, NULL, 'initial', NOW());
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- set timestamps for resolved/closed
    IF NEW.status = 'resolved' AND OLD.status IS DISTINCT FROM 'resolved' THEN
      NEW.resolved_at := COALESCE(NEW.resolved_at, NOW());
    ELSIF NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed' THEN
      NEW.closed_at := COALESCE(NEW.closed_at, NOW());
    END IF;
    -- status history
    INSERT INTO support_ticket_status_history (ticket_id, from_status, to_status, updated_by, created_at)
    VALUES (NEW.id, OLD.status, NEW.status, NULL, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- On comment insert: set last_response_at, set first_response_at if agent replies first, update SLA breach
CREATE OR REPLACE FUNCTION on_support_comment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_id INTEGER;
  v_first_due TIMESTAMPTZ;
  v_resolution_due TIMESTAMPTZ;
  v_resolved_at TIMESTAMPTZ;
  v_first_response TIMESTAMPTZ;
BEGIN
  SELECT customer_id, first_response_due_at, resolution_due_at, resolved_at, first_response_at
    INTO v_customer_id, v_first_due, v_resolution_due, v_resolved_at, v_first_response
  FROM support_tickets
  WHERE id = NEW.ticket_id
  FOR UPDATE;
  UPDATE support_tickets
     SET last_response_at = NOW(),
         first_response_at = CASE
           WHEN v_first_response IS NULL AND NEW.author_user_id <> v_customer_id THEN NOW()
           ELSE first_response_at END
   WHERE id = NEW.ticket_id;
  -- Re-evaluate SLA breach flags
  UPDATE support_tickets
     SET sla_breached = COALESCE(
         (first_response_at IS NULL AND v_first_due IS NOT NULL AND NOW() > v_first_due) OR
         (resolved_at IS NOT NULL AND v_resolution_due IS NOT NULL AND resolved_at > v_resolution_due) OR
         (resolved_at IS NULL AND v_resolution_due IS NOT NULL AND NOW() > v_resolution_due),
         FALSE)
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Re-evaluate SLA breach on ticket updates that set first_response_at/resolved_at directly
CREATE OR REPLACE FUNCTION reevaluate_sla_breach_on_ticket_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.first_response_at IS DISTINCT FROM OLD.first_response_at
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.first_response_due_at IS DISTINCT FROM OLD.first_response_due_at
     OR NEW.resolution_due_at IS DISTINCT FROM OLD.resolution_due_at THEN
    NEW.sla_breached :=
      COALESCE(
        (NEW.first_response_at IS NULL AND NEW.first_response_due_at IS NOT NULL AND NOW() > NEW.first_response_due_at) OR
        (NEW.resolved_at IS NOT NULL AND NEW.resolution_due_at IS NOT NULL AND NEW.resolved_at > NEW.resolution_due_at) OR
        (NEW.resolved_at IS NULL AND NEW.resolution_due_at IS NOT NULL AND NOW() > NEW.resolution_due_at),
        FALSE
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION touch_promotions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Utility: compute per-user period start
CREATE OR REPLACE FUNCTION promo_period_start(p_period VARCHAR, p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TIMESTAMPTZ AS $$
BEGIN
  CASE p_period
    WHEN 'per_day'   THEN RETURN date_trunc('day',   p_now);
    WHEN 'per_week'  THEN RETURN date_trunc('week',  p_now);
    WHEN 'per_month' THEN RETURN date_trunc('month', p_now);
    WHEN 'per_year'  THEN RETURN date_trunc('year',  p_now);
    WHEN 'lifetime'  THEN RETURN NULL;
    ELSE RETURN NULL;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

-- **********************************************************************************
-- Utility: compute eligible amount on an order
-- Applies inclusion/exclusion scopes for services/product_types
CREATE OR REPLACE FUNCTION compute_promotion_eligible_amount(p_promotion_id INTEGER, p_order_id INTEGER)
RETURNS DECIMAL(12,2) AS $$
DECLARE
  v_total NUMERIC(12,2);
BEGIN
  WITH svc_inc AS (
    SELECT service_id FROM promotion_services WHERE promotion_id = p_promotion_id AND include = TRUE
  ),
  svc_exc AS (
    SELECT service_id FROM promotion_services WHERE promotion_id = p_promotion_id AND include = FALSE
  ),
  pt_inc AS (
    SELECT product_type_id FROM promotion_product_types WHERE promotion_id = p_promotion_id AND include = TRUE
  ),
  pt_exc AS (
    SELECT product_type_id FROM promotion_product_types WHERE promotion_id = p_promotion_id AND include = FALSE
  ),
  has_svc_inc AS (
    SELECT COUNT(*)::INT AS c FROM svc_inc
  ),
  has_pt_inc AS (
    SELECT COUNT(*)::INT AS c FROM pt_inc
  )
  SELECT COALESCE(SUM(ois.line_total), 0)::NUMERIC(12,2)
    INTO v_total
  FROM order_item_services ois
  JOIN order_items oi ON oi.id = ois.order_item_id
  WHERE oi.order_id = p_order_id
    -- Service inclusion/exclusion
    AND (
      (SELECT c FROM has_svc_inc) = 0
      OR ois.service_id IN (SELECT service_id FROM svc_inc)
    )
    AND NOT EXISTS (
      SELECT 1 FROM svc_exc e WHERE e.service_id = ois.service_id
    )
    -- Product type inclusion/exclusion
    AND (
      (SELECT c FROM has_pt_inc) = 0
      OR oi.product_type_id IN (SELECT product_type_id FROM pt_inc)
    )
    AND NOT EXISTS (
      SELECT 1 FROM pt_exc e WHERE e.product_type_id = oi.product_type_id
    );
  RETURN COALESCE(v_total, 0)::DECIMAL(12,2);
END;
$$ LANGUAGE plpgsql STABLE;

-- **********************************************************************************
-- Validate eligibility and compute discount for an order
-- Returns JSON with details (eligible/reason/amounts)
CREATE OR REPLACE FUNCTION promo_check_order_eligibility(p_code VARCHAR, p_user_id INTEGER, p_order_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_promo RECORD;
  v_user RECORD;
  v_order RECORD;
  v_completed_orders INTEGER := 0;
  v_global_count INTEGER := 0;
  v_user_count INTEGER := 0;
  v_period_start TIMESTAMPTZ;
  v_eligible_amount NUMERIC(12,2) := 0;
  v_discount NUMERIC(12,2) := 0;
  v_reason TEXT := NULL;
  v_other_exclusive BOOLEAN := FALSE;
  v_group_conflict BOOLEAN := FALSE;
BEGIN
  -- Load promotion by exact code
  SELECT * INTO v_promo FROM promotions WHERE code = p_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'invalid_code');
  END IF;
  -- Active and window check
  IF NOT v_promo.is_active THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'inactive_promotion');
  END IF;
  IF v_promo.starts_at > v_now THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'not_started_yet');
  END IF;
  IF v_promo.ends_at IS NOT NULL AND v_promo.ends_at < v_now THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'expired');
  END IF;
  -- Load user and order
  SELECT id, created_at INTO v_user FROM users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_not_found');
  END IF;
  SELECT id, customer_id, subtotal, status, created_at INTO v_order FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'order_not_found');
  END IF;
  IF v_order.customer_id <> p_user_id THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'order_user_mismatch');
  END IF;

  -- First-order / min/max completed orders eligibility
  -- Count completed orders (terminal and not cancelled if your statuses are seeded accordingly)
  SELECT COUNT(*) INTO v_completed_orders
  FROM orders o
  JOIN order_statuses s ON s.code = o.status
  WHERE o.customer_id = p_user_id
    AND s.is_terminal = TRUE
    AND s.code <> 'cancelled';
  IF v_promo.first_order_only AND v_completed_orders > 0 THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'not_first_order');
  END IF;
  IF v_promo.eligible_min_completed_orders IS NOT NULL AND v_completed_orders < v_promo.eligible_min_completed_orders THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'min_completed_orders_not_met');
  END IF;
  IF v_promo.eligible_max_completed_orders IS NOT NULL AND v_completed_orders > v_promo.eligible_max_completed_orders THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'max_completed_orders_exceeded');
  END IF;
  IF v_promo.eligible_user_created_after IS NOT NULL AND v_user.created_at < v_promo.eligible_user_created_after THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_created_before_window');
  END IF;
  IF v_promo.eligible_user_created_before IS NOT NULL AND v_user.created_at > v_promo.eligible_user_created_before THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_created_after_window');
  END IF;
  -- Explicit user targets (whitelist/blacklist)
  -- If any include rows exist, user must be included. If no include rows, ensure not blacklisted.
  IF EXISTS (SELECT 1 FROM promotion_user_targets WHERE promotion_id = v_promo.id AND include = TRUE) THEN
    IF NOT EXISTS (SELECT 1 FROM promotion_user_targets WHERE promotion_id = v_promo.id AND user_id = p_user_id AND include = TRUE) THEN
      RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_not_whitelisted');
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM promotion_user_targets WHERE promotion_id = v_promo.id AND user_id = p_user_id AND include = FALSE) THEN
      RETURN jsonb_build_object('eligible', FALSE, 'reason', 'user_blacklisted');
    END IF;
  END IF;
  -- Stacking/exclusivity checks
  SELECT
    EXISTS (
      SELECT 1 FROM order_promotions op
      JOIN promotions p ON p.id = op.promotion_id
      WHERE op.order_id = p_order_id
        AND p.is_exclusive = TRUE
    ),
    EXISTS (
      SELECT 1 FROM order_promotions op
      JOIN promotions p ON p.id = op.promotion_id
      WHERE op.order_id = p_order_id
        AND p.exclusion_group IS NOT NULL
        AND v_promo.exclusion_group IS NOT NULL
        AND p.exclusion_group = v_promo.exclusion_group
    )
  INTO v_other_exclusive, v_group_conflict;
  IF v_other_exclusive THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'another_exclusive_applied');
  END IF;
  IF v_promo.is_exclusive AND EXISTS (SELECT 1 FROM order_promotions WHERE order_id = p_order_id) THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'exclusive_cannot_stack');
  END IF;
  IF v_group_conflict THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'exclusion_group_conflict');
  END IF;
  -- Usage limits (global and per-user period)
  IF v_promo.global_usage_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_global_count
    FROM promotion_redemptions pr
    WHERE pr.promotion_id = v_promo.id;
    IF v_global_count >= v_promo.global_usage_limit THEN
      RETURN jsonb_build_object('eligible', FALSE, 'reason', 'global_limit_reached');
    END IF;
  END IF;
  IF v_promo.per_user_usage_limit IS NOT NULL THEN
    v_period_start := promo_period_start(v_promo.per_user_period, v_now);
    IF v_period_start IS NULL AND v_promo.per_user_period <> 'lifetime' THEN
      -- fallback: treat as lifetime if unrecognized
      v_period_start := NULL;
    END IF;
    IF v_period_start IS NULL THEN
      SELECT COUNT(*) INTO v_user_count
      FROM promotion_redemptions pr
      WHERE pr.promotion_id = v_promo.id
        AND pr.user_id = p_user_id;
    ELSE
      SELECT COUNT(*) INTO v_user_count
      FROM promotion_redemptions pr
      WHERE pr.promotion_id = v_promo.id
        AND pr.user_id = p_user_id
        AND pr.redeemed_at >= v_period_start;
    END IF;
    IF v_user_count >= v_promo.per_user_usage_limit THEN
      RETURN jsonb_build_object('eligible', FALSE, 'reason', 'per_user_limit_reached');
    END IF;
  END IF;
  -- Eligible base amount based on scopes
  v_eligible_amount := compute_promotion_eligible_amount(v_promo.id, p_order_id);
  -- Min order amount check (against order subtotal)
  IF v_order.subtotal < v_promo.min_order_amount THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'min_order_amount_not_met',
                              'eligible_amount', v_eligible_amount, 'order_subtotal', v_order.subtotal);
  END IF;
  IF v_eligible_amount <= 0 THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'no_eligible_items');
  END IF;
  -- Compute discount
  IF v_promo.discount_type = 'percent' THEN
    v_discount := ROUND(v_eligible_amount * v_promo.discount_value / 100.0, 2);
  ELSE
    v_discount := v_promo.discount_value;
  END IF;
  IF v_promo.max_discount_amount IS NOT NULL THEN
    v_discount := LEAST(v_discount, v_promo.max_discount_amount);
  END IF;
  -- Never exceed the eligible amount
  v_discount := LEAST(v_discount, v_eligible_amount);
  IF v_discount <= 0 THEN
    RETURN jsonb_build_object('eligible', FALSE, 'reason', 'computed_zero_discount');
  END IF;
  RETURN jsonb_build_object(
    'eligible', TRUE,
    'promotion_id', v_promo.id,
    'code', v_promo.code,
    'eligible_amount', v_eligible_amount,
    'discount_amount', v_discount,
    'order_subtotal', v_order.subtotal
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- **********************************************************************************
-- Apply promotion atomically to an order
-- Inserts order_promotions + promotion_redemptions + order_adjustments
-- Raises exception if ineligible
CREATE OR REPLACE FUNCTION promo_apply_to_order(p_code VARCHAR, p_order_id INTEGER, p_user_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_promo RECORD;
  v_check JSONB;
  v_discount NUMERIC(12,2);
  v_eligible BOOLEAN;
  v_reason TEXT;
  v_period_start TIMESTAMPTZ;
  v_other_exclusive BOOLEAN := FALSE;
  v_group_conflict BOOLEAN := FALSE;
BEGIN
  -- Lock promotion row to serialize limit checks and application
  SELECT * INTO v_promo FROM promotions WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Promotion code % not found', p_code;
  END IF;
  -- Re-run eligibility (without locks on all referenced tables, but promo row is locked)
  v_check := promo_check_order_eligibility(p_code, p_user_id, p_order_id);
  v_eligible := COALESCE((v_check->>'eligible')::BOOLEAN, FALSE);
  IF NOT v_eligible THEN
    v_reason := v_check->>'reason';
    RAISE EXCEPTION 'Promotion ineligible: %', COALESCE(v_reason, 'unknown');
  END IF;
  v_discount := (v_check->>'discount_amount')::NUMERIC;
  -- Additional concurrency-safe usage checks under lock
  IF v_promo.global_usage_limit IS NOT NULL THEN
    PERFORM 1 FROM promotion_redemptions WHERE promotion_id = v_promo.id;
    IF (SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id = v_promo.id) >= v_promo.global_usage_limit THEN
      RAISE EXCEPTION 'Global usage limit reached for promotion %', v_promo.code;
    END IF;
  END IF;
  IF v_promo.per_user_usage_limit IS NOT NULL THEN
    v_period_start := promo_period_start(v_promo.per_user_period, v_now);
    IF v_period_start IS NULL THEN
      IF (SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id = v_promo.id AND user_id = p_user_id)
         >= v_promo.per_user_usage_limit THEN
        RAISE EXCEPTION 'Per-user usage limit reached for promotion %', v_promo.code;
      END IF;
    ELSE
      IF (SELECT COUNT(*) FROM promotion_redemptions WHERE promotion_id = v_promo.id AND user_id = p_user_id AND redeemed_at >= v_period_start)
         >= v_promo.per_user_usage_limit THEN
        RAISE EXCEPTION 'Per-user period usage limit reached for promotion %', v_promo.code;
      END IF;
    END IF;
  END IF;
  -- Stacking checks under lock
  SELECT
    EXISTS (
      SELECT 1 FROM order_promotions op JOIN promotions p ON p.id = op.promotion_id
      WHERE op.order_id = p_order_id AND p.is_exclusive = TRUE
    ),
    EXISTS (
      SELECT 1 FROM order_promotions op JOIN promotions p ON p.id = op.promotion_id
      WHERE op.order_id = p_order_id
        AND p.exclusion_group IS NOT NULL
        AND v_promo.exclusion_group IS NOT NULL
        AND p.exclusion_group = v_promo.exclusion_group
    )
  INTO v_other_exclusive, v_group_conflict;
  IF v_other_exclusive THEN
    RAISE EXCEPTION 'Another exclusive promotion is already applied';
  END IF;
  IF v_promo.is_exclusive AND EXISTS (SELECT 1 FROM order_promotions WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Exclusive promotion cannot be stacked with others';
  END IF;
  IF v_group_conflict THEN
    RAISE EXCEPTION 'Promotion conflicts with another promotion in the same exclusion group';
  END IF;
  -- Insert breakdown line (negative amount for discounts)
  INSERT INTO order_adjustments (order_id, kind, amount, note, metadata)
  VALUES (p_order_id, 'coupon', -v_discount, CONCAT('Promotion ', v_promo.code), jsonb_build_object('promotion_id', v_promo.id, 'code', v_promo.code));
  -- Insert mapping and redemption
  INSERT INTO order_promotions (order_id, promotion_id, code_used, amount_discounted, applied_at)
  VALUES (p_order_id, v_promo.id, v_promo.code, v_discount, v_now)
  ON CONFLICT (order_id, promotion_id) DO NOTHING;
  INSERT INTO promotion_redemptions (promotion_id, user_id, order_id, code_used, amount_discounted, redeemed_at)
  VALUES (v_promo.id, p_user_id, p_order_id, v_promo.code, v_discount, v_now);
  RETURN jsonb_build_object(
    'applied', TRUE,
    'promotion_id', v_promo.id,
    'code', v_promo.code,
    'discount_amount', v_discount
  );
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Optional: maintain cached global_used_count via triggers
CREATE OR REPLACE FUNCTION promo_redemption_counter_inc()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE promotions SET global_used_count = COALESCE(global_used_count,0) + 1
  WHERE id = NEW.promotion_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION promo_redemption_counter_dec()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE promotions SET global_used_count = GREATEST(COALESCE(global_used_count,0) - 1, 0)
  WHERE id = OLD.promotion_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION log_laundry_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_changed_by BIGINT;
BEGIN
  -- Only proceed if status actually changed
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  -- Only log transitions involving laundry processing statuses
  -- (i.e., the new OR old status exists in laundry_statuses)
  IF NOT EXISTS (
    SELECT 1 FROM laundry_statuses
    WHERE code = NEW.status OR code = OLD.status
  ) THEN
    RETURN NEW;
  END IF;
  -- Safely read the session variable; fall back to NULL if not set
  BEGIN
    v_changed_by := current_setting('app.current_user_id', TRUE)::BIGINT;
  EXCEPTION WHEN others THEN
    v_changed_by := NULL;
  END;
 
  INSERT INTO laundry_status_history (
    order_id,
    from_status,
    to_status,
    changed_by,
    changed_at
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    v_changed_by,
    NOW()
  );
 
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Set SLA deadline based on created_at + express flag --> sla_deadline & express does not exist in orders table
-- calculate_sla_deadline --> No function exists to calculate sla deadline
-- CREATE OR REPLACE FUNCTION set_sla_deadline()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     IF NEW.sla_deadline IS NULL THEN
--         NEW.sla_deadline := calculate_sla_deadline(NEW.created_at, NEW.express);
--     END IF;
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION prevent_invalid_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM laundry_statuses
    WHERE code = OLD.status AND is_terminal = TRUE
  ) THEN
      RAISE EXCEPTION 'Cannot change status from terminal state: %', OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
 -- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_sessions
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- Function to clean up expired reset tokens
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM password_reset_tokens
  WHERE expires_at < NOW()
    OR used_at IS NOT NULL;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION update_oauth_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_accounts ENABLE ROW LEVEL SECURITY;

-- **********************************************************************************
CREATE POLICY user_sessions_policy ON user_sessions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- **********************************************************************************
-- ============================================
-- DATA VALIDATION CONSTRAINTS
-- ============================================
-- Ensure email_verified and email_verified_at are consistent
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_email_verified;
ALTER TABLE users ADD CONSTRAINT chk_users_email_verified CHECK (
  (email_verified AND email_verified_at IS NOT NULL)
  OR (NOT email_verified AND email_verified_at IS NULL)
);

-- **********************************************************************************
-- Ensure phone_verified and phone_verified_at are consistent
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_phone_verified;
ALTER TABLE users ADD CONSTRAINT chk_users_phone_verified CHECK (
  (phone_verified AND phone_verified_at IS NOT NULL)
  OR (NOT phone_verified AND phone_verified_at IS NULL)
);

-- **********************************************************************************
-- ============================================
-- HELPER VIEWS
-- ============================================
-- View for active user sessions
CREATE OR REPLACE VIEW active_user_sessions AS
SELECT 
  s.id,
  s.user_id,
  s.session_id,
  s.expires_at,
  s.ip_address,
  s.user_agent,
  s.created_at,
  s.last_activity,
  u.email,
  u.full_name,
  r.name as role_name
FROM user_sessions s
INNER JOIN users u ON u.id = s.user_id
INNER JOIN roles r ON r.id = u.role_id
WHERE s.expires_at > NOW()
  AND u.deleted_at IS NULL
  AND u.status = 'active';

-- **********************************************************************************
-- View for user authentication info
CREATE OR REPLACE VIEW user_auth_info AS
SELECT 
  u.id,
  u.email,
  u.full_name,
  u.phone,
  u.status,
  u.email_verified,
  u.phone_verified,
  u.last_logged_in,
  r.name as role_name,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM oauth_accounts oa 
      WHERE oa.user_id = u.id
    ) THEN true 
    ELSE false 
  END as has_oauth_linked,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM user_sessions s 
      WHERE s.user_id = u.id 
        AND s.expires_at > NOW()
    ) THEN true 
    ELSE false 
  END as has_active_session
FROM users u
INNER JOIN roles r ON r.id = u.role_id
WHERE u.deleted_at IS NULL;

-- ============================================
-- SCHEDULED MAINTENANCE (Setup in cron or pg_cron)
-- ============================================

-- Example: Clean up expired sessions daily
-- SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions()');

-- Example: Clean up expired tokens daily
-- SELECT cron.schedule('cleanup-tokens', '0 3 * * *', 'SELECT cleanup_expired_reset_tokens()');

-- ============================================
-- GRANTS (Adjust based on your database user)
-- ============================================

-- Grant permissions to your application user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_accounts TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;
  -- END as oauth_accounts_status;

-- **********************************************************************************
-- 7. Helper functions for profile completion workflow
CREATE OR REPLACE FUNCTION generate_profile_completion_token()
RETURNS VARCHAR(255) AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION extend_profile_completion_token(
  p_user_id BIGINT,
  p_admin_id BIGINT,
  p_hours INTEGER
)
RETURNS VOID AS $$
DECLARE
  v_new_expiry TIMESTAMPTZ;
BEGIN
  v_new_expiry := NOW() + (p_hours || ' hours')::INTERVAL;
  UPDATE users
  SET 
    profile_completion_token_expires_at = v_new_expiry,
    profile_completion_token_validity_hours = p_hours,
    updated_at = NOW()
  WHERE id = p_user_id;
  INSERT INTO user_approval_history (user_id, action, performed_by, metadata)
  VALUES (
    p_user_id,
    'token_extended',
    p_admin_id,
    jsonb_build_object('new_expiry', v_new_expiry, 'hours_added', p_hours)
  );
END;
$$ LANGUAGE plpgsql;

-- 8. Search function for laundry providers (supports pincode search)
CREATE OR REPLACE FUNCTION search_laundry_providers(
  p_search_term VARCHAR DEFAULT NULL,
  p_min_rating DECIMAL DEFAULT 0,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  business_name VARCHAR,
  city VARCHAR,
  postal_code VARCHAR,
  rating DECIMAL,
  services_offered TEXT[],
  serviceable_pincodes VARCHAR[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lp.id,
    lp.business_name,
    lp.city,
    lp.postal_code,
    lp.rating,
    lp.services_offered,
    COALESCE(
      array_agg(DISTINCT psa.postal_code) FILTER (WHERE psa.postal_code IS NOT NULL),
      ARRAY[]::VARCHAR[]
    ) as serviceable_pincodes
  FROM laundry_profiles lp
  LEFT JOIN provider_service_areas psa ON psa.provider_id = lp.id AND psa.is_active = TRUE
  WHERE lp.status = 'active'
    AND lp.is_verified = TRUE
    AND lp.rating >= p_min_rating
    AND (
      p_search_term IS NULL
      OR lp.postal_code ILIKE p_search_term || '%'
      OR psa.postal_code ILIKE p_search_term || '%'
      OR lp.city ILIKE '%' || p_search_term || '%'
      OR psa.city ILIKE '%' || p_search_term || '%'
      OR lp.service_area ILIKE '%' || p_search_term || '%'
    )
  GROUP BY lp.id
  ORDER BY lp.rating DESC, lp.business_name ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- **********************************************************************************
CREATE OR REPLACE FUNCTION get_partner_faqs(p_role VARCHAR, p_category VARCHAR DEFAULT NULL)
RETURNS TABLE(
  id INTEGER,
  question TEXT,
  answer TEXT,
  category VARCHAR,
  sort_order INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pf.id,
    pf.question,
    pf.answer,
    pf.category,
    pf.sort_order
  FROM partner_faqs pf
  WHERE pf.is_active = TRUE
    AND (pf.role = p_role OR pf.role = 'general')
    AND (p_category IS NULL OR pf.category = p_category)
  ORDER BY pf.category, pf.sort_order;
END;
$$ LANGUAGE plpgsql;

-- **********************************************************************************
-- **********************************************************************************
-- **********************************************************************************