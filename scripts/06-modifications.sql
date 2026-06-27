-- No 'sla_deadline' & 'express' column present in orders table and one depending function does not exist
-- DROP TRIGGER IF EXISTS trg_set_sla_before_insert ON orders;
-- DROP FUNCTION IF EXISTS set_sla_deadline();

-- Created during implementing user session management, password reset, and OAuth account linking features
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USER SESSIONS TABLE (if not exists)
-- ============================================

-- CREATE TABLE IF NOT EXISTS user_sessions (
--   id SERIAL PRIMARY KEY,
--   user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   session_id VARCHAR(255) NOT NULL UNIQUE,
--   refresh_token TEXT NOT NULL,
--   expires_at TIMESTAMPTZ NOT NULL,
--   ip_address VARCHAR(45),
--   user_agent TEXT,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
-- CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
-- CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- -- ============================================
-- -- PASSWORD RESET TOKENS TABLE (if not exists)
-- -- ============================================

-- CREATE TABLE IF NOT EXISTS password_reset_tokens (
--   id SERIAL PRIMARY KEY,
--   user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   token_hash VARCHAR(64) NOT NULL UNIQUE,
--   expires_at TIMESTAMPTZ NOT NULL,
--   used_at TIMESTAMPTZ,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   CONSTRAINT uq_password_reset_user UNIQUE (user_id)
-- );

-- CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
-- CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
-- CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);

-- -- ============================================
-- -- OAUTH ACCOUNTS TABLE (if not exists)
-- -- ============================================

-- CREATE TABLE IF NOT EXISTS oauth_accounts (
--   id SERIAL PRIMARY KEY,
--   user_id BIGSERIAL NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   provider VARCHAR(50) NOT NULL, -- 'google', 'facebook'
--   provider_user_id VARCHAR(255) NOT NULL,
--   access_token TEXT,
--   refresh_token TEXT,
--   expires_at TIMESTAMPTZ,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   CONSTRAINT uq_oauth_provider_user UNIQUE(provider, provider_user_id)
-- );

-- CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
-- CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);

-- -- Function to clean up expired sessions
-- CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
-- RETURNS INTEGER AS $$
-- DECLARE
--   deleted_count INTEGER;
-- BEGIN
--   DELETE FROM user_sessions
--   WHERE expires_at < NOW();
  
--   GET DIAGNOSTICS deleted_count = ROW_COUNT;
--   RETURN deleted_count;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- Function to clean up expired reset tokens
-- CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
-- RETURNS INTEGER AS $$
-- DECLARE
--   deleted_count INTEGER;
-- BEGIN
--   DELETE FROM password_reset_tokens
--   WHERE expires_at < NOW()
--     OR used_at IS NOT NULL;
  
--   GET DIAGNOSTICS deleted_count = ROW_COUNT;
--   RETURN deleted_count;
-- END;
-- $$ LANGUAGE plpgsql;

-- -- ============================================
-- -- TRIGGER: Auto-update oauth_accounts updated_at
-- -- ============================================

-- CREATE OR REPLACE FUNCTION update_oauth_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS trg_oauth_accounts_updated_at ON oauth_accounts;
-- CREATE TRIGGER trg_oauth_accounts_updated_at
--   BEFORE UPDATE ON oauth_accounts
--   FOR EACH ROW
--   EXECUTE FUNCTION update_oauth_updated_at();

-- -- ============================================
-- -- TRIGGER: Update last_activity on session access
-- -- ============================================

-- CREATE OR REPLACE FUNCTION update_session_activity()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.last_activity = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS trg_user_sessions_activity ON user_sessions;
-- CREATE TRIGGER trg_user_sessions_activity
--   BEFORE UPDATE ON user_sessions
--   FOR EACH ROW
--   EXECUTE FUNCTION update_session_activity();

-- -- ============================================
-- -- INDEXES FOR PERFORMANCE
-- -- ============================================

-- -- Users table indexes (if not exist)
-- CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email::TEXT));
-- CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
-- CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
-- CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role_id, status);

-- -- Composite index for common queries
-- CREATE INDEX IF NOT EXISTS idx_users_email_status ON users(email, status) WHERE deleted_at IS NULL;

-- -- ============================================
-- -- SECURITY: Row Level Security (Optional but recommended)
-- -- ============================================

-- -- Enable RLS on sensitive tables
-- -- Uncomment if you want to use RLS

-- ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE oauth_accounts ENABLE ROW LEVEL SECURITY;

-- -- Example RLS policy (users can only see their own sessions)
-- CREATE POLICY user_sessions_policy ON user_sessions
--   FOR ALL
--   USING (user_id = current_setting('app.current_user_id')::BIGINT);

-- -- ============================================
-- -- DATA VALIDATION CONSTRAINTS
-- -- ============================================

-- -- Ensure email_verified and email_verified_at are consistent
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_email_verified;
-- ALTER TABLE users ADD CONSTRAINT chk_users_email_verified CHECK (
--   (email_verified AND email_verified_at IS NOT NULL)
--   OR (NOT email_verified AND email_verified_at IS NULL)
-- );

-- -- Ensure phone_verified and phone_verified_at are consistent
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_phone_verified;
-- ALTER TABLE users ADD CONSTRAINT chk_users_phone_verified CHECK (
--   (phone_verified AND phone_verified_at IS NOT NULL)
--   OR (NOT phone_verified AND phone_verified_at IS NULL)
-- );

