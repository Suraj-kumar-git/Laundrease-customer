-- ============================================================
-- 09-pricing-quickpickup.sql
-- 1. Modify product_types
-- 2. New quick_pickup_requests table
-- 3. Seed: services, product_types, product_service_prices
-- ============================================================

-- ============================================================
-- PART 1: Modify product_types
-- ============================================================

ALTER TABLE product_types
  ADD COLUMN IF NOT EXISTS pricing_model    VARCHAR(10) NOT NULL DEFAULT 'per_unit'
    CHECK (pricing_model IN ('per_kg', 'per_unit')),
  ADD COLUMN IF NOT EXISTS display_category VARCHAR(50) NOT NULL DEFAULT 'everyday'
    CHECK (display_category IN ('everyday', 'ethnic_formal', 'household', 'specialty')),
  ADD COLUMN IF NOT EXISTS icon             VARCHAR(10) DEFAULT '👕',
  ADD COLUMN IF NOT EXISTS sort_order       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_product_types_category
  ON product_types (display_category, sort_order);

CREATE INDEX IF NOT EXISTS idx_product_types_active
  ON product_types (is_active);

-- ============================================================
-- PART 2: quick_pickup_requests
-- ============================================================

CREATE TABLE IF NOT EXISTS quick_pickup_requests (
  id                    SERIAL PRIMARY KEY,
  -- Contact details
  full_name             VARCHAR(150) NOT NULL,
  phone                 VARCHAR(20) NOT NULL,
  email                 CITEXT,
  -- Location
  pincode               VARCHAR(10) NOT NULL,
  city                  VARCHAR(100),
  -- Request details
  service_type          VARCHAR(20) NOT NULL DEFAULT 'standard'
                          CHECK (service_type IN ('standard', 'express')),
  -- Services they are interested in (array of service names, free-form from UI)
  services_interested   TEXT[] NOT NULL DEFAULT '{}',
  notes                 TEXT,
  -- Which tab they came from
  request_mode          VARCHAR(20) NOT NULL DEFAULT 'callback'
                          CHECK (request_mode IN (
                            'callback',       -- user wants us to call them
                            'direct_call'     -- user found a provider and called directly
                          )),
  -- Provider they picked (only set for direct_call mode)
  preferred_provider_id BIGINT REFERENCES laundry_profiles(id) ON DELETE SET NULL,
  -- Lifecycle / CRM
  status                VARCHAR(20) NOT NULL DEFAULT 'new'
                          CHECK (status IN (
                            'new',          -- just submitted, not yet actioned
                            'contacted',    -- someone from ops called/emailed
                            'converted',    -- became a real order
                            'closed'        -- not interested / invalid number
                          )),
  converted_order_id    BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  contacted_at          TIMESTAMPTZ,
  contacted_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ops_notes             TEXT,               -- internal notes from ops team
  -- Source / attribution
  source                VARCHAR(50) NOT NULL DEFAULT 'quick_pickup_page',
  utm_source            VARCHAR(100),
  utm_medium            VARCHAR(100),
  utm_campaign          VARCHAR(100),
  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qpr_status
  ON quick_pickup_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qpr_pincode
  ON quick_pickup_requests (pincode);

CREATE INDEX IF NOT EXISTS idx_qpr_phone
  ON quick_pickup_requests (phone);

CREATE INDEX IF NOT EXISTS idx_qpr_created
  ON quick_pickup_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qpr_converted
  ON quick_pickup_requests (converted_order_id)
  WHERE converted_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_qpr_updated_at ON quick_pickup_requests;
CREATE TRIGGER trg_qpr_updated_at
  BEFORE UPDATE ON quick_pickup_requests
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- PART 3: Seed data
-- ============================================================

-- ---- Services -----------------------------------------------
-- These are the platform-level service definitions.
-- Providers can override pricing via provider_services table.

INSERT INTO services (name, description, category, base_price, price_per_kg, turnaround_hours, is_express_available, express_multiplier)
VALUES
  ('Wash & Fold',     'Machine wash + tumble dry + fold',                         'wash_fold',     49.00, 49.00, 24, TRUE,  1.5),
  ('Dry Cleaning',    'Professional dry cleaning for delicate garments',           'dry_cleaning',  99.00, NULL,  48, TRUE,  1.5),
  ('Steam Ironing',   'Steam press for crisp, wrinkle-free clothes',               'steam_ironing', 15.00, NULL,  12, TRUE,  1.5),
  ('Wash & Iron',     'Machine wash + tumble dry + steam press',                   'wash_iron',     69.00, 69.00, 36, TRUE,  1.5),
  ('Stain Removal',   'Targeted treatment for tough stains before washing',        'stain_removal', 79.00, NULL,  24, FALSE, 1.0),
  ('Shoe Cleaning',   'Deep clean and deodorize for all types of footwear',        'shoe_cleaning', 149.00, NULL, 48, FALSE, 1.0)
ON CONFLICT DO NOTHING;

-- ---- Product Types ------------------------------------------
-- pricing_model = 'per_kg'   → user enters weight (kg)
-- pricing_model = 'per_unit' → user enters quantity

-- EVERYDAY (per_kg items — standard laundry)
INSERT INTO product_types (name, description, pricing_model, display_category, icon, sort_order)
VALUES
  ('Regular Laundry (Mixed)',   'T-shirts, shirts, trousers, innerwear, socks, etc.',  'per_kg',   'everyday',       '👕', 10),
  ('T-Shirt',                   'Round neck or polo t-shirts',                          'per_unit', 'everyday',       '👕', 20),
  ('Formal Shirt',              'Cotton or polyester formal/casual shirts',              'per_unit', 'everyday',       '👔', 30),
  ('Trouser / Jeans',           'Formal trousers, jeans, chinos',                       'per_unit', 'everyday',       '👖', 40),
  ('Shorts',                    'Casual or sports shorts',                               'per_unit', 'everyday',       '🩳', 50),
  ('Undergarments (set)',       'Innerwear, bras, underwear — per set',                  'per_unit', 'everyday',       '🧦', 60),
  ('Socks (pair)',              'Per pair',                                              'per_unit', 'everyday',       '🧦', 70),
  ('Gym / Sports Wear',         'Leggings, track pants, sports jerseys',                'per_unit', 'everyday',       '🏋️', 80)
ON CONFLICT (name) DO UPDATE
  SET pricing_model    = EXCLUDED.pricing_model,
      display_category = EXCLUDED.display_category,
      icon             = EXCLUDED.icon,
      sort_order       = EXCLUDED.sort_order;

-- ETHNIC & FORMAL (per_unit — special care)
INSERT INTO product_types (name, description, pricing_model, display_category, icon, sort_order)
VALUES
  ('Saree',           'Cotton, silk, or synthetic saree',                           'per_unit', 'ethnic_formal', '🥻', 10),
  ('Salwar Kameez',   'Salwar + kameez as a set',                                   'per_unit', 'ethnic_formal', '👘', 20),
  ('Lehenga (set)',   'Blouse + skirt + dupatta',                                   'per_unit', 'ethnic_formal', '👘', 30),
  ('Sherwani',        'Full sherwani or achkan',                                    'per_unit', 'ethnic_formal', '🎽', 40),
  ('Suit (2-piece)',  'Blazer + trousers or formal 2-piece suit',                   'per_unit', 'ethnic_formal', '🤵', 50),
  ('Blazer / Jacket', 'Suit jacket, blazer, or sport coat',                         'per_unit', 'ethnic_formal', '🧥', 60),
  ('Dress',           'Western dress, gown, or maxi',                               'per_unit', 'ethnic_formal', '👗', 70),
  ('Kurta (men)',     'Cotton or silk kurta',                                       'per_unit', 'ethnic_formal', '👘', 80),
  ('Saree Blouse',    'Blouse only',                                                'per_unit', 'ethnic_formal', '👗', 90),
  ('Dupatta / Stole', 'Dupatta, stole, or scarf',                                   'per_unit', 'ethnic_formal', '🧣', 100)
ON CONFLICT (name) DO UPDATE
  SET pricing_model    = EXCLUDED.pricing_model,
      display_category = EXCLUDED.display_category,
      icon             = EXCLUDED.icon,
      sort_order       = EXCLUDED.sort_order;

-- HOUSEHOLD (per_unit — bulky items)
INSERT INTO product_types (name, description, pricing_model, display_category, icon, sort_order)
VALUES
  ('Single Bedsheet',     'Single bed flat sheet or fitted sheet',           'per_unit', 'household', '🛏️', 10),
  ('Double Bedsheet',     'Double / queen / king bed sheet',                 'per_unit', 'household', '🛏️', 20),
  ('Pillow Cover',        'Standard pillow cover or pillowcase',             'per_unit', 'household', '🪑', 30),
  ('Single Blanket',      'Single bed blanket or quilt',                     'per_unit', 'household', '🛌', 40),
  ('Double Blanket',      'Double bed blanket, comforter, or quilt',         'per_unit', 'household', '🛌', 50),
  ('Bath Towel',          'Full size bath towel',                            'per_unit', 'household', '🏊', 60),
  ('Hand Towel',          'Small hand towel or face towel',                  'per_unit', 'household', '🧴', 70),
  ('Curtain (single)',    'One curtain panel, up to 7 ft length',            'per_unit', 'household', '🪟', 80),
  ('Curtain (pair)',      'Pair of curtain panels',                          'per_unit', 'household', '🪟', 90),
  ('Table Cloth',         'Dining or center table cloth',                    'per_unit', 'household', '🍽️', 100),
  ('Sofa Cover (seat)',   'Single sofa seat cover',                          'per_unit', 'household', '🛋️', 110)
ON CONFLICT (name) DO UPDATE
  SET pricing_model    = EXCLUDED.pricing_model,
      display_category = EXCLUDED.display_category,
      icon             = EXCLUDED.icon,
      sort_order       = EXCLUDED.sort_order;

-- SPECIALTY
INSERT INTO product_types (name, description, pricing_model, display_category, icon, sort_order)
VALUES
  ('Sneakers / Sports Shoes', 'Canvas, mesh, or sports sneakers',           'per_unit', 'specialty', '👟', 10),
  ('Formal Shoes',            'Leather or suede formal shoes',              'per_unit', 'specialty', '👞', 20),
  ('Sandals / Slippers',      'Flat sandals or rubber slippers',            'per_unit', 'specialty', '🩴', 30),
  ('Woolen Sweater',          'Knit sweater or pullover',                   'per_unit', 'specialty', '🧶', 40),
  ('Winter Jacket / Coat',    'Heavy winter jacket, parka, or overcoat',    'per_unit', 'specialty', '🧥', 50),
  ('Backpack / Bag',          'School bag, backpack, or tote',              'per_unit', 'specialty', '🎒', 60),
  ('Stuffed Toy',             'Plush toys or stuffed animals',              'per_unit', 'specialty', '🧸', 70)
ON CONFLICT (name) DO UPDATE
  SET pricing_model    = EXCLUDED.pricing_model,
      display_category = EXCLUDED.display_category,
      icon             = EXCLUDED.icon,
      sort_order       = EXCLUDED.sort_order;

-- ---- product_service_prices (base platform pricing) ---------
-- Rule:
--   per_kg items  → unit_price = price per kg
--   per_unit items → unit_price = price per piece/set/pair
--
-- We only map product_types to services that actually make sense.
-- Not every product needs every service.

-- Helper: get IDs by name for the INSERT below
-- We use a WITH block for readability

WITH svc AS (
  SELECT id, name FROM services
),
pt AS (
  SELECT id, name FROM product_types
)
INSERT INTO product_service_prices (product_type_id, service_id, unit_price, currency)
SELECT pt.id, svc.id, p.unit_price, 'INR'
FROM (VALUES
  -- ---- Wash & Fold (per_kg for bulk, per_unit for special items) ----
  ('Regular Laundry (Mixed)',   'Wash & Fold',   49.00),
  ('T-Shirt',                   'Wash & Fold',   25.00),
  ('Formal Shirt',              'Wash & Fold',   30.00),
  ('Trouser / Jeans',           'Wash & Fold',   40.00),
  ('Shorts',                    'Wash & Fold',   25.00),
  ('Undergarments (set)',       'Wash & Fold',   20.00),
  ('Socks (pair)',              'Wash & Fold',   10.00),
  ('Gym / Sports Wear',         'Wash & Fold',   30.00),
  ('Saree',                     'Wash & Fold',   79.00),
  ('Salwar Kameez',             'Wash & Fold',   59.00),
  ('Kurta (men)',               'Wash & Fold',   39.00),
  ('Dress',                     'Wash & Fold',   49.00),
  ('Dupatta / Stole',           'Wash & Fold',   29.00),
  ('Single Bedsheet',           'Wash & Fold',   59.00),
  ('Double Bedsheet',           'Wash & Fold',   79.00),
  ('Pillow Cover',              'Wash & Fold',   19.00),
  ('Single Blanket',            'Wash & Fold',   99.00),
  ('Double Blanket',            'Wash & Fold',   149.00),
  ('Bath Towel',                'Wash & Fold',   39.00),
  ('Hand Towel',                'Wash & Fold',   19.00),
  ('Curtain (single)',          'Wash & Fold',   69.00),
  ('Curtain (pair)',            'Wash & Fold',   129.00),
  ('Table Cloth',               'Wash & Fold',   39.00),
  ('Sofa Cover (seat)',         'Wash & Fold',   49.00),
  ('Woolen Sweater',            'Wash & Fold',   79.00),

  -- ---- Dry Cleaning ----
  ('Saree',                     'Dry Cleaning',  149.00),
  ('Salwar Kameez',             'Dry Cleaning',  129.00),
  ('Lehenga (set)',             'Dry Cleaning',  299.00),
  ('Sherwani',                  'Dry Cleaning',  349.00),
  ('Suit (2-piece)',            'Dry Cleaning',  299.00),
  ('Blazer / Jacket',           'Dry Cleaning',  199.00),
  ('Dress',                     'Dry Cleaning',  179.00),
  ('Kurta (men)',               'Dry Cleaning',  99.00),
  ('Saree Blouse',              'Dry Cleaning',  79.00),
  ('Dupatta / Stole',           'Dry Cleaning',  79.00),
  ('Formal Shirt',              'Dry Cleaning',  99.00),
  ('Trouser / Jeans',           'Dry Cleaning',  119.00),
  ('Winter Jacket / Coat',      'Dry Cleaning',  249.00),
  ('Woolen Sweater',            'Dry Cleaning',  149.00),
  ('Single Blanket',            'Dry Cleaning',  199.00),
  ('Double Blanket',            'Dry Cleaning',  299.00),
  ('Curtain (single)',          'Dry Cleaning',  149.00),
  ('Curtain (pair)',            'Dry Cleaning',  279.00),

  -- ---- Steam Ironing ----
  ('T-Shirt',                   'Steam Ironing',  10.00),
  ('Formal Shirt',              'Steam Ironing',  15.00),
  ('Trouser / Jeans',           'Steam Ironing',  15.00),
  ('Shorts',                    'Steam Ironing',  10.00),
  ('Saree',                     'Steam Ironing',  39.00),
  ('Salwar Kameez',             'Steam Ironing',  29.00),
  ('Lehenga (set)',             'Steam Ironing',  79.00),
  ('Sherwani',                  'Steam Ironing',  79.00),
  ('Suit (2-piece)',            'Steam Ironing',  59.00),
  ('Blazer / Jacket',           'Steam Ironing',  39.00),
  ('Dress',                     'Steam Ironing',  29.00),
  ('Kurta (men)',               'Steam Ironing',  19.00),
  ('Saree Blouse',              'Steam Ironing',  15.00),
  ('Dupatta / Stole',           'Steam Ironing',  15.00),
  ('Single Bedsheet',           'Steam Ironing',  25.00),
  ('Double Bedsheet',           'Steam Ironing',  35.00),
  ('Curtain (single)',          'Steam Ironing',  39.00),
  ('Curtain (pair)',            'Steam Ironing',  69.00),
  ('Table Cloth',               'Steam Ironing',  19.00),

  -- ---- Wash & Iron ----
  ('T-Shirt',                   'Wash & Iron',  35.00),
  ('Formal Shirt',              'Wash & Iron',  45.00),
  ('Trouser / Jeans',           'Wash & Iron',  55.00),
  ('Shorts',                    'Wash & Iron',  35.00),
  ('Saree',                     'Wash & Iron',  99.00),
  ('Salwar Kameez',             'Wash & Iron',  79.00),
  ('Kurta (men)',               'Wash & Iron',  55.00),
  ('Dress',                     'Wash & Iron',  69.00),
  ('Single Bedsheet',           'Wash & Iron',  79.00),
  ('Double Bedsheet',           'Wash & Iron',  99.00),
  ('Pillow Cover',              'Wash & Iron',  29.00),
  ('Table Cloth',               'Wash & Iron',  49.00),

  -- ---- Stain Removal (add-on to other services) ----
  ('T-Shirt',                   'Stain Removal',  49.00),
  ('Formal Shirt',              'Stain Removal',  49.00),
  ('Trouser / Jeans',           'Stain Removal',  59.00),
  ('Saree',                     'Stain Removal',  99.00),
  ('Salwar Kameez',             'Stain Removal',  79.00),
  ('Suit (2-piece)',            'Stain Removal',  99.00),
  ('Single Bedsheet',           'Stain Removal',  69.00),
  ('Double Bedsheet',           'Stain Removal',  89.00),

  -- ---- Shoe Cleaning ----
  ('Sneakers / Sports Shoes',  'Shoe Cleaning',  149.00),
  ('Formal Shoes',             'Shoe Cleaning',  179.00),
  ('Sandals / Slippers',       'Shoe Cleaning',   79.00),
  ('Backpack / Bag',           'Shoe Cleaning',  129.00)

) AS p(pt_name, svc_name, unit_price)
JOIN svc ON svc.name = p.svc_name
JOIN pt  ON pt.name  = p.pt_name
ON CONFLICT (product_type_id, service_id)
  DO UPDATE SET unit_price = EXCLUDED.unit_price;
