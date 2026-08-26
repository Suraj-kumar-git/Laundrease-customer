// lib/order-measurements-sql.ts
//
// The measured sections of a dimension-priced item, for every screen that
// shows an order's items.
//
// Four personas display order items — customer, laundry, delivery, admin and
// support — and each has its own query. A carpet's price is the one number on
// the order that nobody can check by eye: "₹1,350" means nothing without
// "9 ft × 6 ft at ₹25". So every one of those screens needs the sections, and
// they need to agree, which is why the fragment lives here rather than being
// pasted five times.

/**
 * A correlated subquery yielding the item's sections as JSON, aliased
 * `measurements`. `alias` is the table alias for order_items.
 *
 * Ordered by id so the sections read in the order they were measured — which
 * is the order the partner and the customer counted them in.
 */
export function orderItemMeasurementsSql(alias = 'oi'): string {
  return `COALESCE((
            SELECT JSON_AGG(JSON_BUILD_OBJECT(
                     'shape',       m.shape,
                     'length_ft',   m.length_ft,
                     'width_ft',    m.width_ft,
                     'diameter_ft', m.diameter_ft,
                     'area_sqft',   m.area_sqft
                   ) ORDER BY m.id)
            FROM order_item_measurements m
            WHERE m.order_item_id = ${alias}.id
          ), '[]'::json) AS measurements`
}
