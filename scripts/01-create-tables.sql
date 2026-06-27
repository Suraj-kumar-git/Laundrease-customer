-- Create database schema for laundry service

-- Enable case-insensitive text for email uniqueness
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1) Roles table
CREATE TABLE IF NOT EXISTS roles (
    id SMALLSERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- Users table for all personas (Customer, Admin, Delivery, Laundry Service, Support)
-- 2) Users table (referencing role_id from roles)
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    -- Use citext for case-insensitive unique emails
    email CITEXT UNIQUE NOT NULL,
    -- Store hash as TEXT to avoid artificial length limits
    password_hash TEXT NOT NULL,
    phone VARCHAR(20),
    full_name VARCHAR(255) NOT NULL,
    -- Foreign key to roles
    role_id SMALLINT NOT NULL REFERENCES roles(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'suspended')),
    profile_image VARCHAR(500),
    -- Verification flags and timestamps
    phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    phone_verified_at TIMESTAMPTZ,
    -- Last login timestamp (use TIMESTAMPTZ to capture timezone)
    last_logged_in TIMESTAMPTZ,
    -- Auditing timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Optional soft-delete
    deleted_at TIMESTAMPTZ,
    -- Flexible per-user metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    -- Ensure verification timestamps match the flags
    CHECK (
        (email_verified AND email_verified_at IS NOT NULL)
        OR (NOT email_verified AND email_verified_at IS NULL)
    ),
    CHECK (
        (phone_verified AND phone_verified_at IS NOT NULL)
        OR (NOT phone_verified AND phone_verified_at IS NULL)
    ),
    -- Basic E.164 phone format check when provided (optional, adjust if needed)
    CHECK (
        phone IS NULL OR phone ~ '^\+?[0-9]\d{1,14}$'
    )
);

-- 3) Customer profiles with additional details
CREATE TABLE IF NOT EXISTS customer_profiles (
    id BIGSERIAL PRIMARY KEY,
    -- One-to-one relation with users
    user_id BIGSERIAL NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,
    -- Profile-specific settings (keep addresses in customer_addresses)
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    loyalty_points INTEGER NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
    total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
    -- Useful stats and flags
    last_order_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    -- Ensure preferences is a JSON object (not array/string/etc.)
    CHECK (jsonb_typeof(preferences) = 'object')
);

-- 4) Addresses table for customers
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    customer_profile_id BIGSERIAL NOT NULL REFERENCES customer_profiles(id) ON DELETE CASCADE,
    -- User-defined short name for the address (e.g., "Home", "Shop", "PG")
    label VARCHAR(50),
    -- Additional tags the user can define freely (e.g., ["front_gate", "evening"])
    tags TEXT[] DEFAULT '{}',
    -- Normalized address fields
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    landmark VARCHAR(255),          -- near/by landmark for easier pickup
    neighborhood VARCHAR(100),      -- area/locality if applicable
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country_code CHAR(2) NOT NULL,  -- ISO 3166-1 alpha-2, e.g., "IN"
    -- Precise coordinates (if not using PostGIS). Keep both NULL or both non-NULL.
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    -- Delivery instructions for the courier
    instructions TEXT,
    contact_name VARCHAR(100),
    contact_phone VARCHAR(20),
    -- Address state and auditing
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    validated BOOLEAN NOT NULL DEFAULT FALSE,
    validated_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    position SMALLINT NOT NULL,     -- 1..10 per customer; enforces max 10 addresses
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    -- Constraints
    CHECK (position BETWEEN 1 AND 10),
    CHECK (
      (latitude IS NULL AND longitude IS NULL)
      OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    ),
    CHECK (
      contact_phone IS NULL OR contact_phone ~ '^\+?[1-9]\d{1,14}$'
    ),
    CHECK (
      NOT validated OR validated_at IS NOT NULL
    )
);

