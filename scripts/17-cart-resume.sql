-- ============================================================
-- 17-cart-resume.sql
-- Adds step-resume and idempotency columns to shopping_carts.
-- draft_order_number is generated when the cart is first created
-- and reused as the final order_number, making order creation
-- idempotent: retrying the same cart never creates a duplicate.
-- ============================================================

ALTER TABLE shopping_carts
  -- Which step the customer paused at (1-4)
  ADD COLUMN IF NOT EXISTS current_step    SMALLINT DEFAULT 1
    CHECK (current_step BETWEEN 1 AND 4),
  -- Selected laundry provider
  ADD COLUMN IF NOT EXISTS provider_id     BIGINT REFERENCES laundry_profiles(id) ON DELETE SET NULL,
  -- Selected pickup address
  ADD COLUMN IF NOT EXISTS address_id      INTEGER REFERENCES customer_addresses(id) ON DELETE SET NULL,
  -- Scheduled pickup info (saved at step 3)
  ADD COLUMN IF NOT EXISTS pickup_date     DATE,
  ADD COLUMN IF NOT EXISTS pickup_time_slot VARCHAR(20),
  -- Draft order number — generated once, reused on retries
  -- Format: ORD-XXXXXXXX (8 random uppercase alphanumerics)
  ADD COLUMN IF NOT EXISTS draft_order_number VARCHAR(50) UNIQUE;

-- Generate a draft order number for any existing carts that don't have one
UPDATE shopping_carts
SET draft_order_number = 'ORD-' || UPPER(
  SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT), 1, 8)
)
WHERE draft_order_number IS NULL;

-- Function: get or create draft order number for a cart
-- Called by the cart POST so the number is always available.
CREATE OR REPLACE FUNCTION ensure_draft_order_number(p_cart_id INTEGER)
RETURNS VARCHAR AS $$
DECLARE
  v_num VARCHAR(50);
BEGIN
  SELECT draft_order_number INTO v_num FROM shopping_carts WHERE id = p_cart_id;
  IF v_num IS NULL THEN
    -- Generate a collision-safe number using a loop
    LOOP
      v_num := 'ORD-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || p_cart_id::TEXT || NOW()::TEXT), 1, 8));
      BEGIN
        UPDATE shopping_carts SET draft_order_number = v_num WHERE id = p_cart_id;
        EXIT; -- success
      EXCEPTION WHEN unique_violation THEN
        -- retry with a new value
      END;
    END LOOP;
  END IF;
  RETURN v_num;
END;
$$ LANGUAGE plpgsql;

-- Index for fast lookup by draft_order_number (used in order creation idempotency check)
CREATE INDEX IF NOT EXISTS idx_shopping_carts_draft_order_number
  ON shopping_carts (draft_order_number)
  WHERE draft_order_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shopping_carts_provider
  ON shopping_carts (provider_id)
  WHERE provider_id IS NOT NULL;
