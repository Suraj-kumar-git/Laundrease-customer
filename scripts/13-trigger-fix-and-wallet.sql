-- ============================================================
-- 13-trigger-fix-and-wallet.sql
-- 1. Fix log_order_status_change() — stop using hardcoded ID 186,
--    use current_setting safely with a NULL fallback
-- 2. Fix order_status_history.updated_by BIGSERIAL → BIGINT
-- 3. Wallet balance ledger view + helper functions
-- ============================================================

-- ============================================================
-- PART 1: Fix order_status_history.updated_by BIGSERIAL bug
-- (Same root cause as delivery_profile_id — BIGSERIAL auto-fills sequence)
-- ============================================================
ALTER TABLE order_status_history ALTER COLUMN updated_by SET DEFAULT NULL;

-- ============================================================
-- PART 2: Fix log_order_status_change() trigger function
-- Strategy: read app.current_user_id session variable safely.
-- If not set (e.g. called from a background job or migration),
-- updated_by stays NULL — which is valid per our schema.
-- ============================================================
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id BIGINT;
BEGIN
  -- Safely read the session variable — returns NULL if not set,
  -- never raises an exception.
  BEGIN
    v_user_id := nullif(
      current_setting('app.current_user_id', TRUE),  -- TRUE = missing_ok
      ''
    )::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO order_status_history (order_id, status, notes, created_at, updated_by)
    VALUES (NEW.id, NEW.status, 'initial', NOW(), v_user_id);

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO order_status_history (order_id, status, notes, created_at, updated_by)
    VALUES (NEW.id, NEW.status, NULL, NOW(), v_user_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 3: Fix ALL other trigger functions that used hardcoded IDs
-- or relied on current_setting without missing_ok
-- ============================================================

-- log_laundry_status_change also has similar issue — it references
-- NEW.updated_by which doesn't exist on orders table
CREATE OR REPLACE FUNCTION log_laundry_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id BIGINT;
BEGIN
  BEGIN
    v_user_id := nullif(current_setting('app.current_user_id', TRUE), '')::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  -- orders table doesn't have laundry_status; this trigger fires on status change
  -- It logs to laundry_status_history using the order status
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO laundry_status_history (order_id, from_status, to_status, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, v_user_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 4: Wallet — ensure wallet_accounts row exists for new users
-- Add a function to auto-create a wallet for a user if missing
-- ============================================================

CREATE OR REPLACE FUNCTION ensure_wallet_exists(p_user_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  v_wallet_id INTEGER;
BEGIN
  SELECT id INTO v_wallet_id
  FROM wallet_accounts WHERE user_id = p_user_id AND currency = 'INR';

  IF NOT FOUND THEN
    INSERT INTO wallet_accounts (user_id, currency, balance)
    VALUES (p_user_id, 'INR', 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  RETURN v_wallet_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PART 5: Wallet balance — ledger-driven computed balance
-- The cached balance column stays but we always compute from transactions
-- ============================================================

CREATE OR REPLACE FUNCTION get_wallet_balance(p_user_id BIGINT)
RETURNS NUMERIC(12,2) AS $$
DECLARE
  v_balance NUMERIC(12,2);
BEGIN
  SELECT COALESCE(
    SUM(CASE WHEN kind = 'credit' THEN amount ELSE -amount END), 0
  ) INTO v_balance
  FROM wallet_transactions wt
  JOIN wallet_accounts wa ON wa.id = wt.wallet_id
  WHERE wa.user_id = p_user_id AND wa.currency = 'INR';

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql STABLE;

-- Keep cached balance in sync via trigger
CREATE OR REPLACE FUNCTION sync_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE wallet_accounts
  SET balance = get_wallet_balance(
    (SELECT user_id FROM wallet_accounts WHERE id = COALESCE(NEW.wallet_id, OLD.wallet_id))
  ),
  updated_at = NOW()
  WHERE id = COALESCE(NEW.wallet_id, OLD.wallet_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_wallet_balance ON wallet_transactions;
CREATE TRIGGER trg_sync_wallet_balance
  AFTER INSERT OR UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION sync_wallet_balance();

-- ============================================================
-- PART 6: Wallet debit function for order payment
-- Atomically debits wallet, creates transaction record,
-- links to payments table
-- Returns: wallet_transaction_id or raises exception
-- ============================================================

CREATE OR REPLACE FUNCTION wallet_debit_for_order(
  p_user_id      BIGINT,
  p_order_id     BIGINT,
  p_amount       NUMERIC(12,2),
  p_reference    TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_wallet_id         INTEGER;
  v_current_balance   NUMERIC(12,2);
  v_wallet_txn_id     INTEGER;
BEGIN
  -- Get wallet with row lock
  SELECT id INTO v_wallet_id
  FROM wallet_accounts
  WHERE user_id = p_user_id AND currency = 'INR'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  -- Compute ledger balance
  v_current_balance := get_wallet_balance(p_user_id);

  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE';
  END IF;

  -- Debit transaction
  INSERT INTO wallet_transactions (wallet_id, order_id, kind, amount, reference, metadata)
  VALUES (
    v_wallet_id, p_order_id, 'debit', p_amount,
    COALESCE(p_reference, 'Order payment'),
    jsonb_build_object('order_id', p_order_id, 'type', 'order_payment')
  )
  RETURNING id INTO v_wallet_txn_id;

  RETURN v_wallet_txn_id;
END;
$$ LANGUAGE plpgsql;