-- 5) Delivery partner profiles
CREATE TABLE IF NOT EXISTS delivery_profiles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGSERIAL NOT NULL UNIQUE
        REFERENCES users(id)
        ON DELETE CASCADE,
    vehicle_type VARCHAR(50) NOT NULL,          -- e.g., bike, scooter, car, van
    license_number VARCHAR(100) NOT NULL UNIQUE,
    service_area VARCHAR(255),                  -- optional free-text area/zone name
    is_online BOOLEAN NOT NULL DEFAULT FALSE,
    -- Current location (built-in geometric point; store as (lon, lat) or (x, y) consistently)
    current_location POINT,
    -- Performance and rating
    rating NUMERIC(3,2) NOT NULL DEFAULT 0.00 CHECK (rating BETWEEN 0 AND 5),
    rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    total_deliveries INTEGER NOT NULL DEFAULT 0 CHECK (total_deliveries >= 0),
    -- Operational fields (optional)
    last_ping_at TIMESTAMPTZ,                   -- last heartbeat/location update
    capacity_kg INTEGER CHECK (capacity_kg >= 0),
    -- Compliance/documents
    document_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    background_check_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (background_check_status IN ('pending', 'verified', 'expired', 'rejected')),
    background_check_verified_at TIMESTAMPTZ,
    -- Shift/availability state
    shift_status VARCHAR(20) NOT NULL DEFAULT 'off_duty'
        CHECK (shift_status IN ('off_duty', 'on_duty', 'break')),
    -- Device info
    device_id VARCHAR(100),
    app_version VARCHAR(20),
    -- Performance metrics
    on_time_rate NUMERIC(5,2) NOT NULL DEFAULT 0.00
        CHECK (on_time_rate BETWEEN 0 AND 100),
    cancellations_count INTEGER NOT NULL DEFAULT 0 CHECK (cancellations_count >= 0),
    returns_count INTEGER NOT NULL DEFAULT 0 CHECK (returns_count >= 0),
    -- JSON guardrail
    CHECK (jsonb_typeof(document_meta) = 'object')
);

-- 6) Availability windows (recurring or date-bounded)
CREATE TABLE IF NOT EXISTS delivery_availability (
    id SERIAL PRIMARY KEY,
    delivery_profile_id BIGSERIAL NOT NULL
        REFERENCES delivery_profiles(id)
        ON DELETE CASCADE,
    -- 0=Sunday .. 6=Saturday
    day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    timezone TEXT,                       -- optional (e.g., 'Asia/Kolkata')
    is_recurring BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE,                 -- optional: start date for this window
    effective_to DATE,                   -- optional: end date for this window
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (end_time > start_time),
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
-- 7) Service zones (non-PostGIS) using JSONB shapes
-- Store zones as shapes for app-side geofencing:
-- Examples:
--  - Circle:   {"type":"circle","center":{"lat":12.34,"lon":56.78},"radius_meters":3000}
--  - Rectangle:{"type":"rectangle","bbox":{"min_lat":..., "min_lon":..., "max_lat":..., "max_lon":...}}
CREATE TABLE IF NOT EXISTS service_zones (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    shape JSONB NOT NULL,                          -- see examples above
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (jsonb_typeof(shape) = 'object')
);

-- 8) Mapping: which zones each delivery profile covers
CREATE TABLE IF NOT EXISTS delivery_profile_service_zones (
    delivery_profile_id BIGSERIAL NOT NULL
        REFERENCES delivery_profiles(id)
        ON DELETE CASCADE,
    service_zone_id INTEGER NOT NULL
        REFERENCES service_zones(id)
        ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (delivery_profile_id, service_zone_id)
);

-- 9) Merge this with the prev.Version of this
CREATE TABLE IF NOT EXISTS laundry_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGSERIAL REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  business_address TEXT,
  service_area VARCHAR(255),
  capacity INTEGER DEFAULT 0,
  operating_hours JSONB DEFAULT '{}',
  certifications TEXT[],
  services_offered TEXT[],
  rating DECIMAL(3,2) DEFAULT 0.00,
  rating_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rating_range CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT capacity_non_negative CHECK (capacity >= 0)
);

-- 10) Services catalog
CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100), -- wash_fold, dry_cleaning, steam_ironing, etc.
  base_price DECIMAL(10,2) NOT NULL,
  price_per_kg DECIMAL(10,2),
  turnaround_hours INTEGER DEFAULT 24,
  is_express_available BOOLEAN DEFAULT false,
  express_multiplier DECIMAL(3,2) DEFAULT 1.5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT base_price_non_negative CHECK (base_price >= 0),
  CONSTRAINT price_per_kg_non_negative CHECK (price_per_kg IS NULL OR price_per_kg >= 0),
  CONSTRAINT turnaround_positive CHECK (turnaround_hours > 0),
  CONSTRAINT express_multiplier_positive CHECK (express_multiplier >= 1)
);

