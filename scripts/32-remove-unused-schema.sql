-- scripts/39-remove-unused-schema.sql
-- Removes schema objects confirmed dead by a full cross-reference of every
-- table/function against app/, lib/, components/, and scripts/ — i.e.
-- nothing in the codebase queries these tables, and these functions are
-- never called from app code, from a trigger, or from any other function.
--
-- NOT included, deliberately:
--   - `promotions` table itself — still queried directly by
--     app/api/customer/public/pricing/calculate/route.ts for promo-code
--     pricing, even though the more elaborate eligibility/redemption
--     engine below it (the tables and functions this script drops) was
--     superseded by the `coupons` table and never wired up.
--   - `laundry_statuses` — looks unused (no app code ever queries it by
--     name), but it's a live FK parent for laundry_bags.status and
--     bag_status_events.status. Dropping it would break those tables.
--   - cleanup_expired_* functions (5 of them) — also never called, but
--     that's a missing pg_cron schedule, not dead code. Leaving these in
--     place; wire up a real schedule separately rather than deleting them.

BEGIN;

-- ---- Dead tables: abandoned "promotions engine" (superseded by coupons) ----
DROP TABLE IF EXISTS promotion_user_targets   CASCADE;
DROP TABLE IF EXISTS promotion_services       CASCADE;
DROP TABLE IF EXISTS promotion_product_types  CASCADE;
DROP TABLE IF EXISTS promotion_unique_codes   CASCADE;
DROP TABLE IF EXISTS promotion_redemptions    CASCADE;
DROP TABLE IF EXISTS order_promotions         CASCADE;

-- ---- Dead table: superseded by order_status_history ----
DROP TABLE IF EXISTS laundry_status_history   CASCADE;

-- ---- Dead table: barcode-bagging companion table, never wired to an API ----
DROP TABLE IF EXISTS bag_service_items        CASCADE;

-- ---- Dead functions: orphaned promotions-engine entry points ----
-- (their triggers were on promotion_redemptions, already dropped above)
DROP FUNCTION IF EXISTS promo_apply_to_order(character varying, integer, integer);
DROP FUNCTION IF EXISTS promo_check_order_eligibility(character varying, integer, integer);
DROP FUNCTION IF EXISTS compute_promotion_eligible_amount(integer, integer);
DROP FUNCTION IF EXISTS promo_period_start(character varying, timestamptz);
DROP FUNCTION IF EXISTS promo_redemption_counter_inc();
DROP FUNCTION IF EXISTS promo_redemption_counter_dec();

-- ---- Dead function: defined twice across migrations, never called ----
DROP FUNCTION IF EXISTS search_laundry_providers(character varying, numeric, integer, integer);

COMMIT;

-- Make Use of UUID instead of BIGINT
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_public_id ON orders (public_id);

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_addresses_public_id ON customer_addresses (public_id);

ALTER TABLE career_jobs
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_career_jobs_public_id ON career_jobs (public_id);

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_public_id ON support_tickets (public_id);

ALTER TABLE garment_claims
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_garment_claims_public_id ON garment_claims (public_id);

ALTER TABLE delivery_leaves
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_leaves_public_id ON delivery_leaves (public_id);

ALTER TABLE provider_payouts
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_payouts_public_id ON provider_payouts (public_id);

ALTER TABLE quick_pickup_requests
  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_quick_pickup_requests_public_id ON quick_pickup_requests (public_id);