-- -- ============================================
-- -- HELPER VIEWS
-- -- ============================================

-- -- View for active user sessions
-- CREATE OR REPLACE VIEW active_user_sessions AS
-- SELECT 
--   s.id,
--   s.user_id,
--   s.session_id,
--   s.expires_at,
--   s.ip_address,
--   s.user_agent,
--   s.created_at,
--   s.last_activity,
--   u.email,
--   u.full_name,
--   r.name as role_name
-- FROM user_sessions s
-- INNER JOIN users u ON u.id = s.user_id
-- INNER JOIN roles r ON r.id = u.role_id
-- WHERE s.expires_at > NOW()
--   AND u.deleted_at IS NULL
--   AND u.status = 'active';

-- -- View for user authentication info
-- CREATE OR REPLACE VIEW user_auth_info AS
-- SELECT 
--   u.id,
--   u.email,
--   u.full_name,
--   u.phone,
--   u.status,
--   u.email_verified,
--   u.phone_verified,
--   u.last_logged_in,
--   r.name as role_name,
--   CASE 
--     WHEN EXISTS (
--       SELECT 1 FROM oauth_accounts oa 
--       WHERE oa.user_id = u.id
--     ) THEN true 
--     ELSE false 
--   END as has_oauth_linked,
--   CASE 
--     WHEN EXISTS (
--       SELECT 1 FROM user_sessions s 
--       WHERE s.user_id = u.id 
--         AND s.expires_at > NOW()
--     ) THEN true 
--     ELSE false 
--   END as has_active_session
-- FROM users u
-- INNER JOIN roles r ON r.id = u.role_id
-- WHERE u.deleted_at IS NULL;

-- -- ============================================
-- -- SCHEDULED MAINTENANCE (Setup in cron or pg_cron)
-- -- ============================================

-- -- Example: Clean up expired sessions daily
-- -- SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions()');

-- -- Example: Clean up expired tokens daily
-- -- SELECT cron.schedule('cleanup-tokens', '0 3 * * *', 'SELECT cleanup_expired_reset_tokens()');

-- -- ============================================
-- -- GRANTS (Adjust based on your database user)
-- -- ============================================

-- -- Grant permissions to your application user
-- -- GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO your_app_user;
-- -- GRANT SELECT, INSERT, UPDATE, DELETE ON password_reset_tokens TO your_app_user;
-- -- GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_accounts TO your_app_user;
-- -- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

--   END as oauth_accounts_status;


-- For FAQs
-- CREATE TABLE IF NOT EXISTS faqs (
--   id SERIAL PRIMARY KEY,
--   question TEXT NOT NULL,
--   answer TEXT NOT NULL,
--   category VARCHAR(50) NOT NULL DEFAULT 'general',
--   sort_order INTEGER NOT NULL DEFAULT 999,
--   is_active BOOLEAN NOT NULL DEFAULT true,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
 
-- -- Create index for faster queries
-- CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
-- CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active);
-- CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order);
 
-- -- Create trigger to auto-update updated_at
-- CREATE OR REPLACE FUNCTION update_faqs_updated_at()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   NEW.updated_at = NOW();
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
 
-- DROP TRIGGER IF EXISTS trg_faqs_updated_at ON faqs;
-- CREATE TRIGGER trg_faqs_updated_at
-- BEFORE UPDATE ON faqs
-- FOR EACH ROW
-- EXECUTE FUNCTION update_faqs_updated_at();