-- 11) Provider-to-service mapping with optional per-provider overrides
CREATE TABLE IF NOT EXISTS provider_services (
  provider_id BIGSERIAL NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  price_override DECIMAL(10,2),                  -- overrides base_price
  price_per_kg_override DECIMAL(10,2),           -- overrides price_per_kg
  is_express_available_override BOOLEAN,         -- overrides is_express_available
  express_multiplier_override DECIMAL(3,2),
  turnaround_hours_override INTEGER,
  PRIMARY KEY (provider_id, service_id),
  CHECK (price_override IS NULL OR price_override >= 0),
  CHECK (price_per_kg_override IS NULL OR price_per_kg_override >= 0),
  CHECK (express_multiplier_override IS NULL OR express_multiplier_override >= 1),
  CHECK (turnaround_hours_override IS NULL OR turnaround_hours_override > 0)
);
-- 12) Normalized operating hours (0=Sunday ... 6=Saturday)
CREATE TABLE IF NOT EXISTS provider_operating_hours (
  provider_id BIGSERIAL NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (provider_id, day_of_week),
  CHECK (is_closed OR close_time > open_time)
);

-- 13) Optional holiday/exception dates
CREATE TABLE IF NOT EXISTS provider_closed_dates (
  provider_id BIGSERIAL NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  closed_date DATE NOT NULL,
  note TEXT,
  PRIMARY KEY (provider_id, closed_date)
);

-- 14) Simple service area coverage.
CREATE TABLE IF NOT EXISTS provider_service_areas (
  provider_id BIGSERIAL NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  postal_code VARCHAR(20) NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  country VARCHAR(100),
  PRIMARY KEY (provider_id, postal_code)
);

-- 15) Status lifecycle aligned with laundry operations
CREATE TABLE laundry_statuses (
  code VARCHAR(30) PRIMARY KEY,
  description TEXT NOT NULL,
  is_terminal BOOLEAN DEFAULT FALSE,
  sort_order INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'laundry_status') THEN
--     CREATE TYPE laundry_status AS ENUM (
--       'received',
--       'sorting',
--       'washing',
--       'drying',
--       'ironing',
--       'folding',
--       'dry_cleaning',
--       'steam_ironing',
--       'quality_check',
--       'ready_for_delivery',
--       'completed',
--       'cancelled'
--     );
--   END IF;
-- END
-- $$;

-- 16) Core bag entity scanned by providers, linked to delivery and provider
CREATE TABLE IF NOT EXISTS laundry_bags (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,                  -- unique code on the bag
  user_id BIGSERIAL REFERENCES users(id) ON DELETE SET NULL,         -- end customer
  provider_id BIGSERIAL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  delivery_profile_id BIGSERIAL REFERENCES delivery_profiles(id) ON DELETE SET NULL,
  weight_kg DECIMAL(6,2),
  instructions JSONB NOT NULL DEFAULT '{}'::jsonb,  -- machine-readable rules from the bag code
  status VARCHAR(30) NOT NULL REFERENCES laundry_statuses(code),
  express BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (weight_kg IS NULL OR weight_kg >= 0)
);

-- 17) A bag can request multiple services (e.g., wash_fold + steam_ironing)
CREATE TABLE IF NOT EXISTS bag_service_items (
  id SERIAL PRIMARY KEY,
  bag_id INTEGER NOT NULL REFERENCES laundry_bags(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),       -- per-item count, if applicable
  weight_kg DECIMAL(6,2) CHECK (weight_kg IS NULL OR weight_kg >= 0), -- if service priced per kg
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),                -- final line price for accounting
  status VARCHAR(30) NOT NULL REFERENCES laundry_statuses(code)
);

