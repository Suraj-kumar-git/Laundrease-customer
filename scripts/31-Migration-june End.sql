-- ============================================================
-- 31-Migration-june End.sql
--
-- MRP / strikethrough pricing — provider-decided per item.
--
-- Existing price columns (provider_product_service_prices.unit_price,
-- provider_services.price_override / price_per_kg_override) keep their
-- current meaning: the SELLING price actually charged. No checkout/cart
-- math changes — this migration is purely additive.
--
-- mrp / price_per_kg_mrp are nullable and provider-only:
--   - NULL or <= the selling price  -> no strikethrough, behaves exactly
--     as today (fully backward compatible, opt-in per item).
--   - > the selling price           -> customer UI shows it struck through
--     next to the (already-existing) selling price.
--
-- Discount % is intentionally NOT stored — it's derived on read
-- ((mrp - price) / mrp) so there's no second source of truth to drift
-- out of sync with the selling price.
-- ============================================================

ALTER TABLE provider_product_service_prices
  ADD COLUMN IF NOT EXISTS mrp NUMERIC(10,2) DEFAULT NULL;

ALTER TABLE provider_services
  ADD COLUMN IF NOT EXISTS price_per_kg_mrp NUMERIC(10,2) DEFAULT NULL;

ALTER TABLE provider_product_service_prices
  ADD CONSTRAINT chk_ppsp_mrp_nonnegative CHECK (mrp IS NULL OR mrp >= 0);

ALTER TABLE provider_services
  ADD CONSTRAINT chk_ps_price_per_kg_mrp_nonnegative CHECK (price_per_kg_mrp IS NULL OR price_per_kg_mrp >= 0);

-- ============================================================
--
-- Tracks cash a delivery partner physically collects on COD orders
-- and remits back to the company (via physical cash drop at a
-- hub/office, logged by an admin or an Operations-team support lead).
--
-- Balance per partner = SUM(cod_collected) - SUM(remittance)
-- ============================================================