-- INSERT INTO faqs (question, answer, category, sort_order) VALUES
-- ('What is Laundrease?', 'Laundrease is an on-demand laundry service platform that connects customers with professional laundry providers. We offer convenient pickup and delivery services, ensuring your clothes are cleaned, pressed, and delivered back to you with care.', 'general', 1),
-- ('What areas do you serve?', 'We currently serve Pune (Pimpri-Chinchwad, Wakad, Hinjewadi, Baner, and surrounding areas). Enter your pincode on our homepage to check if we deliver to your location. We are rapidly expanding to new areas!', 'general', 2),
-- ('How do I create an account?', 'Click on "Sign Up" at the top right corner, enter your email, phone number, and create a password. You will receive an OTP for verification. Once verified, you can start placing orders immediately!', 'general', 3),
-- ('How do I place an order?', 'Simply log in, select the services you need (wash & fold, dry cleaning, ironing, etc.), choose a pickup time, add your address, and place your order. Our delivery partner will pick up your laundry at the scheduled time.', 'orders', 4),
-- ('What is the minimum order value?', 'The minimum order value is ₹100. However, this may vary depending on the laundry provider you choose. Some providers offer free delivery for orders above ₹500.', 'orders', 5),
-- ('Can I schedule a pickup for later?', 'Yes! You can schedule your pickup for any date and time slot that works for you. We offer flexible time slots from 9 AM to 9 PM. Express service is also available for same-day delivery.', 'orders', 6),
-- ('Can I track my order?', 'Absolutely! Once your order is placed, you can track it in real-time from the "My Orders" section. You will receive notifications at every stage: pickup, washing, quality check, and delivery.', 'orders', 7),
-- ('How is pricing calculated?', 'Pricing depends on the type of service (wash & fold, dry cleaning, ironing), the weight or quantity of items, and the laundry provider you choose. You can see the exact breakdown before placing your order. We charge ₹40-80 per kg for wash & fold and ₹150+ for dry cleaning.', 'pricing', 8),
-- ('Are there any hidden charges?', 'No hidden charges! The price you see at checkout includes service charges, taxes (18% GST), and delivery fees. If you have a promo code, apply it to see your final discounted price.', 'pricing', 9),
-- ('What payment methods do you accept?', 'We accept UPI, credit/debit cards, net banking, and wallet payments (Paytm, PhonePe, Google Pay). You can also pay cash on delivery in select areas. All transactions are 100% secure.', 'pricing', 10),
-- ('How long does it take to get my laundry back?', 'Standard service takes 24-48 hours. Express service delivers within 12 hours. The exact turnaround time depends on the laundry provider and the type of service selected. You will see the estimated delivery time when placing your order.', 'delivery', 11),
-- ('What if I am not home during delivery?', 'No problem! You can provide special delivery instructions such as "leave with security" or "call before delivery". You can also reschedule the delivery from your order dashboard.', 'delivery', 12),
-- ('Is there a delivery charge?', 'Delivery charges vary by provider and distance. Typically, it ranges from ₹30-50. Many providers offer free delivery for orders above ₹500. You will see the exact delivery charge at checkout.', 'delivery', 13),
-- ('How can I join as a Laundry Provider?', 'We welcome professional laundry service providers! Click on "Become a Partner" at the bottom of the page, or email us at partners@laundrease.com. You will need to provide your business license, service details, and complete a verification process. Once approved, you can start receiving orders from our platform.', 'partners', 14),
-- ('How can I join as a Delivery Partner?', 'Want to earn by delivering laundry? Click on "Become a Delivery Partner" or email us at delivery@laundrease.com. You will need a valid vehicle (bike, scooter, or van), a driving license, and complete a background check. Flexible working hours and competitive earnings!', 'partners', 15),
-- ('What are the requirements to become a partner?', 'For Laundry Providers: Valid business license, commercial laundry equipment, quality certifications. For Delivery Partners: Valid driving license, own vehicle, smartphone, background verification. Both need to agree to our terms of service and quality standards.', 'partners', 16),
-- ('How much can I earn as a partner?', 'Earnings vary based on the number of orders you complete. Laundry providers typically earn 70-85% of the order value. Delivery partners earn ₹30-50 per delivery. Top performers can earn ₹30,000-50,000+ per month!', 'partners', 17)
-- ON CONFLICT DO NOTHING;

-- ============================================================================
-- MULTI-ROLE REGISTRATION - MINIMAL MODIFICATIONS TO EXISTING SCHEMA
-- ============================================================================
-- This modifies existing tables instead of creating new ones

-- 1. Modify users table to support admin approval workflow
-- ALTER TABLE users 
--   -- Admin approval tracking
--   ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
--   ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  
--   -- Profile completion link (for non-customer roles)
--   ADD COLUMN IF NOT EXISTS profile_completion_token VARCHAR(255) UNIQUE,
--   ADD COLUMN IF NOT EXISTS profile_completion_token_generated_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS profile_completion_token_expires_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS profile_completion_token_used_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS profile_completion_token_validity_hours INTEGER DEFAULT 48,
  
--   -- Pending status for non-customer roles before profile completion
--   ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- -- Update status check to include 'pending_approval'
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
-- ALTER TABLE users ADD CONSTRAINT users_status_check 
--   CHECK (status IN ('active', 'inactive', 'suspended', 'pending_approval'));

-- -- 2. Create approval history table (audit trail)
-- CREATE TABLE IF NOT EXISTS user_approval_history (
--   id SERIAL PRIMARY KEY,
--   user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--   action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'token_extended', 'token_regenerated', 'profile_completed')),
--   performed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
--   previous_status VARCHAR(20),
--   new_status VARCHAR(20),
--   reason TEXT,
--   metadata JSONB DEFAULT '{}'::jsonb,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_user_approval_history_user ON user_approval_history(user_id);
-- CREATE INDEX IF NOT EXISTS idx_user_approval_history_performed ON user_approval_history(performed_by);

-- -- 3. Modify laundry_profiles to add missing essential fields
-- ALTER TABLE laundry_profiles
--   -- Business details
--   ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) CHECK (business_type IN ('individual', 'partnership', 'company', 'franchise')),
--   ADD COLUMN IF NOT EXISTS years_in_business INTEGER CHECK (years_in_business >= 0),
--   ADD COLUMN IF NOT EXISTS gst_number VARCHAR(50),
--   ADD COLUMN IF NOT EXISTS has_gst BOOLEAN DEFAULT FALSE,
  
--   -- Structured address
--   ADD COLUMN IF NOT EXISTS address_line1 VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS address_line2 VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS landmark VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS city VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS state VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'India',
--   ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
--   ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  
--   -- Contact person
--   ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS contact_person_email CITEXT,
  
--   -- Equipment
--   ADD COLUMN IF NOT EXISTS number_of_machines INTEGER CHECK (number_of_machines >= 0),
--   ADD COLUMN IF NOT EXISTS machine_types TEXT[],
  
--   -- Banking (encrypt in production!)
--   ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(11),
--   ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255),
  
--   -- Documents
--   ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb,
  
--   -- Status
--   ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
--     CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
--   ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
--   ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add coordinates check
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 
--     FROM pg_constraint 
--     WHERE conname = 'chk_laundry_coordinates' 
--       AND conrelid = 'laundry_profiles'::regclass
--   ) THEN
--     ALTER TABLE laundry_profiles ADD CONSTRAINT chk_laundry_coordinates 
--       CHECK ((latitude IS NULL AND longitude IS NULL) OR 
--              (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180));
--   END IF;
-- END;
-- $$;

