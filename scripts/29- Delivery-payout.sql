-- ============================================================
-- Salary slab system for platform delivery partners.
-- 3rd party partners are excluded (onboarding_type = 'third_party').
-- ============================================================
 
-- ── 1. partner_salary_slabs ───────────────────────────────────────────────────
-- Admin defines slabs separately for pickups and deliveries.
-- Example:
--   type=pickup,  min=0,   max=50,  salary=3000
--   type=pickup,  min=51,  max=100, salary=6000
--   type=pickup,  min=101, max=null, salary=10000  (null max = unlimited)
--   type=delivery, min=0,  max=50,  salary=3000
--   ...etc
 
CREATE TABLE IF NOT EXISTS partner_salary_slabs (
  id             SERIAL PRIMARY KEY,
  slab_type      VARCHAR(10) NOT NULL
    CHECK (slab_type IN ('pickup', 'delivery')),
  min_count      INTEGER     NOT NULL CHECK (min_count >= 0),
  max_count      INTEGER     CHECK (max_count IS NULL OR max_count >= min_count),
  -- NULL max_count means "this count and above"
  salary_amount  DECIMAL(10,2) NOT NULL CHECK (salary_amount >= 0),
  -- Optional effective date range for seasonal adjustments
  effective_from DATE,
  effective_to   DATE,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by     BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
 
ALTER TABLE partner_salary_slabs ALTER COLUMN created_by SET DEFAULT NULL;
 
CREATE INDEX IF NOT EXISTS idx_salary_slabs_type_active
  ON partner_salary_slabs (slab_type, is_active);
 
DROP TRIGGER IF EXISTS trg_salary_slabs_updated_at ON partner_salary_slabs;
CREATE TRIGGER trg_salary_slabs_updated_at
  BEFORE UPDATE ON partner_salary_slabs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
-- ── 2. partner_monthly_payouts ────────────────────────────────────────────────
-- One row per platform delivery partner per calculated date range.
-- Calculated by admin — not automatic.
 
CREATE TABLE IF NOT EXISTS partner_monthly_payouts (
  id                    SERIAL PRIMARY KEY,
  delivery_profile_id   BIGINT      NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  period_start          DATE        NOT NULL,
  period_end            DATE        NOT NULL,
  -- Counts within the period
  pickup_count          INTEGER     NOT NULL DEFAULT 0,
  delivery_count        INTEGER     NOT NULL DEFAULT 0,
  -- Slab amounts applied
  pickup_slab_id        INTEGER     REFERENCES partner_salary_slabs(id) ON DELETE SET NULL,
  delivery_slab_id      INTEGER     REFERENCES partner_salary_slabs(id) ON DELETE SET NULL,
  pickup_salary         DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_salary       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_salary          DECIMAL(10,2) NOT NULL DEFAULT 0,
  -- Payout status
  status                VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'on_hold')),
  paid_at               TIMESTAMPTZ,
  paid_by               BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  payment_reference     VARCHAR(255),  -- UTR / transaction ref
  notes                 TEXT,
  -- Calculated by
  calculated_by         BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Prevent duplicate calculations for same period
  UNIQUE (delivery_profile_id, period_start, period_end)
);
 
ALTER TABLE partner_monthly_payouts ALTER COLUMN pickup_slab_id SET DEFAULT NULL;
ALTER TABLE partner_monthly_payouts ALTER COLUMN delivery_slab_id SET DEFAULT NULL;
ALTER TABLE partner_monthly_payouts ALTER COLUMN paid_by SET DEFAULT NULL;
ALTER TABLE partner_monthly_payouts ALTER COLUMN calculated_by SET DEFAULT NULL;
 
