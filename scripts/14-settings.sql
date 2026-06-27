-- ============================================================
-- 14-settings.sql
-- Notification preferences stored as normalized rows.
-- One row per (customer_profile_id, category, channel).
-- This is better than JSONB for: filtering, auditing, defaults,
-- and future per-category controls (e.g. quiet hours).
-- customer_profiles.preferences JSONB remains for misc future
-- use (UI theme, language, etc.) — not duplicated here.
-- ============================================================

-- Enum-like check for channels we support
-- (email | sms | push) — extensible if we add in-app later

CREATE TABLE IF NOT EXISTS customer_notification_preferences (
  id                  SERIAL PRIMARY KEY,
  customer_profile_id BIGINT NOT NULL
    REFERENCES customer_profiles(id) ON DELETE CASCADE,
  -- Notification category matches UI: orders, promotions,
  -- referrals, security, reminders
  category            VARCHAR(30) NOT NULL
    CHECK (category IN ('orders', 'promotions', 'referrals', 'security', 'reminders')),
  -- Delivery channel
  channel             VARCHAR(10) NOT NULL
    CHECK (channel IN ('email', 'sms', 'push')),
  -- Whether this category+channel combo is enabled
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One row per (profile, category, channel)
  CONSTRAINT uq_notif_pref UNIQUE (customer_profile_id, category, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_pref_profile
  ON customer_notification_preferences (customer_profile_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_notif_pref_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notif_pref_updated_at ON customer_notification_preferences;
CREATE TRIGGER trg_notif_pref_updated_at
  BEFORE UPDATE ON customer_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION set_notif_pref_updated_at();

-- ============================================================
-- Helper function: get preferences for a customer, filling
-- in defaults for any missing rows so the UI always has all
-- 15 combinations (5 categories × 3 channels).
-- Default values per category × channel (business rules):
--   orders     → email=T, sms=T, push=T  (critical)
--   promotions → email=T, sms=F, push=T
--   referrals  → email=T, sms=F, push=T
--   security   → email=T, sms=T, push=T  (cannot be disabled — enforced in API)
--   reminders  → email=F, sms=T, push=T
-- ============================================================

CREATE OR REPLACE FUNCTION get_notification_preferences(p_profile_id BIGINT)
RETURNS TABLE (
  category  VARCHAR,
  channel   VARCHAR,
  enabled   BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH defaults (category, channel, default_enabled) AS (
    VALUES
      ('orders',     'email', TRUE),
      ('orders',     'sms',   TRUE),
      ('orders',     'push',  TRUE),
      ('promotions', 'email', TRUE),
      ('promotions', 'sms',   FALSE),
      ('promotions', 'push',  TRUE),
      ('referrals',  'email', TRUE),
      ('referrals',  'sms',   FALSE),
      ('referrals',  'push',  TRUE),
      ('security',   'email', TRUE),
      ('security',   'sms',   TRUE),
      ('security',   'push',  TRUE),
      ('reminders',  'email', FALSE),
      ('reminders',  'sms',   TRUE),
      ('reminders',  'push',  TRUE)
  )
  SELECT
    d.category::VARCHAR,
    d.channel::VARCHAR,
    COALESCE(np.enabled, d.default_enabled) AS enabled
  FROM defaults d
  LEFT JOIN customer_notification_preferences np
    ON np.customer_profile_id = p_profile_id
   AND np.category = d.category
   AND np.channel  = d.channel
  ORDER BY
    CASE d.category
      WHEN 'orders'     THEN 1
      WHEN 'promotions' THEN 2
      WHEN 'referrals'  THEN 3
      WHEN 'security'   THEN 4
      WHEN 'reminders'  THEN 5
    END,
    CASE d.channel
      WHEN 'email' THEN 1
      WHEN 'sms'   THEN 2
      WHEN 'push'  THEN 3
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- Upsert function: write all 15 preference rows atomically.
-- Ignores attempts to disable 'security' channel — always kept
-- enabled. Call this from the API instead of raw INSERTs.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_notification_preferences(
  p_profile_id BIGINT,
  p_prefs      JSONB  -- [{ category, channel, enabled }]
)
RETURNS VOID AS $$
DECLARE
  pref JSONB;
BEGIN
  FOR pref IN SELECT * FROM jsonb_array_elements(p_prefs)
  LOOP
    -- Security alerts are always on — silently enforce
    IF (pref->>'category') = 'security' THEN
      INSERT INTO customer_notification_preferences
        (customer_profile_id, category, channel, enabled)
      VALUES
        (p_profile_id, pref->>'category', pref->>'channel', TRUE)
      ON CONFLICT (customer_profile_id, category, channel)
      DO UPDATE SET enabled = TRUE;
    ELSE
      INSERT INTO customer_notification_preferences
        (customer_profile_id, category, channel, enabled)
      VALUES
        (p_profile_id, pref->>'category', pref->>'channel',
         (pref->>'enabled')::BOOLEAN)
      ON CONFLICT (customer_profile_id, category, channel)
      DO UPDATE SET enabled = (EXCLUDED.enabled);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
