-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_default_address
  ON customer_addresses (customer_profile_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;
-- Position must be unique per customer (enforces max 10)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_address_position
  ON customer_addresses (customer_profile_id, position)
  WHERE deleted_at IS NULL;
-- Fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_addresses_profile ON customer_addresses (customer_profile_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_city ON customer_addresses (city);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_loyalty_points ON customer_profiles (loyalty_points);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_total_orders ON customer_profiles (total_orders);
CREATE INDEX IF NOT EXISTS idx_delivery_profiles_is_online ON delivery_profiles (is_online);
CREATE INDEX IF NOT EXISTS idx_delivery_profiles_background_check_status ON delivery_profiles (background_check_status);
CREATE INDEX IF NOT EXISTS idx_delivery_profiles_shift_status ON delivery_profiles (shift_status);
CREATE INDEX IF NOT EXISTS idx_delivery_profiles_document_meta_gin
  ON delivery_profiles USING GIN (document_meta);
  -- Prevent exact duplicate windows for a profile (does not prevent overlaps)
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_availability_unique_window
  ON delivery_availability (
    delivery_profile_id, day_of_week, start_time, end_time,
    COALESCE(effective_from, '0001-01-01'::date),
    COALESCE(effective_to, '9999-12-31'::date)
  );
CREATE INDEX IF NOT EXISTS idx_delivery_availability_profile_day ON delivery_availability (delivery_profile_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_service_zones_shape_gin ON service_zones USING GIN (shape);
CREATE INDEX IF NOT EXISTS idx_dpsz_zone ON delivery_profile_service_zones (service_zone_id);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_user_id ON laundry_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services (category);
-- Indexes for laundry_profiles
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_service_area ON laundry_profiles (service_area);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_rating ON laundry_profiles (rating);
-- GIN indexes to speed up containment/exists queries on JSONB and arrays
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_operating_hours_gin ON laundry_profiles USING GIN (operating_hours);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_certifications_gin ON laundry_profiles USING GIN (certifications);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_services_offered_gin ON laundry_profiles USING GIN (services_offered);
-- Indexes for services
CREATE INDEX IF NOT EXISTS idx_services_category ON services (category);
CREATE INDEX IF NOT EXISTS idx_services_name ON services (name);
CREATE INDEX IF NOT EXISTS idx_laundry_bags_provider_status ON laundry_bags(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_laundry_bags_code ON laundry_bags(code);
CREATE INDEX IF NOT EXISTS idx_laundry_bags_instructions_gin ON laundry_bags USING GIN (instructions);
CREATE INDEX IF NOT EXISTS idx_bag_service_items_bag ON bag_service_items(bag_id);
CREATE INDEX IF NOT EXISTS idx_bag_service_items_status ON bag_service_items(status);
CREATE INDEX IF NOT EXISTS idx_bag_status_events_bag_time ON bag_status_events(bag_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_bag_status_events_status ON bag_status_events(status);
CREATE INDEX IF NOT EXISTS idx_psp_service ON product_service_prices (service_id);
CREATE INDEX IF NOT EXISTS idx_ppsp_service ON provider_product_service_prices (service_id);
CREATE INDEX IF NOT EXISTS idx_ppsp_provider ON provider_product_service_prices (provider_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_active ON orders (status) WHERE status NOT IN ('completed', 'cancelled', 'returned');
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_type ON order_items (product_type_id);
CREATE INDEX IF NOT EXISTS idx_order_item_services_item ON order_item_services (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_item_services_service ON order_item_services (service_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_time ON order_status_history (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order ON coupon_redemptions (order_id);
CREATE INDEX IF NOT EXISTS idx_shopping_carts_user ON shopping_carts (user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_product ON cart_items (cart_id,product_type_id);
CREATE INDEX IF NOT EXISTS idx_cart_item_services_item ON cart_item_services (cart_item_id);
CREATE INDEX IF NOT EXISTS idx_cart_adjustments_cart ON cart_adjustments (cart_id);
CREATE INDEX IF NOT EXISTS idx_order_adjustments_order ON order_adjustments (order_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet ON wallet_transactions (wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_order ON wallet_transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments (payment_method);
CREATE INDEX IF NOT EXISTS idx_reviews_order ON reviews (order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer ON reviews (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_laundry ON reviews (laundry_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_delivery ON reviews (delivery_profile_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON support_tickets (customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON support_tickets (order_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned_to ON support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS idx_support_tickets_group ON support_tickets (assigned_group_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority ON support_tickets (status, priority);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets (created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_metadata_gin ON support_tickets USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_support_attachments_ticket ON support_ticket_attachments (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_comments_ticket_time ON support_ticket_comments (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_support_status_history_ticket_time ON support_ticket_status_history (ticket_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_promotions_code_lower ON promotions (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions (is_active, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_promo_user_targets_user ON promotion_user_targets (user_id);
CREATE INDEX IF NOT EXISTS idx_promo_services_service ON promotion_services (service_id);
CREATE INDEX IF NOT EXISTS idx_promo_product_types_pt ON promotion_product_types (product_type_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promotion_redemptions (user_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_order ON promotion_redemptions (order_id);
CREATE INDEX IF NOT EXISTS idx_order_promotions_order ON order_promotions (order_id);
CREATE INDEX IF NOT EXISTS idx_promo_unique_codes_promo ON promotion_unique_codes (promotion_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider ON oauth_accounts(provider);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email::TEXT));
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role_id, status);
CREATE INDEX IF NOT EXISTS idx_users_email_status ON users(email, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_faqs_category ON faqs(category);
CREATE INDEX IF NOT EXISTS idx_faqs_active ON faqs(is_active);
CREATE INDEX IF NOT EXISTS idx_faqs_sort ON faqs(sort_order);
CREATE INDEX IF NOT EXISTS idx_user_approval_history_user ON user_approval_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_approval_history_performed ON user_approval_history(performed_by);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_postal_code ON laundry_profiles(postal_code);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_city ON laundry_profiles(city);
CREATE INDEX IF NOT EXISTS idx_laundry_profiles_status ON laundry_profiles(status);
CREATE INDEX IF NOT EXISTS idx_provider_service_areas_postal ON provider_service_areas(postal_code);
CREATE INDEX IF NOT EXISTS idx_provider_service_areas_active ON provider_service_areas(is_active);
CREATE INDEX IF NOT EXISTS idx_partner_faqs_role ON partner_faqs(role);
CREATE INDEX IF NOT EXISTS idx_partner_faqs_category ON partner_faqs(role, category);
CREATE INDEX IF NOT EXISTS idx_partner_faqs_active ON partner_faqs(is_active);
CREATE INDEX IF NOT EXISTS idx_partner_faqs_sort ON partner_faqs(role, category, sort_order);
CREATE INDEX IF NOT EXISTS idx_laundry_status_history_order ON laundry_status_history(order_id, changed_at);