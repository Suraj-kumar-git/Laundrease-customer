-- ========================================
-- COMPREHENSIVE SEED DATA FOR LAUNDREASE
-- ========================================
-- This script creates realistic test data for all roles and relationships
-- Run after creating all tables

-- First, insert roles (if not already present)
INSERT INTO roles (name) VALUES
    ('customer'),
    ('admin'),
    ('delivery'),
    ('laundry'),
    ('support')
ON CONFLICT (name) DO NOTHING;

-- Insert order statuses
INSERT INTO order_statuses (code, description, sort_order, is_terminal) VALUES
  ('pending', 'Order placed, awaiting confirmation', 10, FALSE),
  ('confirmed', 'Order confirmed by laundry provider', 20, FALSE),
  ('picked_up', 'Items picked up from customer', 30, FALSE),
  ('in_progress', 'Laundry in progress', 40, FALSE),
  ('ready', 'Ready for delivery', 50, FALSE),
  ('out_for_delivery', 'Out for delivery', 60, FALSE),
  ('delivered', 'Delivered to customer', 70, TRUE),
  ('cancelled', 'Order cancelled', 80, TRUE),
  ('completed', 'Delivered to customer & order closed', 90, TRUE),
  ('returned', 'Pickedup items sent back to customers without processing', 100, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Insert laundry statuses
INSERT INTO laundry_statuses (code, description, is_terminal, sort_order) VALUES
('pending', 'Laundry order created', FALSE, 1),
('picked_up', 'Laundry picked up from customer', FALSE, 2),
('received', 'Laundry received at facility', FALSE, 3),
('washing', 'Laundry is being washed', FALSE, 4),
('drying', 'Laundry is being dried', FALSE, 5),
('ironing', 'Laundry is being ironed', FALSE, 6),
('ready', 'Laundry ready for delivery', FALSE, 7),
('out_for_delivery', 'Laundry out for delivery', FALSE, 8),
('delivered', 'Laundry delivered to customer', TRUE, 9),
('cancelled', 'Laundry order cancelled', TRUE, 10)
ON CONFLICT (code) DO NOTHING;

-- Insert product types
INSERT INTO product_types (name, description) VALUES
('shirt', 'Regular shirts and t-shirts'),
('pants', 'Trousers and jeans'),
('dress', 'Dresses and gowns'),
('bedsheet', 'Bed sheets and covers'),
('curtain', 'Window curtains'),
('blanket', 'Blankets and quilts'),
('towel', 'Bath and hand towels'),
('jacket', 'Jackets and coats'),
('saree', 'Traditional Indian sarees'),
('suit', 'Formal suits')
ON CONFLICT (name) DO NOTHING;

-- Insert services
INSERT INTO services (name, description, category, base_price, price_per_kg, turnaround_hours, is_express_available, express_multiplier) VALUES
('Wash & Fold', 'Standard washing and folding service', 'wash', 50.00, 40.00, 48, TRUE, 1.5),
('Dry Cleaning', 'Professional dry cleaning', 'dry_clean', 150.00, NULL, 72, TRUE, 1.8),
('Iron & Press', 'Ironing and pressing service', 'iron', 30.00, NULL, 24, TRUE, 1.3),
('Steam Cleaning', 'Deep steam cleaning', 'steam', 200.00, NULL, 96, FALSE, NULL),
('Express Wash', 'Same day wash service', 'express', 100.00, 80.00, 12, FALSE, NULL)
ON CONFLICT DO NOTHING;

-- ========================================
-- USERS - 10 CUSTOMERS
-- ========================================
INSERT INTO users (email, password_hash, phone, full_name, role_id, status, email_verified, phone_verified, email_verified_at, phone_verified_at, last_logged_in) VALUES
-- Password for all: Password123 (hashed with bcrypt)
('customer1@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543201', 'Rajesh Kumar', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day'),
('customer2@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543202', 'Priya Sharma', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '2 hours'),
('customer3@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543203', 'Amit Patel', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '3 days'),
('customer4@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543204', 'Sneha Reddy', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 hour'),
('customer5@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543205', 'Vikram Singh', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '5 days'),
('customer6@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543206', 'Anjali Mehta', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, FALSE, NOW() - INTERVAL '8 days', NULL, NOW() - INTERVAL '4 hours'),
('customer7@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543207', 'Rohan Gupta', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days', NOW() - INTERVAL '6 hours'),
('customer8@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543208', 'Kavya Iyer', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days'),
('customer9@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543209', 'Arjun Desai', (SELECT id FROM roles WHERE name='customer'), 'active', FALSE, FALSE, NULL, NULL, NOW() - INTERVAL '1 hour'),
('customer10@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543210', 'Pooja Nair', (SELECT id FROM roles WHERE name='customer'), 'active', TRUE, TRUE, NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days', NOW() - INTERVAL '12 hours');

-- ========================================
-- CUSTOMER PROFILES
-- ========================================
INSERT INTO customer_profiles (user_id, preferences, loyalty_points, total_orders, last_order_at, marketing_opt_in)
SELECT 
    id,
    '{"detergent_type": "eco-friendly", "folding_style": "standard", "notify_sms": true}'::jsonb,
    CASE 
        WHEN id % 3 = 0 THEN 500
        WHEN id % 3 = 1 THEN 250
        ELSE 100
    END,
    CASE 
        WHEN id % 3 = 0 THEN 10
        WHEN id % 3 = 1 THEN 5
        ELSE 2
    END,
    NOW() - (RANDOM() * INTERVAL '30 days'),
    CASE WHEN id % 2 = 0 THEN TRUE ELSE FALSE END
FROM users WHERE role_id = (SELECT id FROM roles WHERE name='customer');

-- ========================================
-- CUSTOMER ADDRESSES
-- ========================================
INSERT INTO customer_addresses (customer_profile_id, label, address_line1, address_line2, landmark, city, state, postal_code, country_code, latitude, longitude, is_default, validated, validated_at, position, contact_name, contact_phone)
SELECT 
    cp.id,
    'Home',
    'Flat ' || (cp.id * 100) || ', Building A',
    'Pimpri Chinchwad',
    'Near City Mall',
    'Pune',
    'Maharashtra',
    '41101' || (cp.id % 9 + 1),
    'IN',
    18.5204 + (RANDOM() * 0.1),
    73.8567 + (RANDOM() * 0.1),
    TRUE,
    TRUE,
    NOW() - INTERVAL '5 days',
    1,
    u.full_name,
    u.phone
FROM customer_profiles cp
JOIN users u ON cp.user_id = u.id;

-- Add secondary addresses for some customers
INSERT INTO customer_addresses (customer_profile_id, label, address_line1, address_line2, city, state, postal_code, country_code, latitude, longitude, is_default, validated, validated_at, position)
SELECT 
    cp.id,
    'Office',
    'Office ' || (cp.id * 10) || ', Tech Park',
    'Hinjewadi',
    'Pune',
    'Maharashtra',
    '411057',
    'IN',
    18.5912 + (RANDOM() * 0.05),
    73.7389 + (RANDOM() * 0.05),
    FALSE,
    TRUE,
    NOW() - INTERVAL '3 days',
    2
FROM customer_profiles cp
WHERE cp.id % 2 = 0
LIMIT 5;

-- ========================================
-- USERS - 10 DELIVERY PARTNERS
-- ========================================
INSERT INTO users (email, password_hash, phone, full_name, role_id, status, email_verified, phone_verified, email_verified_at, phone_verified_at, last_logged_in) VALUES
('delivery1@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543301', 'Ramesh Yadav', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 minutes'),
('delivery2@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543302', 'Suresh Kumar', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days', NOW() - INTERVAL '1 hour'),
('delivery3@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543303', 'Mahesh Pawar', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days', NOW() - INTERVAL '2 hours'),
('delivery4@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543304', 'Prakash Jadhav', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '15 minutes'),
('delivery5@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543305', 'Dinesh Sawant', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 hours'),
('delivery6@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543306', 'Rajendra More', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days', NOW() - INTERVAL '45 minutes'),
('delivery7@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543307', 'Ganesh Patil', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '20 minutes'),
('delivery8@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543308', 'Santosh Shinde', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '10 minutes'),
('delivery9@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543309', 'Anil Bhosale', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 minutes'),
('delivery10@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543310', 'Vikas Kamble', (SELECT id FROM roles WHERE name='delivery'), 'active', TRUE, TRUE, NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days', NOW() - INTERVAL '1 hour');

-- ========================================
-- DELIVERY PROFILES
-- ========================================
INSERT INTO delivery_profiles (user_id, vehicle_type, license_number, service_area, is_online, current_location, rating, rating_count, total_deliveries, background_check_status, background_check_verified_at, shift_status, on_time_rate, capacity_kg)
SELECT 
    u.id,
    CASE (u.id % 3)
        WHEN 0 THEN 'bike'
        WHEN 1 THEN 'scooter'
        ELSE 'van'
    END,
    'DL' || LPAD((1000 + u.id)::TEXT, 10, '0'),
    'Pimpri-Chinchwad, Pune',
    CASE WHEN u.id % 3 = 0 THEN TRUE ELSE FALSE END,
    POINT(73.8567 + (RANDOM() * 0.1), 18.5204 + (RANDOM() * 0.1)),
    4.0 + (RANDOM() * 1.0),
    50 + (u.id * 10),
    100 + (u.id * 20),
    'verified',
    NOW() - INTERVAL '30 days',
    CASE 
        WHEN u.id % 3 = 0 THEN 'on_duty'
        WHEN u.id % 3 = 1 THEN 'break'
        ELSE 'off_duty'
    END,
    85.0 + (RANDOM() * 10),
    CASE (u.id % 3)
        WHEN 0 THEN 10
        WHEN 1 THEN 15
        ELSE 50
    END
FROM users u
WHERE u.role_id = (SELECT id FROM roles WHERE name='delivery');

-- ========================================
-- USERS - 10 LAUNDRY SERVICE PROVIDERS
-- ========================================
INSERT INTO users (email, password_hash, phone, full_name, role_id, status, email_verified, phone_verified, email_verified_at, phone_verified_at, last_logged_in) VALUES
('laundry1@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543401', 'Fresh Clean Services', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 hours'),
('laundry2@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543402', 'Sparkle Laundry', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days', NOW() - INTERVAL '1 day'),
('laundry3@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543403', 'Quick Wash Express', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '80 days', NOW() - INTERVAL '80 days', NOW() - INTERVAL '3 hours'),
('laundry4@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543404', 'Premium Dry Cleaners', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '75 days', NOW() - INTERVAL '75 days', NOW() - INTERVAL '5 hours'),
('laundry5@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543405', 'Eco Wash Solutions', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '70 days', NOW() - INTERVAL '70 days', NOW() - INTERVAL '4 hours'),
('laundry6@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543406', 'Royal Laundry', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '65 days', NOW() - INTERVAL '65 days', NOW() - INTERVAL '6 hours'),
('laundry7@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543407', 'Super Clean Laundry', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '8 hours'),
('laundry8@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543408', 'Perfect Press Laundry', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '55 days', NOW() - INTERVAL '55 days', NOW() - INTERVAL '2 days'),
('laundry9@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543409', 'Elite Cleaners', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '50 days', NOW() - INTERVAL '50 days', NOW() - INTERVAL '10 hours'),
('laundry10@example.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543410', 'Express Laundry Hub', (SELECT id FROM roles WHERE name='laundry'), 'active', TRUE, TRUE, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days', NOW() - INTERVAL '12 hours');

-- ========================================
-- LAUNDRY PROFILES
-- ========================================
INSERT INTO laundry_profiles (user_id, business_name, business_address, service_area, capacity, operating_hours, certifications, services_offered, rating)
SELECT 
    u.id,
    u.full_name,
    'Shop ' || u.id || ', Pimpri Road, Pune - 411018',
    'Pimpri-Chinchwad, Wakad, Hinjewadi',
    50 + (u.id * 10),
    '{"monday": {"open": "09:00", "close": "21:00"}, "tuesday": {"open": "09:00", "close": "21:00"}, "wednesday": {"open": "09:00", "close": "21:00"}, "thursday": {"open": "09:00", "close": "21:00"}, "friday": {"open": "09:00", "close": "21:00"}, "saturday": {"open": "09:00", "close": "21:00"}, "sunday": {"open": "10:00", "close": "18:00"}}'::jsonb,
    ARRAY['ISO 9001', 'Eco Certified'],
    ARRAY['Wash & Fold', 'Dry Cleaning', 'Iron & Press', 'Steam Cleaning'],
    4.0 + (RANDOM() * 1.0)
FROM users u
WHERE u.role_id = (SELECT id FROM roles WHERE name='laundry');

-- ========================================
-- USERS - 2 ADMINS
-- ========================================
INSERT INTO users (email, password_hash, phone, full_name, role_id, status, email_verified, phone_verified, email_verified_at, phone_verified_at, last_logged_in) VALUES
('admin1@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543501', 'Admin User', (SELECT id FROM roles WHERE name='admin'), 'active', TRUE, TRUE, NOW() - INTERVAL '180 days', NOW() - INTERVAL '180 days', NOW() - INTERVAL '30 minutes'),
('admin2@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543502', 'Super Admin', (SELECT id FROM roles WHERE name='admin'), 'active', TRUE, TRUE, NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days', NOW() - INTERVAL '1 hour');

-- ========================================
-- USERS - 5 SUPPORT STAFF
-- ========================================
INSERT INTO users (email, password_hash, phone, full_name, role_id, status, email_verified, phone_verified, email_verified_at, phone_verified_at, last_logged_in) VALUES
('support1@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543601', 'Support Agent 1', (SELECT id FROM roles WHERE name='support'), 'active', TRUE, TRUE, NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days', NOW() - INTERVAL '15 minutes'),
('support2@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543602', 'Support Agent 2', (SELECT id FROM roles WHERE name='support'), 'active', TRUE, TRUE, NOW() - INTERVAL '95 days', NOW() - INTERVAL '95 days', NOW() - INTERVAL '1 hour'),
('support3@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543603', 'Support Agent 3', (SELECT id FROM roles WHERE name='support'), 'active', TRUE, TRUE, NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 hours'),
('support4@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543604', 'Support Agent 4', (SELECT id FROM roles WHERE name='support'), 'active', TRUE, TRUE, NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days', NOW() - INTERVAL '45 minutes'),
('support5@laundrease.com', '$2a$10$rZ7qY8hZGX9xQxW5XxZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqZ5Xe5YqO', '+919876543605', 'Support Agent 5', (SELECT id FROM roles WHERE name='support'), 'active', TRUE, TRUE, NOW() - INTERVAL '80 days', NOW() - INTERVAL '80 days', NOW() - INTERVAL '30 minutes');

-- ========================================
-- ORDERS (20 orders with different statuses)
-- ========================================
WITH inserted_orders AS (
  INSERT INTO orders (order_number, customer_id, laundry_profile_id, delivery_profile_id, status, pickup_address, delivery_address, pickup_date, pickup_time_slot, delivery_date, is_express, subtotal, tax_amount, total_amount, payment_status, payment_method, created_at)
  SELECT 
      'ORD' || LPAD(row_number() OVER ()::TEXT, 8, '0'),
      (SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE name='customer') ORDER BY RANDOM() LIMIT 1),
      (SELECT id FROM laundry_profiles ORDER BY RANDOM() LIMIT 1),
      (SELECT id FROM delivery_profiles ORDER BY RANDOM() LIMIT 1),
      CASE (row_number() OVER () % 8)
          WHEN 0 THEN 'pending'
          WHEN 1 THEN 'confirmed'
          WHEN 2 THEN 'picked_up'
          WHEN 3 THEN 'in_progress'
          WHEN 4 THEN 'ready'
          WHEN 5 THEN 'out_for_delivery'
          WHEN 6 THEN 'delivered'
          ELSE 'cancelled'
      END,
      'Flat 101, Building A, Pimpri',
      'Flat 101, Building A, Pimpri',
      CURRENT_DATE - ((row_number() OVER () % 10) * INTERVAL '1 day'),
      '10:00-12:00',
      CURRENT_DATE - ((row_number() OVER () % 10) * INTERVAL '1 day') + INTERVAL '2 days',
      (row_number() OVER () % 4 = 0),
      500.00 + (row_number() OVER () * 50),
      (500.00 + (row_number() OVER () * 50)) * 0.18,
      (500.00 + (row_number() OVER () * 50)) * 1.18,
      CASE (row_number() OVER () % 3)
          WHEN 0 THEN 'paid'
          WHEN 1 THEN 'pending'
          ELSE 'paid'
      END,
      CASE (row_number() OVER () % 3)
          WHEN 0 THEN 'upi'
          WHEN 1 THEN 'card'
          ELSE 'wallet'
      END,
      NOW() - (row_number() OVER () || ' days')::INTERVAL
  FROM generate_series(1, 20)
  RETURNING id
)
INSERT INTO order_items (order_id, product_type_id, quantity, weight_kg)
SELECT 
    io.id,
    (SELECT id FROM product_types ORDER BY RANDOM() LIMIT 1),
    (RANDOM() * 5 + 1)::INTEGER,
    (RANDOM() * 3 + 0.5)::NUMERIC(6,2)
FROM inserted_orders io
CROSS JOIN generate_series(1, 3);  -- 3 items per order

-- ========================================
-- ORDER ITEM SERVICES
-- ========================================
INSERT INTO order_item_services (order_item_id, service_id, unit_price, line_total, is_express)
SELECT 
    oi.id,
    (SELECT id FROM services ORDER BY RANDOM() LIMIT 1),
    50.00 + (RANDOM() * 100)::NUMERIC(10,2),
    (50.00 + (RANDOM() * 100)) * oi.quantity,
    (RANDOM() > 0.7)
FROM order_items oi;

-- ========================================
-- PAYMENTS
-- ========================================
INSERT INTO payments (order_id, amount, payment_method, transaction_id, status, created_at)
SELECT 
    o.id,
    o.total_amount,
    o.payment_method,
    'TXN' || LPAD(o.id::TEXT, 12, '0'),
    CASE 
        WHEN o.payment_status = 'paid' THEN 'completed'
        WHEN o.payment_status = 'failed' THEN 'failed'
        ELSE 'pending'
    END,
    CASE 
        WHEN o.payment_status = 'paid' THEN NOW() - (RANDOM() * INTERVAL '10 days')
        ELSE NOW()
    END
FROM orders o;

-- ========================================
-- WALLET ACCOUNTS (for some customers)
-- ========================================
INSERT INTO wallet_accounts (user_id, currency, balance)
SELECT 
    id,
    'INR',
    (RANDOM() * 1000)::NUMERIC(12,2)
FROM users
WHERE role_id = (SELECT id FROM roles WHERE name='customer')
AND id % 2 = 0;

-- ========================================
-- ORDER STATUS HISTORY
-- ========================================
INSERT INTO order_status_history (order_id, status, notes, created_at, updated_by)
SELECT 
    o.id,
    o.status,
    'Order ' || o.status,
    o.created_at + (RANDOM() * INTERVAL '2 hours'),
    186 -- Update it to use the correct user ID who made the change dynamically
FROM orders o;

-- ========================================
-- PRODUCT SERVICE PRICES
-- ========================================
INSERT INTO product_service_prices (product_type_id, service_id, unit_price)
SELECT 
    pt.id,
    s.id,
    s.base_price + (RANDOM() * 50)::NUMERIC(10,2)
FROM product_types pt
CROSS JOIN services s
ON CONFLICT DO NOTHING;

-- ========================================
-- PROVIDER SERVICES
-- ========================================
INSERT INTO provider_services (provider_id, service_id)
SELECT 
    lp.id,
    s.id
FROM laundry_profiles lp
CROSS JOIN services s
ON CONFLICT DO NOTHING;

-- ========================================
-- PROVIDER OPERATING HOURS
-- ========================================
INSERT INTO provider_operating_hours (provider_id, day_of_week, open_time, close_time, is_closed)
SELECT 
    lp.id,
    dow,
    '09:00'::TIME,
    '21:00'::TIME,
    (dow = 0) -- Sunday closed
FROM laundry_profiles lp
CROSS JOIN generate_series(0, 6) dow
ON CONFLICT DO NOTHING;

INSERT INTO faqs (question, answer, category, sort_order) VALUES
('What is Laundrease?', 'Laundrease is an on-demand laundry service platform that connects customers with professional laundry providers. We offer convenient pickup and delivery services, ensuring your clothes are cleaned, pressed, and delivered back to you with care.', 'general', 1),
('What areas do you serve?', 'We currently serve Pune (Pimpri-Chinchwad, Wakad, Hinjewadi, Baner, and surrounding areas). Enter your pincode on our homepage to check if we deliver to your location. We are rapidly expanding to new areas!', 'general', 2),
('How do I create an account?', 'Click on "Sign Up" at the top right corner, enter your email, phone number, and create a password. You will receive an OTP for verification. Once verified, you can start placing orders immediately!', 'general', 3),
('How do I place an order?', 'Simply log in, select the services you need (wash & fold, dry cleaning, ironing, etc.), choose a pickup time, add your address, and place your order. Our delivery partner will pick up your laundry at the scheduled time.', 'orders', 4),
('What is the minimum order value?', 'The minimum order value is ₹100. However, this may vary depending on the laundry provider you choose. Some providers offer free delivery for orders above ₹500.', 'orders', 5),
('Can I schedule a pickup for later?', 'Yes! You can schedule your pickup for any date and time slot that works for you. We offer flexible time slots from 9 AM to 9 PM. Express service is also available for same-day delivery.', 'orders', 6),
('Can I track my order?', 'Absolutely! Once your order is placed, you can track it in real-time from the "My Orders" section. You will receive notifications at every stage: pickup, washing, quality check, and delivery.', 'orders', 7),
('How is pricing calculated?', 'Pricing depends on the type of service (wash & fold, dry cleaning, ironing), the weight or quantity of items, and the laundry provider you choose. You can see the exact breakdown before placing your order. We charge ₹40-80 per kg for wash & fold and ₹150+ for dry cleaning.', 'pricing', 8),
('Are there any hidden charges?', 'No hidden charges! The price you see at checkout includes service charges, taxes (18% GST), and delivery fees. If you have a promo code, apply it to see your final discounted price.', 'pricing', 9),
('What payment methods do you accept?', 'We accept UPI, credit/debit cards, net banking, and wallet payments (Paytm, PhonePe, Google Pay). You can also pay cash on delivery in select areas. All transactions are 100% secure.', 'pricing', 10),
('How long does it take to get my laundry back?', 'Standard service takes 24-48 hours. Express service delivers within 12 hours. The exact turnaround time depends on the laundry provider and the type of service selected. You will see the estimated delivery time when placing your order.', 'delivery', 11),
('What if I am not home during delivery?', 'No problem! You can provide special delivery instructions such as "leave with security" or "call before delivery". You can also reschedule the delivery from your order dashboard.', 'delivery', 12),
('Is there a delivery charge?', 'Delivery charges vary by provider and distance. Typically, it ranges from ₹30-50. Many providers offer free delivery for orders above ₹500. You will see the exact delivery charge at checkout.', 'delivery', 13),
('How can I join as a Laundry Provider?', 'We welcome professional laundry service providers! Click on "Become a Partner" at the bottom of the page, or email us at partners@laundrease.com. You will need to provide your business license, service details, and complete a verification process. Once approved, you can start receiving orders from our platform.', 'partners', 14),
('How can I join as a Delivery Partner?', 'Want to earn by delivering laundry? Click on "Become a Delivery Partner" or email us at delivery@laundrease.com. You will need a valid vehicle (bike, scooter, or van), a driving license, and complete a background check. Flexible working hours and competitive earnings!', 'partners', 15),
('What are the requirements to become a partner?', 'For Laundry Providers: Valid business license, commercial laundry equipment, quality certifications. For Delivery Partners: Valid driving license, own vehicle, smartphone, background verification. Both need to agree to our terms of service and quality standards.', 'partners', 16),
('How much can I earn as a partner?', 'Earnings vary based on the number of orders you complete. Laundry providers typically earn 70-85% of the order value. Delivery partners earn ₹30-50 per delivery. Top performers can earn ₹30,000-50,000+ per month!', 'partners', 17)
ON CONFLICT DO NOTHING;

-- 2) Insert Delivery Partner FAQs
INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
-- Getting Started
('delivery', 'What are the requirements to become a Delivery Partner?',
'You need: (1) Valid driving license, (2) Own vehicle (bike, scooter, or van), (3) Smartphone with internet, (4) Age 18+, (5) Background verification clearance. No prior delivery experience needed!',
'getting_started', 10),
 
('delivery', 'How do I register as a Delivery Partner?',
'Click "Become a Delivery Partner" button, fill the registration form with your details, upload required documents (driving license, Aadhaar, vehicle RC, vehicle insurance), complete background verification, and attend a 2-hour orientation session. You can start accepting orders within 24-48 hours of approval!',
'getting_started', 20),
 
('delivery', 'Is there any registration fee?',
'No! Registration is completely FREE. We don''t charge any fees to join. You only need to invest your time and vehicle.',
'getting_started', 30),
 
('delivery', 'Do I need prior delivery experience?',
'No prior experience required! We provide complete training on using the app, handling laundry items carefully, customer interaction, and best practices. Our support team is always available to help.',
'getting_started', 40),
 
-- Earnings
('delivery', 'How much can I earn as a Delivery Partner?',
'Earnings depend on number of deliveries: ₹30-50 per pickup, ₹30-50 per delivery. Average partners earn ₹15,000-25,000/month part-time, ₹30,000-50,000/month full-time. Top performers earn ₹60,000+ monthly! Plus incentives and bonuses during peak hours.',
'earnings', 10),
 
('delivery', 'When do I get paid?',
'Weekly payouts every Monday for previous week''s deliveries (Monday to Sunday). Payments are directly deposited to your bank account. You can track all earnings in the app in real-time.',
'earnings', 20),
 
('delivery', 'Are there any incentives or bonuses?',
'Yes! Earn extra through: (1) Peak hour bonuses (1.5x earnings during 8-10 AM, 6-9 PM), (2) Weekend bonuses, (3) Monthly performance bonuses for 100+ deliveries, (4) Referral bonuses for bringing new partners, (5) Customer rating bonuses for maintaining 4.5+ rating.',
'earnings', 30),
 
('delivery', 'How is the delivery fee calculated?',
'Base fee: ₹30-50 depending on distance (0-3km: ₹30, 3-5km: ₹40, 5km+: ₹50). Additional: Peak hour bonus (1.5x), Multiple item pickup bonus (+₹10 per additional stop), High-value order bonus (+₹20 for orders ₹1000+).',
'earnings', 40),
 
-- Requirements
('delivery', 'What type of vehicle can I use?',
'We accept: (1) Two-wheelers: Bike, scooter, moped (most common), (2) Three-wheelers: Auto-rickshaw, (3) Four-wheelers: Car, van (for bulk orders). Vehicle must have valid insurance and RC. No specific brand requirement.',
'requirements', 10),
 
('delivery', 'What documents do I need?',
'Required: (1) Valid driving license (original + copy), (2) Aadhaar card, (3) PAN card, (4) Vehicle registration certificate (RC), (5) Vehicle insurance copy, (6) Bank account details (with cancelled cheque), (7) 2 passport photos. All documents verified during onboarding.',
'requirements', 20),
 
('delivery', 'Do I need a smartphone?',
'Yes, Android 8.0+ or iOS 12+ smartphone with: (1) Good internet connection (3G/4G/5G), (2) GPS capability, (3) Decent camera for proof photos, (4) Minimum 2GB RAM. We provide the delivery app for free.',
'requirements', 30),
 
('delivery', 'Is background verification mandatory?',
'Yes, for customer safety. We conduct: (1) Police verification, (2) Address verification, (3) Reference checks. Process takes 24-48 hours. Your information is kept confidential. 98% of applicants pass verification.',
'requirements', 40),
 
-- Operations
('delivery', 'What are the working hours?',
'Completely flexible! You choose when to work: (1) Part-time: Work 2-4 hours/day, (2) Full-time: Work 8+ hours/day, (3) Weekend only: Work only Saturdays-Sundays. App shows available orders 24/7. Peak hours: 8-10 AM, 1-3 PM, 6-9 PM have more orders.',
'operations', 10),
 
('delivery', 'How do I accept orders?',
'Open the app → See available orders near you → View pickup location, delivery location, estimated distance → Accept order → Navigate to pickup → Collect laundry with app barcode scan → Navigate to customer → Deliver and mark complete. Simple!',
'operations', 20),
 
('delivery', 'What if customer is not available?',
'App guides you: (1) Call customer via in-app calling, (2) Wait for 5 minutes, (3) If still unavailable, mark "customer unavailable", (4) Contact support, (5) Return to laundry center. You still get paid for the attempt.',
'operations', 30),
 
('delivery', 'Can I reject orders?',
'Yes, but maintain acceptance rate >70% for good standing. Valid reasons to reject: Too far, vehicle issue, emergency. Frequent rejections may reduce order visibility. App shows acceptance rate in real-time.',
'operations', 40),
 
('delivery', 'What safety measures are provided?',
'Your safety matters: (1) Emergency SOS button in app, (2) 24/7 support helpline, (3) Live GPS tracking, (4) In-app calling (number privacy), (5) Insurance coverage during deliveries, (6) Safety training, (7) Customer verification system.',
'operations', 50),
 
-- Support
('delivery', 'Who do I contact for help?',
'Multiple support channels: (1) In-app chat: 24/7 instant support, (2) Support helpline: +91 98765-43210, (3) Email: delivery-support@laundrease.com, (4) WhatsApp support: +91 98765-43211. Average response time: <5 minutes.',
'support', 10),
 
('delivery', 'What if my vehicle breaks down?',
'Immediately: (1) Mark "Vehicle issue" in app, (2) Contact support, (3) We''ll assign order to another partner, (4) No penalty for genuine vehicle issues. We partner with roadside assistance providers in major areas.',
'support', 20),
 
('delivery', 'What if customer gives wrong rating?',
'You can: (1) View all ratings in app, (2) Appeal unfair ratings with proof, (3) Explain situation to support team, (4) We review and can remove unjustified ratings. Your voice matters!',
'support', 30),
 
('delivery', 'How do I report issues?',
'In app: Go to Help → Report Issue → Select category (payment, customer, app, safety, other) → Describe issue → Attach photos if needed → Submit. Support team responds within 30 minutes. All issues tracked until resolved.',
'support', 40);
 
-- 3) Insert Laundry Partner FAQs
INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
-- Getting Started
('laundry', 'What are the requirements to become a Laundry Service Partner?',
'You need: (1) Valid business license/GST registration, (2) Commercial laundry equipment (washers, dryers, irons), (3) Physical shop/facility with proper utilities, (4) Quality certifications (preferred), (5) Minimum 2 staff members, (6) 3+ years laundry experience (preferred). We verify all credentials during onboarding.',
'getting_started', 10),
 
('laundry', 'How do I register as a Laundry Partner?',
'Click "Become a Laundry Partner", complete business details form, upload documents (business license, GST certificate, shop photos, equipment photos, quality certificates), complete verification call, attend training session (online/offline), get approved within 3-5 business days, start receiving orders!',
'getting_started', 20),
 
('laundry', 'Is there any onboarding fee?',
'First month FREE! After that: Basic Plan ₹999/month (up to 100 orders), Standard Plan ₹1,999/month (up to 300 orders), Premium Plan ₹3,999/month (unlimited orders). Plans include: App access, order management, payment gateway, customer support, marketing tools.',
'getting_started', 30),
 
('laundry', 'Do I need certifications?',
'Preferred but not mandatory: ISO 9001 (quality management), Eco-friendly certifications, Textile care certifications, Food safety certifications (for hotel linen). We provide free basic training. Certified partners get "Premium" badge and higher visibility.',
'getting_started', 40),
 
-- Earnings
('laundry', 'How much can I earn?',
'Revenue depends on order volume: Average order value: ₹300-800. Platform retains 15-30% commission (based on plan). Small providers: ₹50,000-1,50,000/month (50-150 orders), Medium providers: ₹2-5 lakhs/month (200-500 orders), Large providers: ₹5-15 lakhs/month (500+ orders). Top partners earn ₹20 lakhs+ monthly!',
'earnings', 10),
 
('laundry', 'When do I receive payments?',
'Weekly settlements every Wednesday for orders completed in previous week. Funds directly deposited to your bank account. Real-time earnings dashboard in partner app. Order value - commission - delivery charges = your earning per order.',
'earnings', 20),
 
('laundry', 'What is the commission structure?',
'Tiered commission: Basic Plan (30% commission, up to 100 orders/month), Standard Plan (20% commission, up to 300 orders/month), Premium Plan (15% commission, unlimited orders). Lower commission as you grow. No hidden charges!',
'earnings', 30),
 
('laundry', 'Are there incentives for good service?',
'Yes! Earn bonuses for: (1) High ratings (4.5+): Extra 5% on all orders, (2) Fast turnaround: ₹50 bonus per order <24hrs, (3) Zero complaints month: ₹5,000 bonus, (4) New customer acquisition: ₹100 per new customer, (5) Premium service adoption: ₹200 per dry cleaning order.',
'earnings', 40),
 
-- Requirements
('laundry', 'What equipment do I need?',
'Minimum: (1) Commercial washing machines: 2-3 machines (15kg+ capacity), (2) Dryers: 2 machines, (3) Steam irons: 2-3 units, (4) Dry cleaning machine (for premium services), (5) Packaging materials, (6) Storage racks. We provide equipment financing options at 12% annual interest.',
'requirements', 10),
 
('laundry', 'What size shop/facility is required?',
'Minimum 500 sq ft for small operation, 1000 sq ft for medium, 2000+ sq ft for large. Requirements: (1) Adequate ventilation, (2) Water connection (municipal/borewell), (3) 3-phase electricity (for machines), (4) Drainage system, (5) Storage space, (6) Parking for delivery vehicles. Residential areas okay if zoning permits.',
'requirements', 20),
 
('laundry', 'What documents are needed?',
'Required: (1) Business license/registration, (2) GST certificate, (3) Shop/establishment license, (4) PAN card, (5) Bank account (business/current), (6) Address proof (shop rent agreement/ownership), (7) Aadhar card (proprietor). Optional: Quality certifications, insurance certificate, employee records.',
'requirements', 30),
 
('laundry', 'Do I need insurance?',
'Highly recommended: (1) Business liability insurance, (2) Equipment insurance, (3) Customer garment insurance (₹5 lakhs minimum coverage for lost/damaged items). We partner with insurance providers for special rates. Basic insurance: ₹15,000-30,000/year.',
'requirements', 40),
 
-- Operations
('laundry', 'How do I receive orders?',
'Orders arrive in partner app automatically based on: (1) Your service area, (2) Your available services, (3) Your capacity/current load, (4) Customer preferences, (5) Your ratings. You see order details: Customer info, items, service type, special instructions. Accept within 5 minutes or auto-reassigned.',
'operations', 10),
 
('laundry', 'Can I set my own prices?',
'Yes! Flexible pricing: (1) Use platform default prices, or (2) Set custom prices per service (must be competitive), or (3) Set discounts/offers. Higher prices = lower order volume. App shows price comparison with nearby providers. Customers see your price before ordering.', 'operations', 20),
 
('laundry', 'How do I handle special requests?',
'App shows customer instructions: "Remove only light stains", "No bleach", "Separate white from colored". If doable: Accept and process. If not: Contact customer via in-app chat, explain limitation, offer alternative. If can''t fulfill: Reject order before starting (no penalty). Always communicate early!',
'operations', 30),
 
('laundry', 'What if item is damaged?',
'Important: (1) Inspect items during pickup (photo proof), (2) Note existing damage, (3) If damage during service: Report immediately in app, (4) Contact customer, explain, offer compensation (free re-wash, discount, cash settlement), (5) Platform mediates disputes. Most cases resolved amicably. Insurance covers major incidents.',
'operations', 40),
 
('laundry', 'What are the quality standards?',
'We expect: (1) Clean, wrinkle-free clothes, (2) Proper folding/hanging, (3) Hygienic packaging, (4) No detergent smell, (5) Items returned complete. Mystery shopping checks quality randomly. Consistent 4.5+ rating required. Quality issues result in warnings, retraining, or account suspension for severe cases.',
'operations', 50),
 
-- Support
('laundry', 'How do I get business support?',
'We provide: (1) Dedicated partner success manager (Premium partners), (2) 24/7 helpline: +91 98765-43220, (3) Email: partner-support@laundrease.com, (4) Training webinars (monthly), (5) WhatsApp community for partners, (6) Business coaching, (7) Marketing support. We want you to succeed!',
'support', 10),
 
('laundry', 'What marketing support is provided?',
'We help you grow: (1) Platform listing with photos/reviews, (2) Local ads in your area, (3) Customer referrals, (4) Promotional campaigns, (5) Social media features, (6) Discounts/coupons management, (7) Customer retention tools. Premium partners get extra promotion.',
'support', 20),
 
('laundry', 'How do I resolve customer complaints?',
'Process: (1) Customer files complaint in app, (2) You get notification + 12 hours to respond, (3) Explain your side with photos/proof, (4) Offer solution (re-wash, refund, discount on next order), (5) Support team mediates if unresolved, (6) Fair resolution protects both parties. Quick response = better ratings!',
'support', 30),
 
('laundry', 'Can I temporarily stop taking orders?',
'Yes! In app: Go to Settings → Availability → Mark "Temporarily Unavailable". Reasons: Equipment breakdown, staff shortage, vacation, renovation. Set resume date. No penalty. Inform support for extended breaks (7+ days). Regular breaks okay, but frequent unavailability affects your visibility ranking.',
'support', 40);
 
-- 4) Insert General Partner FAQs (applicable to both)
INSERT INTO partner_faqs (role, question, answer, category, sort_order) VALUES
('general', 'Can I work with other platforms simultaneously?',
'Yes! You''re free to work with multiple platforms. We have no exclusivity restrictions. Many partners work with 2-3 platforms to maximize earnings. Just maintain service quality on our platform to stay in good standing.',
'operations', 10),
 
('general', 'What happens if I want to stop being a partner?',
'You can stop anytime: (1) Complete pending orders, (2) Clear outstanding payments, (3) Submit exit request in app, (4) Account closed within 7 days. No exit fees. We''d love feedback on why you''re leaving. Door always open to return if circumstances change!',
'support', 20),
 
('general', 'Is there training provided?',
'Yes! Comprehensive training: (1) Online video tutorials (self-paced), (2) Live webinar training sessions, (3) Field training for delivery partners, (4) Equipment training for laundry partners, (5) App usage training, (6) Customer service training, (7) Safety protocols. Mandatory orientation + ongoing skill development.',
'getting_started', 50),
 
('general', 'How does customer rating work?',
'After each order, customers rate 1-5 stars: (1) Service quality, (2) Timeliness, (3) Professionalism. Your overall rating = average of all ratings. Maintain 4.0+ for active status. <3.5 = retraining required. <3.0 = account review. You can see detailed feedback to improve. Good ratings = more orders!',
'operations', 60);

-- ========================================
-- SUMMARY
-- ========================================
-- This seed data includes:
-- ✓ 10 Customers with profiles and addresses
-- ✓ 10 Delivery partners with profiles
-- ✓ 10 Laundry service providers
-- ✓ 2 Admins
-- ✓ 5 Support staff
-- ✓ 20 Orders with different statuses
-- ✓ 60 Order items (3 per order)
-- ✓ Services attached to order items
-- ✓ Payments for orders
-- ✓ Wallet accounts for some customers
-- ✓ Product types and services
-- ✓ Provider services and operating hours
-- ========================================