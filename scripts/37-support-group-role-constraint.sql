-- ============================================================
-- 37-support-group-role-constraint.sql
-- Enforce support_group_members.role at the DB level.
-- Was previously convention-only ('agent'/'lead', no CHECK) —
-- first prerequisite for the dynamic tab-permissions feature,
-- which keys grants off this exact role value.
-- ============================================================

ALTER TABLE support_group_members
  ADD CONSTRAINT support_group_members_role_check
  CHECK (role IN ('agent', 'lead'));
