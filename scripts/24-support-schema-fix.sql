-- ============================================================
-- 28-support-schema-fix.sql
--
-- 1. Rename support_tickets.customer_id → reporter_id
--    (tickets can come from any role: customer, laundry,
--     delivery, support, admin)
-- 2. Add reporter_role column to track who raised the ticket
-- 3. Add display_name + icon + sort_order to support_ticket_categories
--    (so categories are fully admin-manageable from DB)
-- 4. Add sub_categories JSONB to support_ticket_categories
--    (each category can define its own sub-category options)
-- 5. Seed all lookup tables: statuses, priorities, categories, tags
-- 6. Update all indexes that reference customer_id
-- 7. Fix on_support_comment_insert() trigger which references customer_id
-- ============================================================

-- ============================================================
-- 1. Rename customer_id → reporter_id
-- ============================================================

-- Drop dependent indexes first
DROP INDEX IF EXISTS idx_support_tickets_customer;

-- Rename the column
ALTER TABLE support_tickets
  RENAME COLUMN customer_id TO reporter_id;

-- Add reporter_role to track which portal raised the ticket
ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS reporter_role VARCHAR(30) NOT NULL DEFAULT 'customer'
    CHECK (reporter_role IN ('customer', 'laundry', 'delivery', 'support', 'admin'));

