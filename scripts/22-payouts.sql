-- 1. Add missing banking columns to laundry_profiles
-- 2. Create provider_payouts table (one row per payout cycle)
-- 3. Create provider_payout_orders (orders included in each payout)
-- 4. Indexes
-- ============================================================
 
-- ============================================================
-- 1. Add missing banking columns to laundry_profiles
--    (bank_account_number, bank_ifsc_code, bank_account_holder_name
--     already exist from 01-create-tables — we just add what's missing)
-- ============================================================
 
ALTER TABLE laundry_profiles
  ADD COLUMN IF NOT EXISTS bank_account_type VARCHAR(20)
    DEFAULT 'savings'
    CHECK (bank_account_type IN ('savings', 'current', 'overdraft')),
  ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100),
  -- Verification flag: admin marks bank details as verified
  ADD COLUMN IF NOT EXISTS bank_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_verified_at TIMESTAMPTZ;
 
-- ============================================================
-- 2. Provider payouts table
--    One row per payout cycle per provider.
--    Admin creates/manages these; provider sees read-only.
-- ============================================================
 
CREATE TABLE IF NOT EXISTS provider_payouts (
  id                   SERIAL PRIMARY KEY,
  provider_id          BIGINT        NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
 
  -- Billing period
  period_start         DATE          NOT NULL,
  period_end           DATE          NOT NULL,
  CHECK (period_end >= period_start),
 
  -- Financial breakdown
  gross_order_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gross_order_amount >= 0),
  -- Commission = gross_order_amount * commission_rate (captured at time of payout)
  commission_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (commission_rate >= 0),
  commission_type      VARCHAR(10)   NOT NULL DEFAULT 'percent'
                         CHECK (commission_type IN ('percent', 'flat')),
  commission_amount    NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  -- Subscription fee for this cycle (0 if trial)
  subscription_fee     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subscription_fee >= 0),
  -- Any other adjustments (bonus, penalty, manual correction)
  adjustments          NUMERIC(12,2) NOT NULL DEFAULT 0, -- can be negative
  adjustments_note     TEXT,
  -- Net payable = gross - commission - subscription_fee + adjustments
  net_payable          NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_payable >= 0),
  -- Order counts
  order_count          INTEGER       NOT NULL DEFAULT 0 CHECK (order_count >= 0),
 
  -- Payout status
  status               VARCHAR(20)   NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'on_hold')),
 
  -- Bank details snapshot at time of payment (frozen copy)
  bank_account_number  VARCHAR(100),
  bank_ifsc_code       VARCHAR(11),
  bank_account_holder  VARCHAR(255),
  bank_account_type    VARCHAR(20),
  upi_id               VARCHAR(100),
 
  -- Payment info (filled by admin when marking paid)
  payment_method       VARCHAR(30)
                         CHECK (payment_method IS NULL OR payment_method IN ('neft', 'rtgs', 'imps', 'upi', 'cheque', 'other')),
  payment_reference    VARCHAR(255), -- UTR / transaction ID
  payment_note         TEXT,
  paid_at              TIMESTAMPTZ,
 
  -- Admin who created / processed this payout
  created_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  processed_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
 
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
 
-- Prevent overlapping payout periods for the same provider
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payout_period
  ON provider_payouts (provider_id, period_start, period_end);
 
CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider
  ON provider_payouts (provider_id, created_at DESC);
 
CREATE INDEX IF NOT EXISTS idx_provider_payouts_status
  ON provider_payouts (status, created_at DESC);
 
DROP TRIGGER IF EXISTS trg_provider_payouts_updated_at ON provider_payouts;
CREATE OR REPLACE FUNCTION set_provider_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_provider_payouts_updated_at
  BEFORE UPDATE ON provider_payouts
  FOR EACH ROW EXECUTE FUNCTION set_provider_payouts_updated_at();
 
-- ============================================================
-- 3. Payout → orders mapping
--    Which completed orders are included in each payout.
--    Populated by admin when creating the payout.
-- ============================================================
 
CREATE TABLE IF NOT EXISTS provider_payout_orders (
  payout_id  INTEGER NOT NULL REFERENCES provider_payouts(id) ON DELETE CASCADE,
  order_id   BIGINT  NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  -- Snapshot of order amount at payout time
  order_amount NUMERIC(12,2) NOT NULL,
  -- Commission deducted for this specific order
  commission_deducted NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (payout_id, order_id)
);
 
CREATE INDEX IF NOT EXISTS idx_payout_orders_payout
  ON provider_payout_orders (payout_id);
 
CREATE INDEX IF NOT EXISTS idx_payout_orders_order
  ON provider_payout_orders (order_id);