-- 18) History of status transitions for each bag
CREATE TABLE IF NOT EXISTS bag_status_events (
  id SERIAL PRIMARY KEY,
  bag_id INTEGER NOT NULL REFERENCES laundry_bags(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL REFERENCES laundry_statuses(code),
  note TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19) Store canonical statuses so they can evolve without altering table constraints.
CREATE TABLE IF NOT EXISTS order_statuses (
  code VARCHAR(50) PRIMARY KEY,                 -- e.g., 'pending', 'confirmed', ...
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);

-- 20) Garment/product catalog (e.g., 'shirt', 'bedsheet', 'curtain', etc.)
CREATE TABLE IF NOT EXISTS product_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 21) Captures standard pricing for (product_type, service) pairs.
CREATE TABLE IF NOT EXISTS product_service_prices (
  product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  -- pricing model:
  -- If weight_kg is provided at item level, treat unit_price as per-kg; else per-item.
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  currency VARCHAR(3) DEFAULT 'INR', -- optional, keep it flexible
  PRIMARY KEY (product_type_id, service_id)
);

-- 22) Optional provider-specific overrides
CREATE TABLE IF NOT EXISTS provider_product_service_prices (
  provider_id BIGSERIAL NOT NULL REFERENCES laundry_profiles(id) ON DELETE CASCADE,
  product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  currency VARCHAR(3) DEFAULT 'INR',
  PRIMARY KEY (provider_id, product_type_id, service_id)
);

-- 23) orders table
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  laundry_profile_id BIGINT REFERENCES laundry_profiles(id) ON DELETE SET NULL, --Updated from DB side to drop not null constraint
  delivery_profile_id BIGINT REFERENCES delivery_profiles(id) ON DELETE SET NULL, --Updated from DB side to drop not null constraint
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    REFERENCES order_statuses(code) ON UPDATE RESTRICT, -- keep status values canonical
  -- Addresses & scheduling
  pickup_address TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  pickup_date DATE NOT NULL,
  pickup_time_slot VARCHAR(20),
  delivery_date DATE,
  delivery_time_slot VARCHAR(20),
  -- Options & notes
  special_instructions TEXT,
  is_express BOOLEAN NOT NULL DEFAULT FALSE,
  -- Pricing aggregates (maintained by triggers below)
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  -- Payment tracking (simple)
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method VARCHAR(50),
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24) Order Items (products in the order)
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
  -- Optional human-readable label if you want to store the raw text too
  garment_label VARCHAR(100),
  -- Quantities/weights
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg DECIMAL(6,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  -- Operational details
  barcode VARCHAR(100) UNIQUE,
  special_care_instructions TEXT,
  condition_before TEXT,
  condition_after TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 25) Order Item Services (services attached to each product)
-- Stores the snapshot of pricing at time of order (unit_price, line_total).
-- Pricing rule:
-- - If weight_kg is provided on order_items, line_total = unit_price * weight_kg
-- - Else line_total = unit_price * quantity
CREATE TABLE IF NOT EXISTS order_item_services (
  id SERIAL PRIMARY KEY,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  -- Snapshot pricing at time of order (in INR by default)
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total DECIMAL(10,2) NOT NULL CHECK (line_total >= 0),
  is_express BOOLEAN NOT NULL DEFAULT FALSE,
  express_multiplier DECIMAL(3,2) DEFAULT 1.5 CHECK (express_multiplier IS NULL OR express_multiplier >= 1),
  -- Avoid duplicate service rows for the same item
  UNIQUE (order_item_id, service_id)
);

-- 26) Order Status History (audit log)
CREATE TABLE IF NOT EXISTS order_status_history (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL REFERENCES order_statuses(code) ON UPDATE RESTRICT,
  updated_by BIGSERIAL REFERENCES users(id) ON DELETE SET NULL, -- who changed it (staff/partner)
  notes TEXT,
  location VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27) Wallet (for wallet money usage)
CREATE TABLE IF NOT EXISTS wallet_accounts (
  id SERIAL PRIMARY KEY,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL DEFAULT 'INR',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0, -- optional cached balance
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, currency)
);

-- 28) Wallet transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  wallet_id INTEGER NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
  order_id BIGSERIAL REFERENCES orders(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('credit', 'debit')),
  amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  reference VARCHAR(255), -- e.g., reason or external ref
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29) Payments (per order)
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  payment_method VARCHAR(50) NOT NULL, -- e.g., 'wallet', 'upi', 'card', 'cod'
  transaction_id VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  wallet_transaction_id INTEGER REFERENCES wallet_transactions(id) ON DELETE SET NULL, -- link when method='wallet'
  method_details JSONB, -- gateway response, card last4, UPI handle, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 30) Core coupon definition
