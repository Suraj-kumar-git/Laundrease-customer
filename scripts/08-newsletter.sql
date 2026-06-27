-- ============================================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================================

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id            SERIAL PRIMARY KEY,
  email         CITEXT NOT NULL UNIQUE,          -- case-insensitive dedup
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'unsubscribed')),
  -- Source tracking (footer form, checkout upsell, etc.)
  source        VARCHAR(50) NOT NULL DEFAULT 'footer',
  -- Unsubscribe token — pre-generated so we can embed in emails later
  unsubscribe_token  VARCHAR(64) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Timestamps
  subscribed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at    TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Consistency guard
  CONSTRAINT chk_unsub_timestamp CHECK (
    (status = 'unsubscribed' AND unsubscribed_at IS NOT NULL)
    OR (status = 'active' AND unsubscribed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_newsletter_status
  ON newsletter_subscribers (status);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribed_at
  ON newsletter_subscribers (subscribed_at DESC);

CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON newsletter_subscribers (unsubscribe_token);

-- Auto updated_at
DROP TRIGGER IF EXISTS trg_newsletter_updated_at ON newsletter_subscribers;
CREATE TRIGGER trg_newsletter_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
