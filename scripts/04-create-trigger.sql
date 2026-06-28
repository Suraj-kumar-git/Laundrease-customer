-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_users_updated_at ON users;
CREATE TRIGGER trg_set_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_customer_addresses_updated_at ON customer_addresses;
CREATE TRIGGER trg_set_customer_addresses_updated_at
BEFORE UPDATE ON customer_addresses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
-- Auto-update updated_at on changes (reuse the same function if already created)
DROP TRIGGER IF EXISTS trg_set_customer_profiles_updated_at ON customer_profiles;
CREATE TRIGGER trg_set_customer_profiles_updated_at
BEFORE UPDATE ON customer_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_delivery_profiles_updated_at ON delivery_profiles;
CREATE TRIGGER trg_set_delivery_profiles_updated_at
BEFORE UPDATE ON delivery_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_delivery_availability_updated_at ON delivery_availability;
CREATE TRIGGER trg_set_delivery_availability_updated_at
BEFORE UPDATE ON delivery_availability
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_service_zones_updated_at ON service_zones;
CREATE TRIGGER trg_set_service_zones_updated_at
BEFORE UPDATE ON service_zones
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_bag_completed_at ON laundry_bags;
CREATE TRIGGER trg_bag_completed_at
BEFORE UPDATE OF status ON laundry_bags
FOR EACH ROW
EXECUTE FUNCTION set_bag_completed_timestamp();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_bag_status_events ON laundry_bags;
CREATE TRIGGER trg_bag_status_events
AFTER INSERT OR UPDATE OF status ON laundry_bags
FOR EACH ROW
EXECUTE FUNCTION log_bag_status_change();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_orders_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_ois_compute_line_total_ins ON order_item_services;
CREATE TRIGGER trg_ois_compute_line_total_ins
BEFORE INSERT ON order_item_services
FOR EACH ROW
EXECUTE FUNCTION compute_order_item_service_line_total();

DROP TRIGGER IF EXISTS trg_ois_compute_line_total_upd ON order_item_services;
CREATE TRIGGER trg_ois_compute_line_total_upd
BEFORE UPDATE OF unit_price, is_express, express_multiplier, order_item_id ON order_item_services
FOR EACH ROW
EXECUTE FUNCTION compute_order_item_service_line_total();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_oi_recompute_services ON order_items;
CREATE TRIGGER trg_oi_recompute_services
AFTER UPDATE OF quantity, weight_kg ON order_items
FOR EACH ROW
EXECUTE FUNCTION recompute_services_for_item();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_cart_touch_updated_at ON shopping_carts;
CREATE TRIGGER trg_cart_touch_updated_at
BEFORE UPDATE ON shopping_carts
FOR EACH ROW
EXECUTE FUNCTION set_cart_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_cis_compute_line_total_ins ON cart_item_services;
CREATE TRIGGER trg_cis_compute_line_total_ins
BEFORE INSERT ON cart_item_services
FOR EACH ROW
EXECUTE FUNCTION compute_cart_item_service_line_total();

DROP TRIGGER IF EXISTS trg_cis_compute_line_total_upd ON cart_item_services;
CREATE TRIGGER trg_cis_compute_line_total_upd
BEFORE UPDATE OF unit_price, is_express, express_multiplier, cart_item_id ON cart_item_services
FOR EACH ROW
EXECUTE FUNCTION compute_cart_item_service_line_total();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_ci_recompute_services ON cart_items;
CREATE TRIGGER trg_ci_recompute_services
AFTER UPDATE OF quantity, weight_kg ON cart_items
FOR EACH ROW
EXECUTE FUNCTION recompute_services_for_cart_item();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_cis_recalc_totals ON cart_item_services;
CREATE TRIGGER trg_cis_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON cart_item_services
FOR EACH ROW
EXECUTE FUNCTION recalc_cart_totals_from_item_service();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_ca_recalc_totals ON cart_adjustments;
CREATE TRIGGER trg_ca_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON cart_adjustments
FOR EACH ROW
EXECUTE FUNCTION recalc_cart_totals_from_adjustment();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_cart_recalc_totals ON shopping_carts;
CREATE TRIGGER trg_cart_recalc_totals
AFTER UPDATE OF tax_amount, discount_amount ON shopping_carts
FOR EACH ROW
EXECUTE FUNCTION touch_cart_totals_on_update();