-- Indexes for search
-- CREATE INDEX IF NOT EXISTS idx_laundry_profiles_postal_code ON laundry_profiles(postal_code);
-- CREATE INDEX IF NOT EXISTS idx_laundry_profiles_city ON laundry_profiles(city);
-- CREATE INDEX IF NOT EXISTS idx_laundry_profiles_status ON laundry_profiles(status);

-- 4. Update provider_service_areas to ensure it has all needed columns
-- ALTER TABLE provider_service_areas
--   ADD COLUMN IF NOT EXISTS area_name VARCHAR(255),
--   ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
--   ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- CREATE INDEX IF NOT EXISTS idx_provider_service_areas_postal ON provider_service_areas(postal_code);
-- CREATE INDEX IF NOT EXISTS idx_provider_service_areas_active ON provider_service_areas(is_active);

-- 5. Modify delivery_profiles to add missing fields
-- ALTER TABLE delivery_profiles
--   -- Vehicle details
--   ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS vehicle_year INTEGER,
--   ADD COLUMN IF NOT EXISTS license_type VARCHAR(50),
--   ADD COLUMN IF NOT EXISTS license_expiry_date DATE,
  
--   -- Banking
--   ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS bank_ifsc_code VARCHAR(11),
--   ADD COLUMN IF NOT EXISTS bank_account_holder_name VARCHAR(255),
  
--   -- Emergency contact
--   ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(100),
--   ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20),
--   ADD COLUMN IF NOT EXISTS emergency_contact_relation VARCHAR(50),
  
--   -- Status
--   ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
--     CHECK (status IN ('pending', 'active', 'inactive', 'suspended')),
--   ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE,
--   ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
--   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- -- 6. Add updated_at triggers for modified tables
-- DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
-- CREATE TRIGGER trg_users_updated_at
--   BEFORE UPDATE ON users
--   FOR EACH ROW
--   EXECUTE FUNCTION set_updated_at();

-- DROP TRIGGER IF EXISTS trg_laundry_profiles_updated_at ON laundry_profiles;
-- CREATE TRIGGER trg_laundry_profiles_updated_at
--   BEFORE UPDATE ON laundry_profiles
--   FOR EACH ROW
--   EXECUTE FUNCTION set_updated_at();

-- DROP TRIGGER IF EXISTS trg_delivery_profiles_updated_at ON delivery_profiles;
-- CREATE TRIGGER trg_delivery_profiles_updated_at
--   BEFORE UPDATE ON delivery_profiles
--   FOR EACH ROW
--   EXECUTE FUNCTION set_updated_at();

-- -- 7. Helper functions for profile completion workflow
-- CREATE OR REPLACE FUNCTION generate_profile_completion_token()
-- RETURNS VARCHAR(255) AS $$
-- BEGIN
--   RETURN encode(gen_random_bytes(32), 'hex');
-- END;
-- $$ LANGUAGE plpgsql;

-- CREATE OR REPLACE FUNCTION extend_profile_completion_token(
--   p_user_id BIGINT,
--   p_admin_id BIGINT,
--   p_hours INTEGER
-- )
-- RETURNS VOID AS $$
-- DECLARE
--   v_new_expiry TIMESTAMPTZ;
-- BEGIN
--   v_new_expiry := NOW() + (p_hours || ' hours')::INTERVAL;
  
--   UPDATE users
--   SET 
--     profile_completion_token_expires_at = v_new_expiry,
--     profile_completion_token_validity_hours = p_hours,
--     updated_at = NOW()
--   WHERE id = p_user_id;
  
--   INSERT INTO user_approval_history (user_id, action, performed_by, metadata)
--   VALUES (
--     p_user_id,
--     'token_extended',
--     p_admin_id,
--     jsonb_build_object('new_expiry', v_new_expiry, 'hours_added', p_hours)
--   );
-- END;
-- $$ LANGUAGE plpgsql;

-- 8. Search function for laundry providers (supports pincode search)
-- CREATE OR REPLACE FUNCTION search_laundry_providers(
--   p_search_term VARCHAR DEFAULT NULL,
--   p_min_rating DECIMAL DEFAULT 0,
--   p_limit INTEGER DEFAULT 50,
--   p_offset INTEGER DEFAULT 0
-- )
-- RETURNS TABLE (
--   id BIGINT,
--   business_name VARCHAR,
--   city VARCHAR,
--   postal_code VARCHAR,
--   rating DECIMAL,
--   services_offered TEXT[],
--   serviceable_pincodes VARCHAR[]
-- ) AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT 
--     lp.id,
--     lp.business_name,
--     lp.city,
--     lp.postal_code,
--     lp.rating,
--     lp.services_offered,
--     COALESCE(
--       array_agg(DISTINCT psa.postal_code) FILTER (WHERE psa.postal_code IS NOT NULL),
--       ARRAY[]::VARCHAR[]
--     ) as serviceable_pincodes
--   FROM laundry_profiles lp
--   LEFT JOIN provider_service_areas psa ON psa.provider_id = lp.id AND psa.is_active = TRUE
--   WHERE lp.status = 'active'
--     AND lp.is_verified = TRUE
--     AND lp.rating >= p_min_rating
--     AND (
--       p_search_term IS NULL
--       OR lp.postal_code ILIKE p_search_term || '%'
--       OR psa.postal_code ILIKE p_search_term || '%'
--       OR lp.city ILIKE '%' || p_search_term || '%'
--       OR psa.city ILIKE '%' || p_search_term || '%'
--       OR lp.service_area ILIKE '%' || p_search_term || '%'
--     )
--   GROUP BY lp.id
--   ORDER BY lp.rating DESC, lp.business_name ASC
--   LIMIT p_limit
--   OFFSET p_offset;
-- END;
-- $$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- SUMMARY OF CHANGES
-- ============================================================================
-- 1. Modified users table: Added admin approval & profile completion token fields
-- 2. Created user_approval_history: Audit trail for all admin actions
-- 3. Modified laundry_profiles: Added 20+ missing columns
-- 4. Modified delivery_profiles: Added missing vehicle, banking, emergency fields
-- 5. Modified provider_service_areas: Ensured completeness
-- 6. Added search function: Supports pincode/city/area search
-- 7. No duplicate tables created - reused ALL existing tables

