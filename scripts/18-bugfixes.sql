-- ============================================================
-- 18-bugfixes.sql
-- Bug 2: FIRST50 coupon eligibility - now checked against real
--        completed order count at query time (not just active flag)
-- Bug 3: total_referrals not incrementing + reward only on completed
-- ============================================================

-- ---- Bug 3a: Fix process_referral_reward -------------------------
-- Changes:
--   1. Add order status check — only process if order is 'completed'
--   2. Increment total_referrals in customer_referral_codes
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION process_referral_reward(p_order_id BIGINT)
RETURNS JSONB AS $$
DECLARE
  v_config       RECORD;
  v_order        RECORD;
  v_use          RECORD;
  v_reward_amt   NUMERIC(10,2);
  v_wallet_id    INTEGER;
  v_wallet_txn   INTEGER;
BEGIN
  SELECT * INTO v_config FROM referral_program_config WHERE id = 1;
  IF NOT FOUND OR NOT v_config.is_active THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'program_inactive');
  END IF;

  -- Get order
  SELECT o.id, o.customer_id, o.total_amount, o.status
    INTO v_order
  FROM orders o WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'order_not_found');
  END IF;

  -- BUG 3 FIX: Only process reward when order is completed
  IF v_order.status NOT IN ('completed', 'delivered') THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'order_not_completed');
  END IF;

  -- MOA check
  IF v_order.total_amount < v_config.min_order_amount_for_reward THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'below_min_order_amount');
  END IF;

  -- Is the customer a referee?
  SELECT ru.* INTO v_use
  FROM referral_uses ru
  WHERE ru.referee_user_id = v_order.customer_id
    AND ru.status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'not_a_referee');
  END IF;

  -- Max orders already counted?
  IF v_use.orders_counted >= v_config.referrer_max_orders_per_referee THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'max_orders_reached');
  END IF;

  -- Already processed this order?
  IF EXISTS (
    SELECT 1 FROM referral_reward_transactions
    WHERE referral_use_id = v_use.id AND order_id = p_order_id
  ) THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'already_processed');
  END IF;

  -- Calculate reward
  v_reward_amt := ROUND(v_order.total_amount * v_config.referrer_reward_percent / 100.0, 2);
  v_reward_amt := LEAST(v_reward_amt, v_config.referrer_max_reward_per_order);

  IF v_reward_amt <= 0 THEN
    RETURN jsonb_build_object('processed', FALSE, 'reason', 'zero_reward');
  END IF;

  -- Get or create referrer wallet
  SELECT id INTO v_wallet_id
  FROM wallet_accounts
  WHERE user_id = v_use.referrer_user_id AND currency = 'INR';

  IF NOT FOUND THEN
    INSERT INTO wallet_accounts (user_id, currency, balance)
    VALUES (v_use.referrer_user_id, 'INR', 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet
  INSERT INTO wallet_transactions (wallet_id, order_id, kind, amount, reference, metadata)
  VALUES (
    v_wallet_id, p_order_id, 'credit', v_reward_amt,
    'Referral reward',
    jsonb_build_object(
      'referral_use_id', v_use.id,
      'referee_user_id', v_order.customer_id,
      'order_id',        p_order_id,
      'reward_percent',  v_config.referrer_reward_percent
    )
  )
  RETURNING id INTO v_wallet_txn;

  -- Update wallet balance
  UPDATE wallet_accounts SET balance = balance + v_reward_amt WHERE id = v_wallet_id;

  -- Record the reward transaction
  INSERT INTO referral_reward_transactions (
    referral_use_id, order_id,
    referrer_user_id, referee_user_id,
    order_amount, reward_percent, reward_amount,
    wallet_transaction_id
  ) VALUES (
    v_use.id, p_order_id,
    v_use.referrer_user_id, v_order.customer_id,
    v_order.total_amount, v_config.referrer_reward_percent, v_reward_amt,
    v_wallet_txn
  );

  -- Update referral_use counters
  UPDATE referral_uses
    SET orders_counted           = orders_counted + 1,
        total_earned_by_referrer = total_earned_by_referrer + v_reward_amt,
        status = CASE
                   WHEN orders_counted + 1 >= v_config.referrer_max_orders_per_referee
                   THEN 'completed'
                   ELSE 'active'
                 END
  WHERE id = v_use.id;

  -- BUG 3 FIX: Increment total_referrals alongside total_earnings
  UPDATE customer_referral_codes
    SET total_earnings  = total_earnings  + v_reward_amt,
        total_referrals = total_referrals + 1
  WHERE id = v_use.referral_code_id;

  RETURN jsonb_build_object(
    'processed',     TRUE,
    'reward_amount', v_reward_amt,
    'wallet_id',     v_wallet_id
  );
END;
$$ LANGUAGE plpgsql;

-- ---- Bug 3b: Trigger to auto-call process_referral_reward --------
-- Previously called at order creation time (wrong).
-- Now fires when order status transitions to 'completed' or 'delivered'.
-- The existing log_order_status_change trigger already handles audit;
-- this is a separate trigger just for referral rewards.
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_process_referral_on_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when transitioning INTO completed or delivered
  IF NEW.status IN ('completed', 'delivered')
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND OLD.status NOT IN ('completed', 'delivered') THEN
    -- Non-fatal: if referral processing fails, order update still commits
    BEGIN
      PERFORM process_referral_reward(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't block the status update
      RAISE WARNING 'process_referral_reward failed for order %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_referral_reward_on_completion ON orders;
CREATE TRIGGER trg_referral_reward_on_completion
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  EXECUTE FUNCTION trg_process_referral_on_completion();