-- **********************************Need to check logic for this************************************************
-- DROP TRIGGER IF EXISTS trg_order_after_insert ON orders;
-- CREATE TRIGGER trg_order_after_insert
-- AFTER INSERT ON orders
-- FOR EACH ROW
-- EXECUTE FUNCTION recalc_order_totals();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_log_laundry_status_change ON orders;
CREATE TRIGGER trg_log_laundry_status_change
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION log_laundry_status_change();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_ois_recalc_order_totals ON order_item_services;
CREATE TRIGGER trg_ois_recalc_order_totals
AFTER INSERT OR UPDATE OR DELETE ON order_item_services
FOR EACH ROW
EXECUTE FUNCTION recalc_order_totals_from_item_service();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_orders_recalc_totals ON orders;
CREATE TRIGGER trg_orders_recalc_totals
AFTER UPDATE OF tax_amount, discount_amount ON orders
FOR EACH ROW
EXECUTE FUNCTION recalc_order_totals_on_order_update();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_oa_recalc_totals ON order_adjustments;
CREATE TRIGGER trg_oa_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON order_adjustments
FOR EACH ROW
EXECUTE FUNCTION recalc_order_totals_from_adjustment();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_orders_status_history ON orders;
CREATE TRIGGER trg_orders_status_history
AFTER INSERT OR UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION log_order_status_change();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_reviews_touch_updated_at ON reviews;
CREATE TRIGGER trg_reviews_touch_updated_at
BEFORE UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION touch_reviews_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_reviews_validate_order ON reviews;
CREATE TRIGGER trg_reviews_validate_order
BEFORE INSERT OR UPDATE ON reviews
FOR EACH ROW
EXECUTE FUNCTION validate_review_order_consistency();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_support_tickets_touch_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_touch_updated_at
BEFORE UPDATE ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION touch_support_ticket_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_support_tickets_sla ON support_tickets;
CREATE TRIGGER trg_support_tickets_sla
BEFORE INSERT OR UPDATE OF priority ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION set_or_recompute_ticket_sla();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_support_tickets_status ON support_tickets;
CREATE TRIGGER trg_support_tickets_status
AFTER INSERT OR UPDATE OF status ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION handle_ticket_status_change();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_support_comment_insert ON support_ticket_comments;
CREATE TRIGGER trg_support_comment_insert
AFTER INSERT ON support_ticket_comments
FOR EACH ROW
EXECUTE FUNCTION on_support_comment_insert();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_support_tickets_sla_breach ON support_tickets;
CREATE TRIGGER trg_support_tickets_sla_breach
BEFORE UPDATE OF first_response_at, resolved_at, first_response_due_at, resolution_due_at ON support_tickets
FOR EACH ROW
EXECUTE FUNCTION reevaluate_sla_breach_on_ticket_update();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_promotions_touch_updated_at ON promotions;
CREATE TRIGGER trg_promotions_touch_updated_at
BEFORE UPDATE ON promotions
FOR EACH ROW
EXECUTE FUNCTION touch_promotions_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_promo_redemptions_inc ON promotion_redemptions;
CREATE TRIGGER trg_promo_redemptions_inc
AFTER INSERT ON promotion_redemptions
FOR EACH ROW
EXECUTE FUNCTION promo_redemption_counter_inc();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_promo_redemptions_dec ON promotion_redemptions;
CREATE TRIGGER trg_promo_redemptions_dec
AFTER DELETE ON promotion_redemptions
FOR EACH ROW
EXECUTE FUNCTION promo_redemption_counter_dec();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_set_sla_before_insert ON orders;
CREATE TRIGGER trg_set_sla_before_insert
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION set_sla_deadline();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_prevent_invalid_laundry_transition ON orders;
CREATE TRIGGER trg_prevent_invalid_laundry_transition
BEFORE UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION prevent_invalid_status_transition();

-- **********************************************************************************
-- TRIGGER: Auto-update oauth_accounts updated_at
DROP TRIGGER IF EXISTS trg_oauth_accounts_updated_at ON oauth_accounts;
CREATE TRIGGER trg_oauth_accounts_updated_at
  BEFORE UPDATE ON oauth_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_oauth_updated_at();

-- -- TRIGGER: Update last_activity on session access
DROP TRIGGER IF EXISTS trg_user_sessions_activity ON user_sessions;
CREATE TRIGGER trg_user_sessions_activity
  BEFORE UPDATE ON user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_session_activity();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_faqs_updated_at ON faqs;
CREATE TRIGGER trg_faqs_updated_at
BEFORE UPDATE ON faqs
FOR EACH ROW
EXECUTE FUNCTION update_faqs_updated_at();

-- **********************************************************************************
-- 6. Add updated_at triggers for modified tables
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_laundry_profiles_updated_at ON laundry_profiles;
CREATE TRIGGER trg_laundry_profiles_updated_at
  BEFORE UPDATE ON laundry_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
DROP TRIGGER IF EXISTS trg_delivery_profiles_updated_at ON delivery_profiles;
CREATE TRIGGER trg_delivery_profiles_updated_at
  BEFORE UPDATE ON delivery_profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- **********************************************************************************
-- **********************************************************************************