-- ========================================
-- PARTNER FAQS & MODIFICATIONS
-- ========================================
-- This script adds role-based FAQs for partners
 
-- -- 1) Create partner_faqs table for role-specific FAQs
-- CREATE TABLE IF NOT EXISTS partner_faqs (
--   id SERIAL PRIMARY KEY,
--   role VARCHAR(30) NOT NULL CHECK (role IN ('delivery', 'laundry', 'general')),
--   question TEXT NOT NULL,
--   answer TEXT NOT NULL,
--   category VARCHAR(50) NOT NULL, -- 'getting_started', 'earnings', 'requirements', 'operations', 'support'
--   sort_order INTEGER NOT NULL DEFAULT 0,
--   is_active BOOLEAN NOT NULL DEFAULT TRUE,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
 
-- CREATE INDEX idx_partner_faqs_role ON partner_faqs(role);
-- CREATE INDEX idx_partner_faqs_category ON partner_faqs(role, category);
-- CREATE INDEX idx_partner_faqs_active ON partner_faqs(is_active);
 
-- -- 2) Insert Delivery Partner FAQs
-- INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
-- -- Getting Started
-- ('delivery', 'What are the requirements to become a Delivery Partner?',
-- 'You need: (1) Valid driving license, (2) Own vehicle (bike, scooter, or van), (3) Smartphone with internet, (4) Age 18+, (5) Background verification clearance. No prior delivery experience needed!',
-- 'getting_started', 10),
 
-- ('delivery', 'How do I register as a Delivery Partner?',
-- 'Click "Become a Delivery Partner" button, fill the registration form with your details, upload required documents (driving license, Aadhaar, vehicle RC, vehicle insurance), complete background verification, and attend a 2-hour orientation session. You can start accepting orders within 24-48 hours of approval!',
-- 'getting_started', 20),
 
-- ('delivery', 'Is there any registration fee?',
-- 'No! Registration is completely FREE. We don''t charge any fees to join. You only need to invest your time and vehicle.',
-- 'getting_started', 30),
 
-- ('delivery', 'Do I need prior delivery experience?',
-- 'No prior experience required! We provide complete training on using the app, handling laundry items carefully, customer interaction, and best practices. Our support team is always available to help.',
-- 'getting_started', 40),
 
-- -- Earnings
-- ('delivery', 'How much can I earn as a Delivery Partner?',
-- 'Earnings depend on number of deliveries: ₹30-50 per pickup, ₹30-50 per delivery. Average partners earn ₹15,000-25,000/month part-time, ₹30,000-50,000/month full-time. Top performers earn ₹60,000+ monthly! Plus incentives and bonuses during peak hours.',
-- 'earnings', 10),
 
-- ('delivery', 'When do I get paid?',
-- 'Weekly payouts every Monday for previous week''s deliveries (Monday to Sunday). Payments are directly deposited to your bank account. You can track all earnings in the app in real-time.',
-- 'earnings', 20),
 
-- ('delivery', 'Are there any incentives or bonuses?',
-- 'Yes! Earn extra through: (1) Peak hour bonuses (1.5x earnings during 8-10 AM, 6-9 PM), (2) Weekend bonuses, (3) Monthly performance bonuses for 100+ deliveries, (4) Referral bonuses for bringing new partners, (5) Customer rating bonuses for maintaining 4.5+ rating.',
-- 'earnings', 30),
 
-- ('delivery', 'How is the delivery fee calculated?',
-- 'Base fee: ₹30-50 depending on distance (0-3km: ₹30, 3-5km: ₹40, 5km+: ₹50). Additional: Peak hour bonus (1.5x), Multiple item pickup bonus (+₹10 per additional stop), High-value order bonus (+₹20 for orders ₹1000+).',
-- 'earnings', 40),
 
-- -- Requirements
-- ('delivery', 'What type of vehicle can I use?',
-- 'We accept: (1) Two-wheelers: Bike, scooter, moped (most common), (2) Three-wheelers: Auto-rickshaw, (3) Four-wheelers: Car, van (for bulk orders). Vehicle must have valid insurance and RC. No specific brand requirement.',
-- 'requirements', 10),
 
-- ('delivery', 'What documents do I need?',
-- 'Required: (1) Valid driving license (original + copy), (2) Aadhaar card, (3) PAN card, (4) Vehicle registration certificate (RC), (5) Vehicle insurance copy, (6) Bank account details (with cancelled cheque), (7) 2 passport photos. All documents verified during onboarding.',
-- 'requirements', 20),
 
