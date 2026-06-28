-- ============================================================
-- 19-loyalty.sql
-- 1. loyalty_points_ledger  — tracks every credit/debit with reason
-- 2. Trigger: auto-credit 1% of order amount on completion
-- 3. Function: redeem_loyalty_points(user_id, points_to_redeem)
--    Converts points → wallet credit (1 point = ₹1)
-- ============================================================

-- ---- Table --------------------------------------------------
CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
  id            SERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  kind          VARCHAR(10) NOT NULL CHECK (kind IN ('credit', 'debit')),
  -- Points amount (always positive; kind determines direction)
  points        INTEGER NOT NULL CHECK (points > 0),
  -- Running balance AFTER this transaction (maintained by application/trigger)
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason        VARCHAR(100) NOT NULL,  -- e.g. 'order_completion', 'redeemed_to_wallet', 'admin_adjustment'
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_user     ON loyalty_points_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_order    ON loyalty_points_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_kind     ON loyalty_points_ledger (user_id, kind);

-- ---- Auto-credit trigger ------------------------------------
-- When order transitions to completed/delivered:
--   points = FLOOR(1% of total_amount)  (minimum 1 point)
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION credit_loyalty_on_order_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_points      INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Only fire on transition INTO completed or delivered
  IF NEW.status NOT IN ('completed', 'delivered') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF OLD.status IN ('completed', 'delivered') THEN RETURN NEW; END IF;

  -- Calculate 1% of order amount, minimum 1 point
  v_points := GREATEST(1, FLOOR(NEW.total_amount * 0.01)::INTEGER);

  -- Update customer_profiles.loyalty_points and capture new balance
  UPDATE customer_profiles
    SET loyalty_points = loyalty_points + v_points
  WHERE user_id = NEW.customer_id
  RETURNING loyalty_points INTO v_new_balance;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Record in ledger
  INSERT INTO loyalty_points_ledger
    (user_id, order_id, kind, points, balance_after, reason, metadata)
  VALUES (
    NEW.customer_id, NEW.id, 'credit', v_points, v_new_balance,
    'order_completion',
    jsonb_build_object(
      'order_number', NEW.order_number,
      'order_amount', NEW.total_amount,
      'rate_percent', 1
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_loyalty_credit_on_completion ON orders;
CREATE TRIGGER trg_loyalty_credit_on_completion
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION credit_loyalty_on_order_completion();

-- ---- Redeem function ----------------------------------------
-- Converts loyalty_points to wallet balance.
-- 1 point = ₹1.  Minimum 100 points to redeem.
-- Returns JSONB: { success, redeemed_points, wallet_credited, new_balance, reason }
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION redeem_loyalty_points(
  p_user_id  BIGINT,
  p_points   INTEGER   -- must be <= current balance and >= 100
)
RETURNS JSONB AS $$
DECLARE
  v_current_points INTEGER;
  v_wallet_id      INTEGER;
  v_wallet_amount  NUMERIC(12,2);
  v_new_balance    INTEGER;
BEGIN
  -- Validate minimum
  IF p_points < 100 THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'minimum_100_points_required');
  END IF;

  -- Lock and read current balance
  SELECT loyalty_points INTO v_current_points
  FROM customer_profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'profile_not_found');
  END IF;

  IF v_current_points < p_points THEN
    RETURN jsonb_build_object('success', FALSE, 'reason', 'insufficient_points',
                              'current_balance', v_current_points);
  END IF;

  -- Deduct points
  v_new_balance := v_current_points - p_points;
  UPDATE customer_profiles SET loyalty_points = v_new_balance WHERE user_id = p_user_id;

  -- 1 point = ₹1
  v_wallet_amount := p_points::NUMERIC;

  -- Get or create wallet
  SELECT id INTO v_wallet_id FROM wallet_accounts
  WHERE user_id = p_user_id AND currency = 'INR';

  IF NOT FOUND THEN
    INSERT INTO wallet_accounts (user_id, currency, balance)
    VALUES (p_user_id, 'INR', 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet
  INSERT INTO wallet_transactions (wallet_id, kind, amount, reference, metadata)
  VALUES (
    v_wallet_id, 'credit', v_wallet_amount,
    'Loyalty points redeemed',
    jsonb_build_object('points_redeemed', p_points, 'user_id', p_user_id)
  );

  UPDATE wallet_accounts SET balance = balance + v_wallet_amount WHERE id = v_wallet_id;

  -- Record debit in loyalty ledger
  INSERT INTO loyalty_points_ledger
    (user_id, order_id, kind, points, balance_after, reason, metadata)
  VALUES (
    p_user_id, NULL, 'debit', p_points, v_new_balance,
    'redeemed_to_wallet',
    jsonb_build_object('wallet_credited', v_wallet_amount)
  );

  RETURN jsonb_build_object(
    'success',          TRUE,
    'redeemed_points',  p_points,
    'wallet_credited',  v_wallet_amount,
    'new_balance',      v_new_balance
  );
END;
$$ LANGUAGE plpgsql;

Alter table wallet_transactions alter column order_id drop default;
drop sequence if exists wallet_transactions_order_id_seq;
alter table wallet_transactions alter column order_id type BIGINT;
alter table wallet_transactions alter column order_id drop not null;