-- Admin persona: public_id for every table behind an admin [id]/[userId] route
-- that didn't already get one from an earlier persona.
ALTER TABLE faqs                          ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE legal_documents                ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE page_content_blocks            ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE partner_faqs                   ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE delivery_profiles              ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE platform_holidays              ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE partner_monthly_payouts        ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE partner_salary_slabs           ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE third_party_delivery_providers ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE users                          ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE laundry_profiles               ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE customer_referral_codes        ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE referral_uses                  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE reviews                        ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE service_zones                  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE product_types                  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE services                       ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE order_fee_config               ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE payment_gateway_config         ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE staff_payouts                  ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE laundry_subscription_plans     ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE laundry_subscription_offers    ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE laundry_provider_subscriptions ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE payment_refunds                ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE delivery_documents             ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE provider_documents             ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE platform_testimonials          ADD COLUMN IF NOT EXISTS public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS uq_faqs_public_id                          ON faqs (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_documents_public_id               ON legal_documents (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_page_content_blocks_public_id           ON page_content_blocks (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_faqs_public_id                  ON partner_faqs (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_profiles_public_id             ON delivery_profiles (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_holidays_public_id             ON platform_holidays (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_monthly_payouts_public_id       ON partner_monthly_payouts (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_salary_slabs_public_id          ON partner_salary_slabs (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_third_party_delivery_providers_pub_id   ON third_party_delivery_providers (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_public_id                         ON users (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_laundry_profiles_public_id              ON laundry_profiles (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_referral_codes_public_id       ON customer_referral_codes (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_uses_public_id                 ON referral_uses (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_public_id                       ON reviews (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_zones_public_id                 ON service_zones (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_types_public_id                ON product_types (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_services_public_id                     ON services (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_fee_config_public_id             ON order_fee_config (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_gateway_config_public_id       ON payment_gateway_config (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_staff_payouts_public_id                ON staff_payouts (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_laundry_subscription_plans_public_id   ON laundry_subscription_plans (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_laundry_subscription_offers_public_id  ON laundry_subscription_offers (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_laundry_provider_subscriptions_pub_id  ON laundry_provider_subscriptions (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_refunds_public_id              ON payment_refunds (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_documents_public_id           ON delivery_documents (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_documents_public_id          ON provider_documents (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_testimonials_public_id       ON platform_testimonials (public_id);

-- GST invoices must carry the correct Services Accounting Code (SAC) per
-- service. Until now invoice-pdf.tsx hardcoded a single fallback (9967 —
-- "Support services") for every line item, which isn't correct for laundry
-- services generally (the right code is closer to 9997 — "Other services",
-- specifically 999721 for laundry/dry-cleaning). Admin owns creating
-- services; Operations leads (support persona) are given a narrow tab to
-- set/correct the SAC code per existing service without touching anything
-- else about it.

-- BEGIN;
-- ALTER TABLE services ADD COLUMN IF NOT EXISTS sac_code VARCHAR(8);
-- COMMENT ON COLUMN services.sac_code IS
--   'Services Accounting Code (GST) for this service, e.g. 999721. Maintained by Operations leads in the support persona; NULL until set.';
-- COMMIT;

-- DROP TRIGGER IF EXISTS trg_log_laundry_status_change ON orders;
-- DROP FUNCTION IF EXISTS log_laundry_status_change();

-- INSERT INTO order_statuses (code, description, sort_order, is_terminal) VALUES
--   ('failed', 'Order could not be placed — payment failed', 15, TRUE)
-- ON CONFLICT (code) DO NOTHING;

-- recalc_order_totals() added tax_amount on top of order_adjustments, but GST
-- (the only thing ever stored in tax_amount) is itself one of the rows already
-- summed into order_adjustments — double-counting it into total_amount.
-- GST lives in order_adjustments now (via order_fee_config), so drop the
-- separate +tax_amount term.
CREATE OR REPLACE FUNCTION recalc_order_totals(p_order_id BIGINT)
RETURNS VOID AS $$
DECLARE
  v_subtotal DECIMAL(10,2);
  v_discount DECIMAL(10,2);
  v_adjustments DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(ois.line_total), 0) INTO v_subtotal
  FROM order_item_services ois
  JOIN order_items oi ON oi.id = ois.order_item_id
  WHERE oi.order_id = p_order_id;
  SELECT discount_amount INTO v_discount
  FROM orders WHERE id = p_order_id;
  SELECT COALESCE(SUM(amount), 0) INTO v_adjustments
  FROM order_adjustments WHERE order_id = p_order_id;
  UPDATE orders
     SET subtotal = v_subtotal,
         total_amount = GREATEST(0, v_subtotal - COALESCE(v_discount,0) + COALESCE(v_adjustments,0)),
         updated_at = NOW()
   WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;

-- Same double-count existed in the cart-side equivalent (cart_adjustments
-- also carries the GST row once express-toggle / coupon routes touch the
-- cart) — drop the separate +tax_amount term here too.
CREATE OR REPLACE FUNCTION recalc_cart_totals(p_cart_id INTEGER)
RETURNS VOID AS $$
DECLARE
  v_subtotal DECIMAL(10,2);
  v_discount DECIMAL(10,2);
  v_adjustments DECIMAL(10,2);
BEGIN
  SELECT COALESCE(SUM(cis.line_total), 0)
    INTO v_subtotal
  FROM cart_item_services cis
  JOIN cart_items ci ON ci.id = cis.cart_item_id
  WHERE ci.cart_id = p_cart_id;
  SELECT discount_amount
    INTO v_discount
  FROM shopping_carts WHERE id = p_cart_id;
  SELECT COALESCE(SUM(amount), 0)
    INTO v_adjustments
  FROM cart_adjustments
  WHERE cart_id = p_cart_id;
  UPDATE shopping_carts
     SET subtotal = v_subtotal,
         adjustments_total = v_adjustments,
         total_amount = GREATEST(0, v_subtotal - COALESCE(v_discount,0) + COALESCE(v_adjustments,0)),
         updated_at = NOW()
   WHERE id = p_cart_id;
END;
$$ LANGUAGE plpgsql;

-- Migration 36: Email OTP sessions for laundry partners
-- Used for:
--   - Registration: verify email before creating account
--   - Login: send OTP to email when partner logs in with email identifier

CREATE TABLE IF NOT EXISTS provider_email_otp_sessions (
  id             BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL,
  otp_hash       TEXT NOT NULL,
  purpose        TEXT NOT NULL,             -- 'registration' | 'login'
  verified       BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count  INTEGER NOT NULL DEFAULT 0,
  expires_at     TIMESTAMPTZ NOT NULL,
  ip_address     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_peos_purpose CHECK (purpose IN ('registration', 'login'))
);

CREATE INDEX IF NOT EXISTS idx_peos_email_purpose
  ON provider_email_otp_sessions(email, purpose, verified, expires_at);