CREATE TABLE IF NOT EXISTS coupons (
  code VARCHAR(50) PRIMARY KEY,
  applicable_to_user BIGINT,
  name VARCHAR(255),
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('flat', 'percent')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value >= 0),
  max_discount DECIMAL(10,2) CHECK (max_discount IS NULL OR max_discount >= 0),
  min_order_amount DECIMAL(10,2) CHECK (min_order_amount IS NULL OR min_order_amount >= 0),
  usage_limit_global INTEGER CHECK (usage_limit_global IS NULL OR usage_limit_global >= 0),
  usage_limit_per_user INTEGER CHECK (usage_limit_per_user IS NULL OR usage_limit_per_user >= 0),
  first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 31) Optional applicability scoping for coupons
CREATE TABLE IF NOT EXISTS coupon_applicability (
  coupon_code VARCHAR(50) NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  product_type_id INTEGER REFERENCES product_types(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE RESTRICT,
  include BOOLEAN NOT NULL DEFAULT TRUE, -- include or exclude scope
  PRIMARY KEY (coupon_code, product_type_id, service_id)
);

-- 32) Track redemptions for enforcement and analytics
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id SERIAL PRIMARY KEY,
  coupon_code VARCHAR(50) NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id BIGSERIAL REFERENCES orders(id) ON DELETE SET NULL,
  amount_discounted DECIMAL(10,2) NOT NULL CHECK (amount_discounted >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33) Shopping Cart (pre-order)
CREATE TABLE IF NOT EXISTS shopping_carts (
  id SERIAL PRIMARY KEY,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- pricing aggregates
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  adjustments_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  is_express BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id) -- one active cart per user; remove if you allow multiple
);

-- 34) Cart-items
CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
  garment_label VARCHAR(100),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg DECIMAL(6,2) CHECK (weight_kg IS NULL OR weight_kg >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 35) Cart-item services
CREATE TABLE IF NOT EXISTS cart_item_services (
  id SERIAL PRIMARY KEY,
  cart_item_id INTEGER NOT NULL REFERENCES cart_items(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total DECIMAL(10,2) NOT NULL CHECK (line_total >= 0),
  is_express BOOLEAN NOT NULL DEFAULT FALSE,
  express_multiplier DECIMAL(3,2) DEFAULT 1.5 CHECK (express_multiplier IS NULL OR express_multiplier >= 1),
  UNIQUE (cart_item_id, service_id)
);

-- 36) Coupons attached to a cart (supports multiple if stackable)
CREATE TABLE IF NOT EXISTS cart_coupons (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  coupon_code VARCHAR(50) NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, coupon_code)
);

-- 37) Non-item adjustments for cart (e.g., delivery fee, manual discount)
CREATE TABLE IF NOT EXISTS cart_adjustments (
  id SERIAL PRIMARY KEY,
  cart_id INTEGER NOT NULL REFERENCES shopping_carts(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('coupon', 'manual_discount', 'delivery_fee', 'express_fee', 'surcharge', 'rounding', 'other')),
  amount DECIMAL(10,2) NOT NULL, -- negative for discounts
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 38) Order-level adjustments (breakdown lines)
CREATE TABLE IF NOT EXISTS order_adjustments (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('coupon', 'manual_discount', 'delivery_fee', 'express_fee', 'surcharge', 'rounding', 'other')),
  amount DECIMAL(10,2) NOT NULL, -- negative for discounts
  note TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 39) Coupons applied to an order (for audit)
CREATE TABLE IF NOT EXISTS order_coupons (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  coupon_code VARCHAR(50) NOT NULL REFERENCES coupons(code) ON DELETE CASCADE,
  amount_discounted DECIMAL(10,2) NOT NULL CHECK (amount_discounted >= 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, coupon_code)
);

