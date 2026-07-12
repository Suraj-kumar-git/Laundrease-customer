-- ============================================================
-- 38-support-tab-grants.sql
-- Admin-configurable tab grants for support groups — lets an admin
-- expose specific admin-only tabs (see lib/support-tab-registry.ts)
-- to a support group's agents (read-only) and/or leads (read+write).
--
-- Seeded with the 3 tabs that were previously hardcoded as
-- Operations-lead-only (Cash Ledger, SAC Codes, Item Reports) so
-- existing support behavior is unchanged by default.
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tab_grants (
  group_id    INTEGER      NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  role        VARCHAR(50)  NOT NULL CHECK (role IN ('agent', 'lead')),
  tab_key     VARCHAR(100) NOT NULL,  -- must match a key in lib/support-tab-registry.ts
  granted_by  BIGINT       REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, role, tab_key)
);

CREATE INDEX IF NOT EXISTS idx_support_tab_grants_tab_key
  ON support_tab_grants (tab_key);

-- Seed: fold the 3 existing hardcoded Operations-lead-only tabs into the
-- new dynamic system, lead-only (agents get nothing new) — matches today's
-- behavior exactly (see app/support/_config/nav.ts leadOfGroup: 'Operations').
INSERT INTO support_tab_grants (group_id, role, tab_key)
SELECT sg.id, 'lead', tab.key
FROM support_groups sg
CROSS JOIN (VALUES ('cash-ledger'), ('sac-codes'), ('item-reports')) AS tab(key)
WHERE sg.name = 'Operations'
ON CONFLICT (group_id, role, tab_key) DO NOTHING;