-- ('delivery', 'Do I need a smartphone?',
-- 'Yes, Android 8.0+ or iOS 12+ smartphone with: (1) Good internet connection (3G/4G/5G), (2) GPS capability, (3) Decent camera for proof photos, (4) Minimum 2GB RAM. We provide the delivery app for free.',
-- 'requirements', 30),
 
-- ('delivery', 'Is background verification mandatory?',
-- 'Yes, for customer safety. We conduct: (1) Police verification, (2) Address verification, (3) Reference checks. Process takes 24-48 hours. Your information is kept confidential. 98% of applicants pass verification.',
-- 'requirements', 40),
 
-- -- Operations
-- ('delivery', 'What are the working hours?',
-- 'Completely flexible! You choose when to work: (1) Part-time: Work 2-4 hours/day, (2) Full-time: Work 8+ hours/day, (3) Weekend only: Work only Saturdays-Sundays. App shows available orders 24/7. Peak hours: 8-10 AM, 1-3 PM, 6-9 PM have more orders.',
-- 'operations', 10),
 
-- ('delivery', 'How do I accept orders?',
-- 'Open the app → See available orders near you → View pickup location, delivery location, estimated distance → Accept order → Navigate to pickup → Collect laundry with app barcode scan → Navigate to customer → Deliver and mark complete. Simple!',
-- 'operations', 20),
 
-- ('delivery', 'What if customer is not available?',
-- 'App guides you: (1) Call customer via in-app calling, (2) Wait for 5 minutes, (3) If still unavailable, mark "customer unavailable", (4) Contact support, (5) Return to laundry center. You still get paid for the attempt.',
-- 'operations', 30),
 
-- ('delivery', 'Can I reject orders?',
-- 'Yes, but maintain acceptance rate >70% for good standing. Valid reasons to reject: Too far, vehicle issue, emergency. Frequent rejections may reduce order visibility. App shows acceptance rate in real-time.',
-- 'operations', 40),
 
-- ('delivery', 'What safety measures are provided?',
-- 'Your safety matters: (1) Emergency SOS button in app, (2) 24/7 support helpline, (3) Live GPS tracking, (4) In-app calling (number privacy), (5) Insurance coverage during deliveries, (6) Safety training, (7) Customer verification system.',
-- 'operations', 50),
 
-- -- Support
-- ('delivery', 'Who do I contact for help?',
-- 'Multiple support channels: (1) In-app chat: 24/7 instant support, (2) Support helpline: +91 98765-43210, (3) Email: delivery-support@laundrease.com, (4) WhatsApp support: +91 98765-43211. Average response time: <5 minutes.',
-- 'support', 10),
 
-- ('delivery', 'What if my vehicle breaks down?',
-- 'Immediately: (1) Mark "Vehicle issue" in app, (2) Contact support, (3) We''ll assign order to another partner, (4) No penalty for genuine vehicle issues. We partner with roadside assistance providers in major areas.',
-- 'support', 20),
 
-- ('delivery', 'What if customer gives wrong rating?',
-- 'You can: (1) View all ratings in app, (2) Appeal unfair ratings with proof, (3) Explain situation to support team, (4) We review and can remove unjustified ratings. Your voice matters!',
-- 'support', 30),
 
-- ('delivery', 'How do I report issues?',
-- 'In app: Go to Help → Report Issue → Select category (payment, customer, app, safety, other) → Describe issue → Attach photos if needed → Submit. Support team responds within 30 minutes. All issues tracked until resolved.',
-- 'support', 40);
 
-- -- 3) Insert Laundry Partner FAQs
-- INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
-- -- Getting Started
-- ('laundry', 'What are the requirements to become a Laundry Service Partner?',
-- 'You need: (1) Valid business license/GST registration, (2) Commercial laundry equipment (washers, dryers, irons), (3) Physical shop/facility with proper utilities, (4) Quality certifications (preferred), (5) Minimum 2 staff members, (6) 3+ years laundry experience (preferred). We verify all credentials during onboarding.',
-- 'getting_started', 10),
 
-- ('laundry', 'How do I register as a Laundry Partner?',
-- 'Click "Become a Laundry Partner", complete business details form, upload documents (business license, GST certificate, shop photos, equipment photos, quality certificates), complete verification call, attend training session (online/offline), get approved within 3-5 business days, start receiving orders!',
-- 'getting_started', 20),
 
-- ('laundry', 'Is there any onboarding fee?',
-- 'First month FREE! After that: Basic Plan ₹999/month (up to 100 orders), Standard Plan ₹1,999/month (up to 300 orders), Premium Plan ₹3,999/month (unlimited orders). Plans include: App access, order management, payment gateway, customer support, marketing tools.',
-- 'getting_started', 30),
 
-- ('laundry', 'Do I need certifications?',
-- 'Preferred but not mandatory: ISO 9001 (quality management), Eco-friendly certifications, Textile care certifications, Food safety certifications (for hotel linen). We provide free basic training. Certified partners get "Premium" badge and higher visibility.',
-- 'getting_started', 40),
 
-- -- Earnings
-- ('laundry', 'How much can I earn?',
-- 'Revenue depends on order volume: Average order value: ₹300-800. Platform retains 15-30% commission (based on plan). Small providers: ₹50,000-1,50,000/month (50-150 orders), Medium providers: ₹2-5 lakhs/month (200-500 orders), Large providers: ₹5-15 lakhs/month (500+ orders). Top partners earn ₹20 lakhs+ monthly!',
-- 'earnings', 10),
 