-- 40) Reviews: ratings and feedback per order
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  -- Relations
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  customer_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  laundry_profile_id BIGSERIAL REFERENCES laundry_profiles(id) ON DELETE SET NULL,   -- aligns with orders.laundry_profile_id
  delivery_profile_id BIGSERIAL REFERENCES delivery_profiles(id) ON DELETE SET NULL, -- aligns with orders.delivery_profile_id
  -- Ratings (1..5). At least one rating must be provided.
  service_rating SMALLINT CHECK (service_rating BETWEEN 1 AND 5),
  delivery_rating SMALLINT CHECK (delivery_rating BETWEEN 1 AND 5),
  overall_rating SMALLINT CHECK (overall_rating BETWEEN 1 AND 5),
  -- Content & visibility
  comment TEXT,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('pending', 'published', 'hidden', 'flagged', 'deleted')),
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT uq_reviews_order_customer UNIQUE (order_id, customer_id),
  CONSTRAINT chk_reviews_has_any_rating CHECK (
    service_rating IS NOT NULL OR delivery_rating IS NOT NULL OR overall_rating IS NOT NULL
  )
);

-- 41) Canonical statuses (ensure you seed default values like 'open', 'in_progress', etc.)
CREATE TABLE IF NOT EXISTS support_ticket_statuses (
  code VARCHAR(30) PRIMARY KEY,                 -- e.g., 'open','in_progress','hold','resolved','closed','reopened'
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE
);

-- 42) Priority with SLA targets (minutes)
CREATE TABLE IF NOT EXISTS support_ticket_priorities (
  code VARCHAR(20) PRIMARY KEY,                 -- 'low','medium','high','urgent'
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  first_response_sla_minutes INTEGER CHECK (first_response_sla_minutes IS NULL OR first_response_sla_minutes > 0),
  resolution_sla_minutes INTEGER CHECK (resolution_sla_minutes IS NULL OR resolution_sla_minutes > 0)
);

-- 43) Categories (order, technical, coupon, wallet, account, other)
CREATE TABLE IF NOT EXISTS support_ticket_categories (
  code VARCHAR(30) PRIMARY KEY,                 -- 'order','technical','coupon','wallet','account','other'
  description TEXT
);

-- 44) Optional support groups/teams for assignment
CREATE TABLE IF NOT EXISTS support_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 45) 
CREATE TABLE IF NOT EXISTS support_group_members (
  group_id INTEGER NOT NULL REFERENCES support_groups(id) ON DELETE CASCADE,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50),                             -- e.g., 'agent','lead'
  PRIMARY KEY (group_id, user_id)
);

-- 46) Free-form tag catalog
CREATE TABLE IF NOT EXISTS support_tags (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 47) Main table: support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id SERIAL PRIMARY KEY,
  -- Context
  customer_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  order_id BIGSERIAL REFERENCES orders(id) ON DELETE SET NULL,
  coupon_code VARCHAR(50) REFERENCES coupons(code) ON DELETE SET NULL,
  wallet_transaction_id INTEGER REFERENCES wallet_transactions(id) ON DELETE SET NULL,
  assigned_to BIGSERIAL REFERENCES users(id) ON DELETE SET NULL,
  assigned_group_id INTEGER REFERENCES support_groups(id) ON DELETE SET NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other'
    REFERENCES support_ticket_categories(code) ON UPDATE RESTRICT,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium'
    REFERENCES support_ticket_priorities(code) ON UPDATE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'open'
    REFERENCES support_ticket_statuses(code) ON UPDATE RESTRICT,
  source VARCHAR(20) NOT NULL DEFAULT 'app'
    CHECK (source IN ('app','web','phone','email','other')),
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,   -- device info, app version, screenshots refs, etc.
  -- SLA tracking
  first_response_due_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  last_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 48) Attachments (metadata only; store file in object storage)
CREATE TABLE IF NOT EXISTS support_ticket_attachments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  uploaded_by BIGSERIAL REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100),
  storage_key VARCHAR(255) NOT NULL,            -- path/key in your storage provider
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 49) Ticket comments (conversation)
CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,     -- internal notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 50) Status history (audit)
CREATE TABLE IF NOT EXISTS support_ticket_status_history (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  from_status VARCHAR(30) REFERENCES support_ticket_statuses(code) ON UPDATE RESTRICT,
  to_status VARCHAR(30) NOT NULL REFERENCES support_ticket_statuses(code) ON UPDATE RESTRICT,
  updated_by BIGSERIAL REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 51) Ticket tags mapping