CREATE TABLE IF NOT EXISTS partner_cash_ledger (
  id                   SERIAL PRIMARY KEY,
  delivery_profile_id  BIGINT NOT NULL REFERENCES delivery_profiles(id) ON DELETE CASCADE,
  -- The COD order this entry relates to — required for both kinds now:
  -- a remittance entry is tagged to the exact order whose cash it covers
  -- (one row per order, not a lump sum), so "is this order's cash back
  -- with the company yet" is a direct lookup, not an inference.
  order_id             BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind                 VARCHAR(20) NOT NULL CHECK (kind IN ('cod_collected', 'remittance')),
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  note                 TEXT,
  -- Groups the remittance rows written by a single "ops marks these orders
  -- as received" action, purely for display (e.g. "5 orders, ₹2,340,
  -- logged by X at 4:10pm") — not used in any balance/eligibility logic.
  batch_ref            VARCHAR(50),
  -- Who logged this entry — NULL for system-generated cod_collected entries
  -- (created automatically when an order is marked delivered), set to the
  -- admin/ops-lead user id for remittance entries.
  logged_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE partner_cash_ledger ALTER COLUMN logged_by SET DEFAULT NULL;

-- One cod_collected credit per order — prevents double-crediting if the
-- delivery confirmation path is ever retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_cod_order
  ON partner_cash_ledger (order_id)
  WHERE kind = 'cod_collected';

-- One remittance row per order — an order's COD cash is handed over
-- exactly once, so this is both an integrity guard and the basis for the
-- "is this order remitted" check used by the laundry payout eligibility query.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_ledger_remit_order
  ON partner_cash_ledger (order_id)
  WHERE kind = 'remittance';

CREATE INDEX IF NOT EXISTS idx_cash_ledger_partner
  ON partner_cash_ledger (delivery_profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cash_ledger_batch
  ON partner_cash_ledger (batch_ref) WHERE batch_ref IS NOT NULL;

-- Global cash-in-hand cap (₹) — once a partner's unremitted balance
-- reaches this, they stop seeing new COD pickups until they remit.
INSERT INTO platform_config (key, value, description) VALUES
  ('cod_cash_cap', '5000', 'Max unremitted COD cash (₹) a delivery partner may hold before new COD pickups are blocked')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
--
-- 1. PAN number capture for laundry providers & delivery partners
--    (required before a payout can be marked paid — for proper expense
--    documentation; actual TDS/tax treatment is determined by your CA,
--    this just gives you the field to capture and freeze per payout).
-- 2. PAN snapshot column on existing payout tables (frozen copy, same
--    pattern as the existing bank-detail snapshot columns).
-- 3. staff_payouts — fixed-amount monthly payslip records for admin
--    and support (salaried) staff, mirroring provider_payouts'
--    mark-paid-with-reference workflow but with a manually entered
--    amount instead of a calculated one.
-- ============================================================

-- ── 1. PAN number on partner profiles ─────────────────────────────────────
ALTER TABLE laundry_profiles
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);
ALTER TABLE laundry_profiles
  ADD CONSTRAINT chk_laundry_pan_format
  CHECK (pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);
ALTER TABLE delivery_profiles
  ADD CONSTRAINT chk_delivery_pan_format
  CHECK (pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- ── 2. PAN snapshot on existing payout tables ─────────────────────────────
ALTER TABLE provider_payouts
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);

ALTER TABLE partner_monthly_payouts
  ADD COLUMN IF NOT EXISTS pan_number VARCHAR(10);

-- ── 3. Salaried-staff finance fields on users (admin & support) ──────────
-- Lightweight — no separate profile table for these roles, so the
-- canonical bank/PAN info lives directly on users and gets frozen into
-- staff_payouts at payout time, same pattern as the partner tables.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pan_number               VARCHAR(10),
  ADD COLUMN IF NOT EXISTS bank_account_number       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_ifsc_code            VARCHAR(11),
  ADD COLUMN IF NOT EXISTS bank_account_holder_name  VARCHAR(255);

ALTER TABLE users
  ADD CONSTRAINT chk_users_pan_format
  CHECK (pan_number IS NULL OR pan_number ~ '^[A-Z]{5}[0-9]{4}[A-Z]$');

-- ── 4. staff_payouts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_payouts (
  id                   SERIAL PRIMARY KEY,
  user_id              BIGINT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  period_start         DATE          NOT NULL,
  period_end           DATE          NOT NULL,
  CHECK (period_end >= period_start),

  amount               NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note                 TEXT,

  status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'paid', 'on_hold')),

  -- Bank/PAN snapshot at time of payment (frozen copy, like provider_payouts)
  pan_number           VARCHAR(10),
  bank_account_number  VARCHAR(100),
  bank_ifsc_code       VARCHAR(11),
  bank_account_holder  VARCHAR(255),

  payment_method       VARCHAR(30)
                         CHECK (payment_method IS NULL OR payment_method IN ('neft', 'rtgs', 'imps', 'upi', 'cheque', 'other')),
  payment_reference    VARCHAR(255), -- UTR / transaction ID
  payment_note         TEXT,
  paid_at              TIMESTAMPTZ,

  created_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  processed_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Prevent duplicate payslips for the same person/period
  UNIQUE (user_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_staff_payouts_user
  ON staff_payouts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_payouts_status
  ON staff_payouts (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_staff_payouts_updated_at ON staff_payouts;
CREATE OR REPLACE FUNCTION set_staff_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_staff_payouts_updated_at
  BEFORE UPDATE ON staff_payouts
  FOR EACH ROW EXECUTE FUNCTION set_staff_payouts_updated_at();

-- ============================================================
--
-- Until now, every cancellation refund (customer self-cancel or
-- delivery-partner-initiated cancel) went to the customer's in-app
-- wallet only — no money ever flowed back through PayU/Cashfree to
-- the original card/UPI/bank. This adds the option to refund via the
-- gateway instead, tracked in its own table since gateway refunds are
-- asynchronous (the money doesn't land for 5-7 business days) and need
-- their own status lifecycle, separate from the instant wallet credit.
-- ============================================================

-- orders.payment_status gets a new in-between state: the refund has
-- been initiated with the gateway but not yet confirmed complete.
ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'refund_processing'));

CREATE TABLE IF NOT EXISTS payment_refunds (
  id                   SERIAL PRIMARY KEY,
  order_id             BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id           BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  provider             VARCHAR(30) NOT NULL,  -- 'payu' | 'cashfree'
  amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),

  -- Who asked for the original-method refund and from where.
  initiated_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  initiated_by_role    VARCHAR(20) NOT NULL CHECK (initiated_by_role IN ('customer', 'delivery', 'admin')),

  -- Our own refund reference sent to the gateway, and the gateway's own id once it responds.
  merchant_refund_id   VARCHAR(100) NOT NULL UNIQUE,
  gateway_refund_id    VARCHAR(100),

  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  failure_reason       TEXT,
  gateway_response     JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_order   ON payment_refunds (order_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status  ON payment_refunds (status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created ON payment_refunds (created_at DESC);

-- ============================================================
--
-- Bank/PAN/IFSC columns on `users` already exist (added in the
-- earlier staff-payouts migration) and are reused as-is for support
-- agents created via the admin "create support agent" form — no new
-- columns needed there. This migration only adds the S3 key for the
-- generated payslip PDF, regenerated whenever a payslip is created or
-- marked paid (so the PDF always reflects the latest status).
-- ============================================================

ALTER TABLE staff_payouts
  ADD COLUMN IF NOT EXISTS payslip_s3_key VARCHAR(500);

-- ============================================================
--
-- Schema only this step — customer submission flow, support review
-- queue, payout-deduction wiring, and finance-overview surfacing are
-- separate steps built on top of this.
--
-- Design decisions locked in with the user before this migration:
--  - Cap = cleaning_charge_for_the_item * multiplier, capped at
--    max_cap_amount. Avoids open-ended/declared-value fraud exposure.
--  - Cost is deducted from whichever party (provider or delivery
--    partner) is found liable; platform absorbs it only when liability
--    is shared/unclear ('platform' or 'none').
--  - Payout to the customer is a wallet credit (reuses
--    wallet_credit_for_order(), same as cancellation refunds).
-- ============================================================

-- Single-row admin-configurable policy. Read by the customer-facing
-- claim form (to show the cap/window) and by support when deciding a
-- claim. A history of changes isn't needed yet — admin edits this one
-- row in place; if policy versioning becomes important later, that's a
-- separate migration, not a reason to block this one.
CREATE TABLE IF NOT EXISTS item_protection_policy (
  id                  SERIAL PRIMARY KEY,
  multiplier          NUMERIC(4,2)  NOT NULL DEFAULT 10.0 CHECK (multiplier > 0),
  max_cap_amount      NUMERIC(10,2) NOT NULL DEFAULT 5000.00 CHECK (max_cap_amount > 0),
  claim_window_hours  INTEGER       NOT NULL DEFAULT 72 CHECK (claim_window_hours > 0),
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_by          BIGINT        REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

INSERT INTO item_protection_policy (multiplier, max_cap_amount, claim_window_hours, is_active)
SELECT 10.0, 5000.00, 72, TRUE
WHERE NOT EXISTS (SELECT 1 FROM item_protection_policy);

CREATE TABLE IF NOT EXISTS garment_claims (
  id                       SERIAL PRIMARY KEY,
  order_id                 BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id            INTEGER     NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  customer_id              BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  claim_type               VARCHAR(20) NOT NULL CHECK (claim_type IN ('damaged', 'lost', 'stolen')),
  description              TEXT        NOT NULL,
  photo_urls               JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- S3 keys

  status                   VARCHAR(20) NOT NULL DEFAULT 'submitted'
                              CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'paid')),

  -- Captured at submission time so the cap calculation is transparent and
  -- doesn't drift if the order's pricing data changes later.
  cleaning_charge_snapshot NUMERIC(10,2) NOT NULL,
  cap_amount               NUMERIC(10,2) NOT NULL,  -- min(cleaning_charge * policy.multiplier, policy.max_cap_amount) at submission time

  -- Who's on the hook for the cost. liable_party_id points at
  -- laundry_profiles.id or delivery_profiles.id depending on liable_party —
  -- intentionally no FK since it's polymorphic; the app layer resolves it.
  liable_party             VARCHAR(20) CHECK (liable_party IN ('provider', 'delivery', 'platform', 'none')),
  liable_party_id          BIGINT,

  compensation_amount      NUMERIC(10,2),
  decision_note            TEXT,
  decided_by               BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  decided_at               TIMESTAMPTZ,

  wallet_transaction_id    INTEGER     REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  paid_at                  TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garment_claims_order      ON garment_claims (order_id);
CREATE INDEX IF NOT EXISTS idx_garment_claims_customer   ON garment_claims (customer_id);
CREATE INDEX IF NOT EXISTS idx_garment_claims_status     ON garment_claims (status);
CREATE INDEX IF NOT EXISTS idx_garment_claims_created    ON garment_claims (created_at DESC);

-- One open claim per item at a time — stops a customer from filing
-- duplicate claims on the same garment while one is still pending.
CREATE UNIQUE INDEX IF NOT EXISTS uq_garment_claims_open_item
  ON garment_claims (order_item_id)
  WHERE status IN ('submitted', 'under_review');

-- scripts/item-protection-payout.sql
-- Step 4 of item-protection claims: track when a claim's compensation has
-- been deducted from the liable party's payout, and give delivery-partner
-- payouts the same adjustments ledger that provider_payouts already has.

ALTER TABLE garment_claims
  ADD COLUMN IF NOT EXISTS liability_deducted_at TIMESTAMPTZ;

ALTER TABLE partner_monthly_payouts
  ADD COLUMN IF NOT EXISTS adjustments      NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustments_note TEXT;

-- scripts/38-quick-pickup-provider-visibility.sql
-- Lets laundry providers see & action quick-pickup callback requests in
-- their service area. 'contacted' stays open to every provider serving
-- the pincode; 'converted' (order received) is exclusive to whichever
-- provider claimed it, tracked here rather than overloading
-- preferred_provider_id (which is the customer's own pick, if any).

ALTER TABLE quick_pickup_requests
  ADD COLUMN IF NOT EXISTS claimed_by_provider_id BIGINT REFERENCES laundry_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_qpr_claimed_provider
  ON quick_pickup_requests (claimed_by_provider_id)
  WHERE claimed_by_provider_id IS NOT NULL;