-- ('laundry', 'When do I receive payments?',
-- 'Weekly settlements every Wednesday for orders completed in previous week. Funds directly deposited to your bank account. Real-time earnings dashboard in partner app. Order value - commission - delivery charges = your earning per order.',
-- 'earnings', 20),
 
-- ('laundry', 'What is the commission structure?',
-- 'Tiered commission: Basic Plan (30% commission, up to 100 orders/month), Standard Plan (20% commission, up to 300 orders/month), Premium Plan (15% commission, unlimited orders). Lower commission as you grow. No hidden charges!',
-- 'earnings', 30),
 
-- ('laundry', 'Are there incentives for good service?',
-- 'Yes! Earn bonuses for: (1) High ratings (4.5+): Extra 5% on all orders, (2) Fast turnaround: ₹50 bonus per order <24hrs, (3) Zero complaints month: ₹5,000 bonus, (4) New customer acquisition: ₹100 per new customer, (5) Premium service adoption: ₹200 per dry cleaning order.',
-- 'earnings', 40),
 
-- -- Requirements
-- ('laundry', 'What equipment do I need?',
-- 'Minimum: (1) Commercial washing machines: 2-3 machines (15kg+ capacity), (2) Dryers: 2 machines, (3) Steam irons: 2-3 units, (4) Dry cleaning machine (for premium services), (5) Packaging materials, (6) Storage racks. We provide equipment financing options at 12% annual interest.',
-- 'requirements', 10),
 
-- ('laundry', 'What size shop/facility is required?',
-- 'Minimum 500 sq ft for small operation, 1000 sq ft for medium, 2000+ sq ft for large. Requirements: (1) Adequate ventilation, (2) Water connection (municipal/borewell), (3) 3-phase electricity (for machines), (4) Drainage system, (5) Storage space, (6) Parking for delivery vehicles. Residential areas okay if zoning permits.',
-- 'requirements', 20),
 
-- ('laundry', 'What documents are needed?',
-- 'Required: (1) Business license/registration, (2) GST certificate, (3) Shop/establishment license, (4) PAN card, (5) Bank account (business/current), (6) Address proof (shop rent agreement/ownership), (7) Aadhar card (proprietor). Optional: Quality certifications, insurance certificate, employee records.',
-- 'requirements', 30),
 
-- ('laundry', 'Do I need insurance?',
-- 'Highly recommended: (1) Business liability insurance, (2) Equipment insurance, (3) Customer garment insurance (₹5 lakhs minimum coverage for lost/damaged items). We partner with insurance providers for special rates. Basic insurance: ₹15,000-30,000/year.',
-- 'requirements', 40),
 
-- -- Operations
-- ('laundry', 'How do I receive orders?',
-- 'Orders arrive in partner app automatically based on: (1) Your service area, (2) Your available services, (3) Your capacity/current load, (4) Customer preferences, (5) Your ratings. You see order details: Customer info, items, service type, special instructions. Accept within 5 minutes or auto-reassigned.',
-- 'operations', 10),
 
-- ('laundry', 'Can I set my own prices?',
-- 'Yes! Flexible pricing: (1) Use platform default prices, or (2) Set custom prices per service (must be competitive), or (3) Set discounts/offers. Higher prices = lower order volume. App shows price comparison with nearby providers. Customers see your price before ordering.', 'operations', 20),
 
-- ('laundry', 'How do I handle special requests?',
-- 'App shows customer instructions: "Remove only light stains", "No bleach", "Separate white from colored". If doable: Accept and process. If not: Contact customer via in-app chat, explain limitation, offer alternative. If can''t fulfill: Reject order before starting (no penalty). Always communicate early!',
-- 'operations', 30),
 
-- ('laundry', 'What if item is damaged?',
-- 'Important: (1) Inspect items during pickup (photo proof), (2) Note existing damage, (3) If damage during service: Report immediately in app, (4) Contact customer, explain, offer compensation (free re-wash, discount, cash settlement), (5) Platform mediates disputes. Most cases resolved amicably. Insurance covers major incidents.',
-- 'operations', 40),
 
-- ('laundry', 'What are the quality standards?',
-- 'We expect: (1) Clean, wrinkle-free clothes, (2) Proper folding/hanging, (3) Hygienic packaging, (4) No detergent smell, (5) Items returned complete. Mystery shopping checks quality randomly. Consistent 4.5+ rating required. Quality issues result in warnings, retraining, or account suspension for severe cases.',
-- 'operations', 50),
 
-- -- Support
-- ('laundry', 'How do I get business support?',
-- 'We provide: (1) Dedicated partner success manager (Premium partners), (2) 24/7 helpline: +91 98765-43220, (3) Email: partner-support@laundrease.com, (4) Training webinars (monthly), (5) WhatsApp community for partners, (6) Business coaching, (7) Marketing support. We want you to succeed!',
-- 'support', 10),
 
-- ('laundry', 'What marketing support is provided?',
-- 'We help you grow: (1) Platform listing with photos/reviews, (2) Local ads in your area, (3) Customer referrals, (4) Promotional campaigns, (5) Social media features, (6) Discounts/coupons management, (7) Customer retention tools. Premium partners get extra promotion.',
-- 'support', 20),
 