CREATE TABLE IF NOT EXISTS support_ticket_tags (
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES support_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

-- 52) Promotions (flexible coupons)
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  -- Code and naming
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  -- Discount model
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value >= 0),
  max_discount_amount DECIMAL(10,2) CHECK (max_discount_amount IS NULL OR max_discount_amount >= 0),
  min_order_amount DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
  -- Stacking / exclusivity
  is_stackable BOOLEAN NOT NULL DEFAULT FALSE,
  is_exclusive BOOLEAN NOT NULL DEFAULT FALSE, -- if TRUE, cannot be combined with any other promo
  exclusion_group VARCHAR(50),                 -- optional logical group; promos sharing a group can't stack
  -- Applicability/eligibility
  requires_code BOOLEAN NOT NULL DEFAULT TRUE,
  first_order_only BOOLEAN NOT NULL DEFAULT FALSE, -- apply only if user has 0 completed orders
  eligible_min_completed_orders INTEGER CHECK (eligible_min_completed_orders IS NULL OR eligible_min_completed_orders >= 0),
  eligible_max_completed_orders INTEGER CHECK (eligible_max_completed_orders IS NULL OR eligible_max_completed_orders >= 0),
  eligible_user_created_after TIMESTAMPTZ,
  eligible_user_created_before TIMESTAMPTZ,
  -- Usage limits
  global_usage_limit INTEGER CHECK (global_usage_limit IS NULL OR global_usage_limit >= 0),
  global_used_count INTEGER NOT NULL DEFAULT 0 CHECK (global_used_count >= 0),
  per_user_usage_limit INTEGER CHECK (per_user_usage_limit IS NULL OR per_user_usage_limit >= 0),
  per_user_period VARCHAR(20) NOT NULL DEFAULT 'lifetime'
    CHECK (per_user_period IN ('lifetime','per_day','per_week','per_month','per_year')),
  -- Validity window (NULL ends_at means never expire)
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Admin/audit
  created_by BIGSERIAL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Constraints
  CONSTRAINT uq_promotions_code_ci UNIQUE (code),
  CONSTRAINT chk_promotions_percent_range CHECK (
    discount_type <> 'percent' OR (discount_value > 0 AND discount_value <= 100)
  ),
  CONSTRAINT chk_promotions_window CHECK (
    ends_at IS NULL OR ends_at > starts_at
  )
);

-- 53) Explicit user targeting (allow/deny lists)
-- Include/exclude specific users for a promotion.
CREATE TABLE IF NOT EXISTS promotion_user_targets (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  include BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE=whitelist, FALSE=blacklist
  PRIMARY KEY (promotion_id, user_id)
);

-- 54) Applicability scopes (services and product types)
-- Limit promotion to specific services
CREATE TABLE IF NOT EXISTS promotion_services (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  include BOOLEAN NOT NULL DEFAULT TRUE, -- TRUE=only these; FALSE=exclude these
  PRIMARY KEY (promotion_id, service_id)
);

-- 55) Limit promotion to specific product types (e.g., shirt, bedsheet)
CREATE TABLE IF NOT EXISTS promotion_product_types (
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_type_id INTEGER NOT NULL REFERENCES product_types(id) ON DELETE RESTRICT,
  include BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (promotion_id, product_type_id)
);

-- 56) Redemptions and order mapping
-- Records each application of a promotion to an order (for enforcement and analytics)
CREATE TABLE IF NOT EXISTS promotion_redemptions (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id BIGSERIAL REFERENCES orders(id) ON DELETE SET NULL,
  code_used VARCHAR(50), -- snapshot of code at redemption time
  amount_discounted DECIMAL(10,2) NOT NULL CHECK (amount_discounted >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 57) If you want a direct order-to-promotion breakdown table (one order can have multiple promotions)
CREATE TABLE IF NOT EXISTS order_promotions (
  id SERIAL PRIMARY KEY,
  order_id BIGSERIAL NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  code_used VARCHAR(50),
  amount_discounted DECIMAL(10,2) NOT NULL CHECK (amount_discounted >= 0),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, promotion_id)
);

