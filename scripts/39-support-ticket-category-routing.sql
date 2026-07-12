-- ============================================================
-- 39-support-ticket-category-routing.sql
-- Admin-configurable ticket auto-routing: which support group a newly
-- created ticket's assigned_group_id resolves to, based on category,
-- sub-category (keyword match), and reporter role.
--
-- Replaces the hardcoded resolveGroupName() in lib/support-routing.ts —
-- seeded here with the exact same rules so behavior is unchanged by
-- default. lib/support-routing.ts is rewritten in the next step to read
-- from this table instead.
--
-- Matching: a rule matches a ticket when every non-NULL column on the
-- rule is satisfied — NULL means "any". sub_category_keyword is a
-- case-insensitive substring match against the ticket's sub_category.
--
-- Specificity (which rule wins when several match): category and
-- sub_category_keyword matches always outrank a reporter_role-only
-- match, mirroring the original code's category-first if/else chain
-- (e.g. a laundry-reported 'technical' ticket must still land in
-- Tier 2 - Technical, not Operations, even though laundry is a partner
-- role that would otherwise fall back to Operations). The resolver
-- (lib/support-routing.ts) computes this via a weighted specificity
-- score: category match = 100, sub_category_keyword match = 10,
-- reporter_role match = 1 — highest score wins, ties broken by id ASC.
--
-- No natural composite unique key exists here (NULL columns mean
-- "any", and NULL <> NULL for uniqueness purposes), so the seed below
-- uses WHERE NOT EXISTS guards rather than ON CONFLICT to stay
-- idempotent if this script is ever re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_ticket_category_routing (
  id                    SERIAL PRIMARY KEY,
  category              VARCHAR(30) REFERENCES support_ticket_categories(code) ON DELETE CASCADE,
  reporter_role         VARCHAR(20) CHECK (reporter_role IS NULL OR reporter_role IN ('customer', 'laundry', 'delivery', 'support', 'admin')),
  sub_category_keyword  VARCHAR(100),
  group_id              INTEGER NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_category_routing_category
  ON support_ticket_category_routing (category);

-- ── Seed: exact mirror of lib/support-routing.ts's resolveGroupName() ──

-- 1. Any 'technical' ticket → Tier 2 - Technical (first line; escalated
--    to Tier 3 manually by a lead, not auto-routed there).
INSERT INTO support_ticket_category_routing (category, group_id)
SELECT 'technical', sg.id
FROM support_groups sg
WHERE sg.name = 'Tier 2 - Technical'
  AND NOT EXISTS (
    SELECT 1 FROM support_ticket_category_routing
    WHERE category = 'technical' AND reporter_role IS NULL AND sub_category_keyword IS NULL
  );

-- 2. Any 'wallet' ticket → Tier 2 - Billing (refunds, payouts, billing disputes).
INSERT INTO support_ticket_category_routing (category, group_id)
SELECT 'wallet', sg.id
FROM support_groups sg
WHERE sg.name = 'Tier 2 - Billing'
  AND NOT EXISTS (
    SELECT 1 FROM support_ticket_category_routing
    WHERE category = 'wallet' AND reporter_role IS NULL AND sub_category_keyword IS NULL
  );

-- 3. 'order' + a damage/quality/loss sub-category → Operations, regardless
--    of who reported it (a fulfilment issue, not generic triage).
INSERT INTO support_ticket_category_routing (category, sub_category_keyword, group_id)
SELECT 'order', kw.keyword, sg.id
FROM support_groups sg
CROSS JOIN (VALUES
  ('damaged'), ('lost'), ('quality issue'),
  ('wrong item'), ('missing item'), ('wrong items returned')
) AS kw(keyword)
WHERE sg.name = 'Operations'
  AND NOT EXISTS (
    SELECT 1 FROM support_ticket_category_routing
    WHERE category = 'order' AND reporter_role IS NULL AND sub_category_keyword = kw.keyword
  );

-- 4. Any other ticket reported by a partner (laundry/delivery) → Operations.
INSERT INTO support_ticket_category_routing (reporter_role, group_id)
SELECT r.role, sg.id
FROM support_groups sg
CROSS JOIN (VALUES ('laundry'), ('delivery')) AS r(role)
WHERE sg.name = 'Operations'
  AND NOT EXISTS (
    SELECT 1 FROM support_ticket_category_routing
    WHERE category IS NULL AND reporter_role = r.role AND sub_category_keyword IS NULL
  );

-- 5. Default fallback (customer, or any other reporter, on any remaining
--    category) → Tier 1 - General.
INSERT INTO support_ticket_category_routing (group_id)
SELECT sg.id
FROM support_groups sg
WHERE sg.name = 'Tier 1 - General'
  AND NOT EXISTS (
    SELECT 1 FROM support_ticket_category_routing
    WHERE category IS NULL AND reporter_role IS NULL AND sub_category_keyword IS NULL
  );