-- ('laundry', 'How do I resolve customer complaints?',
-- 'Process: (1) Customer files complaint in app, (2) You get notification + 12 hours to respond, (3) Explain your side with photos/proof, (4) Offer solution (re-wash, refund, discount on next order), (5) Support team mediates if unresolved, (6) Fair resolution protects both parties. Quick response = better ratings!',
-- 'support', 30),
 
-- ('laundry', 'Can I temporarily stop taking orders?',
-- 'Yes! In app: Go to Settings → Availability → Mark "Temporarily Unavailable". Reasons: Equipment breakdown, staff shortage, vacation, renovation. Set resume date. No penalty. Inform support for extended breaks (7+ days). Regular breaks okay, but frequent unavailability affects your visibility ranking.',
-- 'support', 40);
 
-- -- 4) Insert General Partner FAQs (applicable to both)
-- INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
-- ('general', 'Can I work with other platforms simultaneously?',
-- 'Yes! You''re free to work with multiple platforms. We have no exclusivity restrictions. Many partners work with 2-3 platforms to maximize earnings. Just maintain service quality on our platform to stay in good standing.',
-- 'operations', 10),
 
-- ('general', 'What happens if I want to stop being a partner?',
-- 'You can stop anytime: (1) Complete pending orders, (2) Clear outstanding payments, (3) Submit exit request in app, (4) Account closed within 7 days. No exit fees. We''d love feedback on why you''re leaving. Door always open to return if circumstances change!',
-- 'support', 20),
 
-- ('general', 'Is there training provided?',
-- 'Yes! Comprehensive training: (1) Online video tutorials (self-paced), (2) Live webinar training sessions, (3) Field training for delivery partners, (4) Equipment training for laundry partners, (5) App usage training, (6) Customer service training, (7) Safety protocols. Mandatory orientation + ongoing skill development.',
-- 'getting_started', 50),
 
-- ('general', 'How does customer rating work?',
-- 'After each order, customers rate 1-5 stars: (1) Service quality, (2) Timeliness, (3) Professionalism. Your overall rating = average of all ratings. Maintain 4.0+ for active status. <3.5 = retraining required. <3.0 = account review. You can see detailed feedback to improve. Good ratings = more orders!',
-- 'operations', 60);
 
-- -- 5) Create indexes for performance
-- CREATE INDEX idx_partner_faqs_sort ON partner_faqs(role, category, sort_order);
 
-- -- 6) Function to fetch role-specific FAQs
-- CREATE OR REPLACE FUNCTION get_partner_faqs(p_role VARCHAR, p_category VARCHAR DEFAULT NULL)
-- RETURNS TABLE(
--   id INTEGER,
--   question TEXT,
--   answer TEXT,
--   category VARCHAR,
--   sort_order INTEGER
-- ) AS $$
-- BEGIN
--   RETURN QUERY
--   SELECT
--     pf.id,
--     pf.question,
--     pf.answer,
--     pf.category,
--     pf.sort_order
--   FROM partner_faqs pf
--   WHERE pf.is_active = TRUE
--     AND (pf.role = p_role OR pf.role = 'general')
--     AND (p_category IS NULL OR pf.category = p_category)
--   ORDER BY pf.category, pf.sort_order;
-- END;
-- $$ LANGUAGE plpgsql;

-- Date: 27/03/2026
-- ============================================================
-- FIX: laundry_status_history.order_id was BIGSERIAL (wrong)
-- It should be a plain BIGINT FK, not auto-incrementing.
-- BIGSERIAL on a non-PK FK column allocates a sequence but
-- the column gets auto-filled, breaking FK inserts.
-- ============================================================
 
-- Re-create the table correctly (safe if no data yet)
-- DROP TABLE IF EXISTS laundry_status_history;
-- CREATE TABLE laundry_status_history (
--   id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
--   order_id   BIGINT      NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
--   from_status VARCHAR(30),
--   to_status   VARCHAR(30) NOT NULL REFERENCES laundry_statuses(code),
--   changed_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
--   changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS idx_laundry_status_history_order
--   ON laundry_status_history(order_id, changed_at);

-- ============================================================
-- FIX: log_laundry_status_change function
-- Tracks order status changes that correspond to laundry
-- processing stages (codes present in laundry_statuses).
-- changed_by is read from app.current_user_id session variable,
-- consistent with how the rest of your auth layer works.
-- ============================================================
-- CREATE OR REPLACE FUNCTION log_laundry_status_change()
-- RETURNS TRIGGER AS $$
-- DECLARE
--   v_changed_by BIGINT;
-- BEGIN
--   -- Only proceed if status actually changed
--   IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
--     RETURN NEW;
--   END IF;
--   -- Only log transitions involving laundry processing statuses
--   -- (i.e., the new OR old status exists in laundry_statuses)
--   IF NOT EXISTS (
--     SELECT 1 FROM laundry_statuses
--     WHERE code = NEW.status OR code = OLD.status
--   ) THEN
--     RETURN NEW;
--   END IF;
--   -- Safely read the session variable; fall back to NULL if not set
--   BEGIN
--     v_changed_by := current_setting('app.current_user_id', TRUE)::BIGINT;
--   EXCEPTION WHEN others THEN
--     v_changed_by := NULL;
--   END;
 
--   INSERT INTO laundry_status_history (
--     order_id,
--     from_status,
--     to_status,
--     changed_by,
--     changed_at
--   ) VALUES (
--     NEW.id,
--     OLD.status,
--     NEW.status,
--     v_changed_by,
--     NOW()
--   );
 
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;


-- ****************Till Here from top the queries are added in their respective files*******************************