-- 58) Optional: unique codes pool for a promotion
-- Use when you want to generate unique, single-use codes for a given promotion.
CREATE TABLE IF NOT EXISTS promotion_unique_codes (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL UNIQUE,
  assigned_to_user_id BIGSERIAL REFERENCES users(id) ON DELETE SET NULL, -- optional pre-assignment
  is_redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--59) Laundry status history (audit log for laundry bags)
CREATE TABLE laundry_status_history (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status   VARCHAR(30) NOT NULL REFERENCES laundry_statuses(code),
  changed_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--60) 
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(255) NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--61)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_password_reset_user UNIQUE (user_id)
);

--62})
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id SERIAL PRIMARY KEY,
  user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'facebook'
  provider_user_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_oauth_provider_user UNIQUE(provider, provider_user_id)
);

--63)
-- **********************************************************************************
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 999,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- **********************************************************************************
-- 1. Modify users table to support admin approval workflow
ALTER TABLE users 
  -- Admin approval tracking
  ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  -- Profile completion link (for non-customer roles)
  ADD COLUMN IF NOT EXISTS profile_completion_token VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS profile_completion_token_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completion_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completion_token_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completion_token_validity_hours INTEGER DEFAULT 48,
  -- Pending status for non-customer roles before profile completion
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Update status check to include 'pending_approval'
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check 
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending_approval'));

-- 2. Create approval history table (audit trail)
CREATE TABLE IF NOT EXISTS user_approval_history (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'token_extended', 'token_regenerated', 'profile_completed')),
  performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  previous_status VARCHAR(20),
  new_status VARCHAR(20),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- **********************************************************************************
-- 3. Modify laundry_profiles to add missing essential fields
ALTER TABLE laundry_profiles
  -- Business details
  ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) CHECK (business_type IN ('individual', 'partnership', 'company', 'franchise')),
  ADD COLUMN IF NOT EXISTS years_in_business INTEGER CHECK (years_in_business >= 0),
  ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS has_gst BOOLEAN DEFAULT FALSE,
  -- Structured address
  ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
  ADD COLUMN IF NOT EXISTS landmark VARCHAR(255),
  ADD COLUMN IF NOT EXISTS city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  -- Contact person
  ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS contact_person_email CITEXT,
  -- Equipment
  ADD COLUMN IF NOT EXISTS number_of_machines INTEGER CHECK (number_of_machines >= 0),
  ADD COLUMN IF NOT EXISTS machine_types TEXT[],
  -- Banking (encrypt in production!)
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(11),
  ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255),
  -- Documents
  ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb,
  -- Status
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
Add coordinates check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chk_laundry_coordinates' 
      AND conrelid = 'laundry_profiles'::regclass
  ) THEN
    ALTER TABLE laundry_profiles ADD CONSTRAINT chk_laundry_coordinates 
      CHECK ((latitude IS NULL AND longitude IS NULL) OR 
             (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
  END IF;
END;
$$;

-- **********************************************************************************
-- 4. Update provider_service_areas to ensure it has all needed columns
ALTER TABLE provider_service_areas
  ADD COLUMN IF NOT EXISTS area_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- **********************************************************************************
-- 5. Modify delivery_profiles to add missing fields
ALTER TABLE delivery_profiles
  -- Vehicle details
  ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS vehicle_year INTEGER,
  ADD COLUMN IF NOT EXISTS license_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS license_expiry_date DATE,
  -- Banking
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(11),
  ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255),
  -- Emergency contact
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50),
  -- Status
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- **********************************************************************************
-- 1) Create partner_faqs table for role-specific FAQs
CREATE TABLE IF NOT EXISTS partner_faqs (
  id SERIAL PRIMARY KEY,
  role VARCHAR(30) NOT NULL CHECK (role IN ('delivery', 'laundry', 'general')),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'getting_started', 'earnings', 'requirements', 'operations', 'support'
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- **********************************************************************************
-- **********************************************************************************
-- **********************************TO-DOs******************************************
-- 1.add a stored procedure to apply a coupon to a cart (validates limits, computes discount, 
--  inserts cart_adjustments) and another to convert a cart into an order (copy items/services, 
--  apply coupons into order_adjustments and order_coupons)
-- 2.the wallet balance be strictly ledger-driven (remove the cached balance and compute from wallet_transactions
-- 3.a companion function to remove/rollback a promotion from an order (delete mapping, redemption, and adjustment), useful for cancellations or refunds