-- Recreate index with new name
CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter
  ON support_tickets (reporter_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_reporter_role
  ON support_tickets (reporter_role);

-- ============================================================
-- 2. Enhance support_ticket_categories
-- ============================================================

ALTER TABLE support_ticket_categories
  ADD COLUMN IF NOT EXISTS display_name  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS icon          VARCHAR(10) DEFAULT '💬',
  ADD COLUMN IF NOT EXISTS description   TEXT,
  -- JSONB array of sub-category strings per category
  -- e.g. ["Order not showing", "Wrong items", "Unable to update status"]
  ADD COLUMN IF NOT EXISTS sub_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Which roles can use this category
  -- NULL = all roles | array of role strings = restricted
  ADD COLUMN IF NOT EXISTS allowed_roles  JSONB DEFAULT NULL,
  -- Default priority when this category is selected
  ADD COLUMN IF NOT EXISTS default_priority VARCHAR(20)
    REFERENCES support_ticket_priorities(code) ON UPDATE RESTRICT,
  ADD COLUMN IF NOT EXISTS sort_order    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- 3. Fix trigger: on_support_comment_insert references old column name
-- ============================================================

CREATE OR REPLACE FUNCTION on_support_comment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_reporter_id   BIGINT;
  v_first_due     TIMESTAMPTZ;
  v_resolution_due TIMESTAMPTZ;
  v_resolved_at   TIMESTAMPTZ;
  v_first_response TIMESTAMPTZ;
BEGIN
  SELECT reporter_id, first_response_due_at, resolution_due_at, resolved_at, first_response_at
    INTO v_reporter_id, v_first_due, v_resolution_due, v_resolved_at, v_first_response
  FROM support_tickets
  WHERE id = NEW.ticket_id
  FOR UPDATE;

  UPDATE support_tickets
     SET last_response_at = NOW(),
         first_response_at = CASE
           WHEN v_first_response IS NULL
            AND NEW.author_user_id <> v_reporter_id THEN NOW()
           ELSE first_response_at
         END
   WHERE id = NEW.ticket_id;

  -- Re-evaluate SLA breach
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

-- ============================================================
-- 4. Seed support_ticket_statuses
-- ============================================================

INSERT INTO support_ticket_statuses (code, description, sort_order, is_terminal) VALUES
  ('open',        'Newly created, awaiting assignment',       10, FALSE),
  ('in_progress', 'Assigned and being actively worked on',    20, FALSE),
  ('hold',        'Waiting on customer/provider response',    30, FALSE),
  ('resolved',    'Issue resolved, awaiting confirmation',    40, FALSE),
  ('closed',      'Fully closed — no further action needed',  50, TRUE),
  ('reopened',    'Previously closed, reopened by reporter',  60, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 5. Seed support_ticket_priorities (with SLA targets)
-- ============================================================

INSERT INTO support_ticket_priorities
  (code, description, sort_order, first_response_sla_minutes, resolution_sla_minutes)
VALUES
  ('urgent', 'Critical — immediate attention required',  10,   30,   240),
  ('high',   'High impact — respond within 2 hours',     20,  120,   480),
  ('medium', 'Standard — respond within 8 hours',        30,  480,  1440),
  ('low',    'Low impact — respond within 24 hours',     40, 1440,  2880)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 6. Seed support_ticket_categories (fully rich — with icons,
--    sub-categories, allowed roles, default priority)
-- ============================================================

INSERT INTO support_ticket_categories
  (code, display_name, icon, description, sub_categories, allowed_roles, default_priority, sort_order, is_active)
VALUES
  (
    'order',
    'Order Issue',
    '📦',
    'Problems with a specific laundry order',
    '["Order not showing in dashboard","Customer cancelled after I started processing","Wrong items in the order","Unable to update order status","Order assigned by mistake","Pickup not happened","Delivery issue","Item damaged or lost","Other order issue"]'::jsonb,
    NULL,   -- all roles
    'high',
    10,
    TRUE
  ),
  (
    'technical',
    'App / Technical',
    '🛠️',
    'Login problems, dashboard errors, app crashes',
    '["Cannot log in","Dashboard not loading","Status update not saving","App crashing or freezing","Notifications not working","Data showing incorrectly","Other technical issue"]'::jsonb,
    NULL,
    'medium',
    20,
    TRUE
  ),
  (
    'account',
    'Account & Profile',
    '👤',
    'Account verification, profile details, access issues',
    '["Profile approval delay","Want to update registered phone","Account suspended or blocked","Profile details incorrect","Want to close account","Verification document issue","Other account issue"]'::jsonb,
    NULL,
    'medium',
    30,
    TRUE
  ),
  (
    'wallet',
    'Payments & Earnings',
    '💰',
    'Commission, payouts, refunds, billing queries',
    '["Commission deducted incorrectly","Payout not received","Subscription charge issue","Invoice or receipt needed","Refund not processed","Bank account update","Other payment issue"]'::jsonb,
    '["laundry","delivery","admin"]'::jsonb,
    'high',
    40,
    TRUE
  ),
  (
    'coupon',
    'Coupon / Discount',
    '🎟️',
    'Coupon not applied, discount issues',
    '["Coupon not working","Wrong discount applied","Coupon expired early","Referral reward missing","Other coupon issue"]'::jsonb,
    '["customer"]'::jsonb,
    'low',
    50,
    TRUE
  ),
  (
    'other',
    'General / Other',
    '💬',
    'Subscriptions, suggestions, anything not covered above',
    '["Subscription query","Feature request","General question","Partnership inquiry","Other"]'::jsonb,
    NULL,
    'low',
    60,
    TRUE
  )
ON CONFLICT (code) DO UPDATE SET
  display_name    = EXCLUDED.display_name,
  icon            = EXCLUDED.icon,
  description     = EXCLUDED.description,
  sub_categories  = EXCLUDED.sub_categories,
  allowed_roles   = EXCLUDED.allowed_roles,
  default_priority= EXCLUDED.default_priority,
  sort_order      = EXCLUDED.sort_order,
  is_active       = EXCLUDED.is_active;

-- ============================================================
-- 7. Seed support_tags (common tags agents use to classify tickets)
-- ============================================================

INSERT INTO support_tags (name) VALUES
  ('urgent-follow-up'),
  ('compensation-needed'),
  ('bug-report'),
  ('feature-request'),
  ('duplicate'),
  ('awaiting-evidence'),
  ('escalated'),
  ('billing'),
  ('first-time-user'),
  ('high-value-partner'),
  ('repeat-issue'),
  ('resolved-quickly')
ON CONFLICT (name) DO NOTHING;

-- Fix all BIGSERIAL nullable FK columns in support_tickets
ALTER TABLE support_tickets ALTER COLUMN assigned_to           SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN order_id              SET DEFAULT NULL;
ALTER TABLE support_tickets ALTER COLUMN wallet_transaction_id SET DEFAULT NULL;
 
-- Fix related tables too if not already done
ALTER TABLE support_ticket_attachments ALTER COLUMN uploaded_by    SET DEFAULT NULL;
ALTER TABLE support_ticket_status_history ALTER COLUMN updated_by  SET DEFAULT NULL;
ALTER TABLE support_ticket_comments ALTER COLUMN author_user_id    SET DEFAULT NULL;

-- ============================================================
-- 8. Verify
-- ============================================================
-- SELECT column_name FROM information_schema.columns
-- WHERE table_name = 'support_tickets'
-- ORDER BY ordinal_position;
--
-- SELECT code, display_name, icon, default_priority, sort_order
-- FROM support_ticket_categories ORDER BY sort_order;
