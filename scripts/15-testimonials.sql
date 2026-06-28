-- ============================================================
-- 15-testimonials.sql
-- Platform-level testimonials for the landing page.
-- Separate from the order-specific `reviews` table because:
--  1. Landing page needs curated, admin-approved content
--  2. Reviews require order context; testimonials are standalone
--  3. We may show testimonials from beta users, team picks, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_testimonials (
  id           SERIAL PRIMARY KEY,
  display_name VARCHAR(100)  NOT NULL,          -- e.g., "Rohan P."
  role         VARCHAR(100),                    -- e.g., "Working Professional, Pune"
  avatar_url   VARCHAR(500),                    -- optional S3 key or null
  content      TEXT          NOT NULL,
  rating       SMALLINT      NOT NULL DEFAULT 5
    CHECK (rating BETWEEN 1 AND 5),
  is_featured  BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order   INTEGER       NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_testimonials_active
  ON platform_testimonials (is_active, sort_order);

DROP TRIGGER IF EXISTS trg_testimonials_updated_at ON platform_testimonials;
CREATE TRIGGER trg_testimonials_updated_at
  BEFORE UPDATE ON platform_testimonials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Seed 7 testimonials (admin can add/edit more via admin panel)
-- ============================================================
INSERT INTO platform_testimonials
  (display_name, role, content, rating, is_featured, sort_order)
VALUES
  (
    'Rohan P.',
    'Software Engineer, Hinjewadi',
    'Pickup was exactly on time and my clothes came back looking absolutely brand new. The ironing was perfect — even my dress shirts were crisp. Super convenient for a busy work week.',
    5, TRUE, 10
  ),
  (
    'Sneha K.',
    'Working Professional, Baner',
    'No more weekend laundry stress. The app is incredibly smooth and the delivery partner was professional and on time. My sarees were returned beautifully folded. Worth every rupee.',
    5, TRUE, 20
  ),
  (
    'Amit S.',
    'Father of Two, Wakad',
    'Affordable, fast, and my shirts were perfectly pressed. Even handled the kids'' sports clothes and got all the stains out. Highly recommend to any family!',
    5, TRUE, 30
  ),
  (
    'Priya M.',
    'MBA Student, Pimpri',
    'Loved the freshness and packaging. For a hostel student managing coursework, this is an absolute lifesaver. Clothes smell amazing and the process is hassle-free.',
    5, FALSE, 40
  ),
  (
    'Vikram R.',
    'Business Owner, Nigdi',
    'Great for last-minute laundry before client meetings. They handled my suits and formal wear with absolute care — no damage, no shrinkage, delivered ahead of time.',
    5, FALSE, 50
  ),
  (
    'Ananya T.',
    'Interior Designer, Aundh',
    'Got my curtains and heavy linens cleaned — they did an exceptional job. The team was responsive and the quality check before delivery gave me confidence. 10 out of 10.',
    5, FALSE, 60
  ),
  (
    'Kiran B.',
    'Teacher, Akurdi',
    'Used the express service for my daughter''s school uniform emergency. Ready in 8 hours! The responsiveness of the team and care for clothes is unmatched in the area.',
    5, FALSE, 70
  )
ON CONFLICT DO NOTHING;

-- ============================================================
-- Home stats view — single row with all four platform metrics.
-- Called by /api/customer/public/home-data for the Stats section.
-- success_rate = completed / (completed + cancelled), 2dp.
-- ============================================================
CREATE OR REPLACE VIEW home_platform_stats AS
SELECT
  -- Total registered users across ALL roles (customers, providers, delivery, etc.)
  (SELECT COUNT(*)::BIGINT FROM users WHERE deleted_at IS NULL AND status = 'active')
    AS total_users,

  -- Monthly orders: placed in the current calendar month
  (SELECT COUNT(*)::BIGINT FROM orders
   WHERE created_at >= date_trunc('month', NOW()))
    AS monthly_orders,

  -- Success rate: delivered + completed vs total closed (delivered + completed + cancelled)
  -- Returns a value 0-100 (e.g., 99.2). NULL-safe — returns 100 if no terminal orders yet.
  (
    SELECT COALESCE(
      ROUND(
        100.0 * COUNT(*) FILTER (
          WHERE status IN ('delivered', 'completed')
        ) / NULLIF(COUNT(*) FILTER (
          WHERE status IN ('delivered', 'completed', 'cancelled')
        ), 0),
        1
      ),
      100.0
    )
    FROM orders
  ) AS success_rate,

  -- Active verified laundry partners
  (SELECT COUNT(*)::BIGINT FROM laundry_profiles
   WHERE status = 'active' AND is_verified = TRUE)
    AS partner_count;
