-- ============================================================
-- 11-order-flow.sql
-- 1. payment_gateway_config table
-- 2. order_statuses seed additions
-- ============================================================

-- ---- 1. Payment gateway config ------------------------------
-- Stores ONE active payment gateway at a time.
-- API keys are AES-256-GCM encrypted before storage.
-- Admin manages this via admin console.

CREATE TABLE IF NOT EXISTS payment_gateway_config (
  id                    SERIAL PRIMARY KEY,
  provider              VARCHAR(30) NOT NULL CHECK (provider IN ('razorpay', 'cashfree', 'payu')),
  display_name          VARCHAR(100) NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT FALSE,
  -- Encrypted values: stored as "iv:authTag:ciphertext" base64 strings
  api_key_enc           TEXT,         -- Razorpay key_id / Cashfree appId / PayU publishable key
  api_secret_enc        TEXT,         -- Razorpay key_secret / Cashfree secretKey / PayU secret key
  webhook_secret_enc    TEXT,         -- Webhook signature verification secret
  -- Gateway-specific extra config (e.g. account_id, currency, sandbox mode)
  config                JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- COD config (not a gateway, but controlled here)
  cod_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  cod_max_order_amount  NUMERIC(10,2) NOT NULL DEFAULT 5000.00,
  -- Audit
  updated_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one row can be active at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_gateway_active
  ON payment_gateway_config (is_active)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_payment_gateway_updated_at ON payment_gateway_config;
CREATE TRIGGER trg_payment_gateway_updated_at
  BEFORE UPDATE ON payment_gateway_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Default row (no active gateway until admin configures one)
INSERT INTO payment_gateway_config (
  provider, display_name, is_active, cod_enabled, cod_max_order_amount, config
) VALUES (
  'razorpay', 'Razorpay', FALSE, TRUE, 5000.00,
  '{"sandbox": true, "currency": "INR"}'::jsonb
) ON CONFLICT DO NOTHING;

-- ---- 2. order_statuses seed additions -----------------------
-- Add missing statuses not seeded initially
INSERT INTO order_statuses (code, description, sort_order, is_terminal)
VALUES
  ('completed', 'Order fully completed and closed', 80, TRUE),
  ('returned',  'Order returned to customer',        90, TRUE)
ON CONFLICT (code) DO NOTHING;
