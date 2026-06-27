-- ============================================================
-- 16-ratings.sql
-- 1. DB function to atomically recalculate weighted ratings after a review
-- 2. Trigger that fires after INSERT/UPDATE on reviews
-- ============================================================

-- ============================================================
-- Function: recalculate_profile_ratings(order_id)
-- Called after a review is inserted/updated.
-- Recomputes rating = weighted average across all published reviews.
-- Uses ROUND(..., 2) to stay within NUMERIC(3,2).
-- ============================================================
CREATE OR REPLACE FUNCTION recalculate_profile_ratings(p_order_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_laundry_id  BIGINT;
  v_delivery_id BIGINT;
BEGIN
  -- Get profile IDs from the order
  SELECT laundry_profile_id, delivery_profile_id
    INTO v_laundry_id, v_delivery_id
  FROM orders WHERE id = p_order_id;

  -- Recalculate laundry provider rating (uses service_rating)
  IF v_laundry_id IS NOT NULL THEN
    UPDATE laundry_profiles SET
      rating = COALESCE((
        SELECT ROUND(AVG(service_rating)::NUMERIC, 2)
        FROM reviews
        WHERE laundry_profile_id = v_laundry_id
          AND service_rating IS NOT NULL
          AND status = 'published'
      ), 0.00),
      rating_count = COALESCE((
        SELECT COUNT(*)
        FROM reviews
        WHERE laundry_profile_id = v_laundry_id
          AND service_rating IS NOT NULL
          AND status = 'published'
      ), 0)
    WHERE id = v_laundry_id;
  END IF;

  -- Recalculate delivery partner rating (uses delivery_rating)
  IF v_delivery_id IS NOT NULL THEN
    UPDATE delivery_profiles SET
      rating = COALESCE((
        SELECT ROUND(AVG(delivery_rating)::NUMERIC, 2)
        FROM reviews
        WHERE delivery_profile_id = v_delivery_id
          AND delivery_rating IS NOT NULL
          AND status = 'published'
      ), 0.00),
      rating_count = COALESCE((
        SELECT COUNT(*)
        FROM reviews
        WHERE delivery_profile_id = v_delivery_id
          AND delivery_rating IS NOT NULL
          AND status = 'published'
      ), 0)
    WHERE id = v_delivery_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger: fire after review insert or update
-- ============================================================
CREATE OR REPLACE FUNCTION trg_recalculate_ratings()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM recalculate_profile_ratings(
    CASE TG_OP WHEN 'DELETE' THEN OLD.order_id ELSE NEW.order_id END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reviews_recalc_ratings ON reviews;
CREATE TRIGGER trg_reviews_recalc_ratings
  AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION trg_recalculate_ratings();

-- ============================================================
-- Add role column to platform_testimonials if missing
-- (stores customer's profession/role — optional)
-- ============================================================
ALTER TABLE platform_testimonials
  ADD COLUMN IF NOT EXISTS recommendation_score SMALLINT
    CHECK (recommendation_score BETWEEN 1 AND 10);