CREATE INDEX IF NOT EXISTS idx_payouts_profile
  ON partner_monthly_payouts (delivery_profile_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_payouts_status
  ON partner_monthly_payouts (status, period_start DESC);
 
DROP TRIGGER IF EXISTS trg_payouts_updated_at ON partner_monthly_payouts;
CREATE TRIGGER trg_payouts_updated_at
  BEFORE UPDATE ON partner_monthly_payouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
 
-- ── 3. Helper function: get applicable slab for a count ───────────────────────
 
CREATE OR REPLACE FUNCTION get_salary_slab(
  p_type        VARCHAR,
  p_count       INTEGER,
  p_period_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (slab_id INTEGER, salary_amount DECIMAL) AS $$
  SELECT id, salary_amount
  FROM partner_salary_slabs
  WHERE slab_type = p_type
    AND is_active  = TRUE
    AND min_count <= p_count
    AND (max_count IS NULL OR max_count >= p_count)
    AND (effective_from IS NULL OR effective_from <= p_period_date)
    AND (effective_to   IS NULL OR effective_to   >= p_period_date)
  ORDER BY min_count DESC
  LIMIT 1;
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Fixes all FK constraint bugs in support_tickets that prevent
-- ticket creation from laundry and delivery portals.
-- ============================================================
 
-- ── 1. Fix BIGSERIAL default bug on all nullable FK columns ──────────────────
-- BIGSERIAL sets a sequence as the column default even after DROP NOT NULL.
-- When you insert NULL, Postgres uses the sequence default instead, generating
-- a fake ID that fails the FK constraint. Fix: explicitly set DEFAULT NULL.
 
ALTER TABLE support_tickets ALTER COLUMN order_id              SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN wallet_transaction_id SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN assigned_to           SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN assigned_group_id     SET DEFAULT NULL;
 
-- ── 2. Fix coupon_code FK — drop the FK constraint ───────────────────────────
-- coupon_code references coupons(code). For non-coupon tickets from laundry
-- or delivery, coupon_code is NULL or a free-text reference. The FK prevents
-- insertion of any coupon_code value that doesn't exist in the coupons table.
-- We remove the FK and keep it as a plain nullable VARCHAR.
 
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_coupon_code_fkey;
 
-- ── 3. Ensure reporter_id column exists (migration 24 may not have run) ───────
-- If customer_id was already renamed, this is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'support_tickets' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE support_tickets RENAME COLUMN customer_id TO reporter_id;
  END IF;
END $$;
 
-- Ensure reporter_role column exists
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS reporter_role VARCHAR(30) NOT NULL DEFAULT 'customer'
    CHECK (reporter_role IN ('customer', 'laundry', 'delivery', 'support', 'admin'));
 
-- ── 4. Add sub_category column ────────────────────────────────────────────────
-- Stores the selected sub-category string from the category's sub_categories JSONB.
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100);
 
-- ── 5. Fix related tables ─────────────────────────────────────────────────────
ALTER TABLE support_ticket_attachments    ALTER COLUMN uploaded_by    SET DEFAULT NULL;
ALTER TABLE support_ticket_status_history ALTER COLUMN updated_by     SET DEFAULT NULL;
ALTER TABLE support_ticket_comments       ALTER COLUMN author_user_id SET DEFAULT NULL;
 
-- ── 6. Ensure all seeded lookup data exists ───────────────────────────────────
-- Statuses
INSERT INTO support_ticket_statuses (code, description, sort_order, is_terminal) VALUES
  ('open',        'Newly created, awaiting assignment',      10, FALSE),
  ('in_progress', 'Assigned and being worked on',            20, FALSE),
  ('hold',        'Waiting on reporter response',            30, FALSE),
  ('resolved',    'Issue resolved, awaiting confirmation',   40, FALSE),
  ('closed',      'Fully closed',                            50, TRUE),
  ('reopened',    'Previously closed, reopened by reporter', 60, FALSE)
ON CONFLICT (code) DO NOTHING;
 
-- Priorities
INSERT INTO support_ticket_priorities
  (code, description, sort_order, first_response_sla_minutes, resolution_sla_minutes)
VALUES
  ('urgent', 'Critical — respond immediately',  10,   30,   240),
  ('high',   'High impact — respond in 2 hrs',  20,  120,   480),
  ('medium', 'Standard — respond in 8 hrs',     30,  480,  1440),
  ('low',    'Low — respond in 24 hrs',         40, 1440,  2880)
ON CONFLICT (code) DO NOTHING;
 
-- Categories (upsert so icons/sub-cats are always current)
INSERT INTO support_ticket_categories
  (code, display_name, icon, description, sub_categories, allowed_roles, default_priority, sort_order, is_active)
VALUES
  ('order',     'Order Issue',         '📦', 'Problems with a specific order',
   '["Order not showing","Wrong items","Unable to update status","Pickup not happened","Delivery issue","Item damaged or lost","Other order issue"]'::jsonb,
   NULL, 'high', 10, TRUE),
  ('technical', 'App / Technical',     '🛠️', 'Login problems, dashboard errors, crashes',
   '["Cannot log in","Dashboard not loading","Status not saving","App crashing","Notifications not working","Data incorrect","Other technical issue"]'::jsonb,
   NULL, 'medium', 20, TRUE),
  ('account',   'Account & Profile',   '👤', 'Verification, profile details, access',
   '["Profile approval delay","Update registered phone","Account suspended","Profile details incorrect","Verification document issue","Other account issue"]'::jsonb,
   NULL, 'medium', 30, TRUE),
  ('wallet',    'Payments & Earnings', '💰', 'Payouts, refunds, billing',
   '["Payout not received","Incorrect deduction","Invoice needed","Refund not processed","Bank account update","Other payment issue"]'::jsonb,
   '["laundry","delivery","admin"]'::jsonb, 'high', 40, TRUE),
  ('coupon',    'Coupon / Discount',   '🎟️', 'Coupon issues',
   '["Coupon not working","Wrong discount","Coupon expired early","Referral reward missing","Other coupon issue"]'::jsonb,
   '["customer"]'::jsonb, 'low', 50, TRUE),
  ('other',     'General / Other',     '💬', 'Anything not covered above',
   '["Feature request","General question","Suggestion","Other"]'::jsonb,
   NULL, 'low', 60, TRUE)
ON CONFLICT (code) DO UPDATE SET
  display_name     = EXCLUDED.display_name,
  icon             = EXCLUDED.icon,
  description      = EXCLUDED.description,
  sub_categories   = EXCLUDED.sub_categories,
  allowed_roles    = EXCLUDED.allowed_roles,
  default_priority = EXCLUDED.default_priority,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active;
 
-- ── 7. Recreate reporter index if it doesn't exist ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter
  ON support_tickets (reporter_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter_role
  ON support_tickets (reporter_role);

 
ALTER TABLE support_tickets ALTER COLUMN assigned_to DROP NOT NULL; 
ALTER TABLE support_tickets ALTER COLUMN order_id DROP NOT NULL;
 ALTER TABLE support_tickets ALTER COLUMN wallet_transaction_id DROP NOT NULL;
 ALTER TABLE support_tickets ALTER COLUMN assigned_group_id DROP NOT NULL;
ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_coupon_code_fkey; 
ALTER TABLE support_tickets ALTER COLUMN assigned_to           SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN order_id              SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN wallet_transaction_id SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN assigned_group_id     SET DEFAULT NULL;
ALTER TABLE support_ticket_attachments ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE support_ticket_attachments ALTER COLUMN uploaded_by SET DEFAULT NULL;
ALTER TABLE support_ticket_status_history ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE support_ticket_status_history ALTER COLUMN updated_by SET DEFAULT NULL;

-- ============================================================
-- 1. Seed ALL missing order_statuses
-- 2. Add assignment_status column if not present
-- 3. Add assigned_at, accepted_by_delivery_at columns
-- ============================================================
 
-- ── 1. Seed all order statuses ────────────────────────────────────────────────
INSERT INTO order_statuses (code, description, sort_order, is_terminal) VALUES
  ('pending',              'Order placed, awaiting laundry confirmation',     10, FALSE),
  ('confirmed',            'Confirmed by laundry provider',                   20, FALSE),
  ('assigned_for_pickup',  'Delivery partner assigned, going for pickup',      30, FALSE),
  ('picked_up',            'Items picked up from customer',                   40, FALSE),
  ('at_laundry',           'Bag dropped at laundry facility',                 50, FALSE),
  ('ready_for_delivery',   'Laundry done, ready for delivery',                60, FALSE),
  ('out_for_delivery',     'Delivery partner out for delivery',               70, FALSE),
  ('delivered',            'Delivered to customer',                           75, FALSE),
  ('completed',            'Order fully completed and closed',                80, TRUE),
  ('cancelled',            'Order cancelled',                                 90, TRUE),
  ('returned',             'Order returned to customer',                      95, TRUE)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order,
  is_terminal = EXCLUDED.is_terminal;
 
-- ── 2. assignment_status column on orders ────────────────────────────────────
-- Tracks delivery assignment separately from order lifecycle status
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(30) NOT NULL DEFAULT 'unassigned'
    CHECK (assignment_status IN (
      'unassigned',          -- no delivery partner yet
      'pending_acceptance',  -- visible to delivery partners, waiting for self-assign
      'assigned'             -- delivery partner accepted/assigned
    ));
 
-- ── 3. Timestamp columns ──────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_at               TIMESTAMPTZ,  -- when partner was assigned
  ADD COLUMN IF NOT EXISTS confirmed_at              TIMESTAMPTZ,  -- when laundry confirmed
  ADD COLUMN IF NOT EXISTS laundry_confirmed_by      BIGINT REFERENCES users(id) ON DELETE SET NULL;
 
ALTER TABLE orders
  ALTER COLUMN laundry_confirmed_by SET DEFAULT NULL;
 
-- ── 4. Index for delivery partner area matching ───────────────────────────────
-- delivery partners query open orders by pincode extracted from pickup_address
-- We store pickup_pincode separately for efficient querying
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pickup_pincode VARCHAR(10);
 
-- Backfill from existing orders if pickup_address contains pincode
-- (In production you'd parse this properly — for now leave NULL, set on new orders)
 
CREATE INDEX IF NOT EXISTS idx_orders_pickup_pincode_status
  ON orders (pickup_pincode, status, assignment_status)
  WHERE status = 'confirmed' AND assignment_status = 'pending_acceptance';
 
CREATE INDEX IF NOT EXISTS idx_orders_status_assignment
  ON orders (status, assignment_status);
 
CREATE INDEX IF NOT EXISTS idx_orders_laundry_profile
  ON orders (laundry_profile_id, status);
 
CREATE INDEX IF NOT EXISTS idx_orders_delivery_profile
  ON orders (delivery_profile_id, status);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_assignment_status_check;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_assignment_status_check1;
 
-- Add unified constraint covering all values
ALTER TABLE orders
  ADD CONSTRAINT orders_assignment_status_check
  CHECK (assignment_status IN (
    'unassigned',          -- no delivery partner yet
    'pending_acceptance',  -- confirmed by laundry, visible to delivery partners
    'assigned',            -- delivery partner self-assigned
    'auto_assigned',       -- system auto-assigned
    'manually_assigned',   -- admin manually assigned
    'self_claimed',        -- delivery partner self-claimed (legacy)
    'reassigned'           -- reassigned to a different partner
  ));

ALTER TABLE laundry_status_history
  DROP CONSTRAINT IF EXISTS laundry_status_history_to_status_fkey;
 
-- Drop FK on from_status as well (same issue — was NULL-able so didn't
-- error yet, but will as soon as a transition from 'confirmed' happens)
ALTER TABLE laundry_status_history
  DROP CONSTRAINT IF EXISTS laundry_status_history_from_status_fkey;

ALTER TABLE order_status_history ALTER COLUMN updated_by DROP NOT NULL;
ALTER TABLE order_status_history ALTER COLUMN updated_by SET DEFAULT NULL;
 
-- Also fix laundry_status_history.changed_by for the same reason
ALTER TABLE laundry_status_history ALTER COLUMN changed_by DROP NOT NULL;
ALTER TABLE laundry_status_history ALTER COLUMN changed_by SET DEFAULT NULL;
 