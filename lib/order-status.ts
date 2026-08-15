// Shared order-status helpers used across customer order API routes.

// Statuses that are still reschedulable (not yet picked up).
export const RESCHEDULABLE_STATUSES = new Set(['pending', 'confirmed'])

// Statuses before the laundry provider has started processing the order.
// Once an order moves into 'processing' (or beyond), it can no longer be cancelled.
// 'out_for_pickup' belongs here with the rest: it sits between
// assigned_for_pickup and picked_up, which were both already cancellable, so
// leaving it out made the Cancel button disappear while the partner was en
// route and reappear once they'd collected the parcel. The delivery-side set
// (DELIVERY_CANCELLABLE_STATUSES) always included it.
export const CANCELLABLE_STATUSES = new Set([
  'pending', 'confirmed', 'assigned_for_pickup', 'out_for_pickup',
  'picked_up', 'at_laundry',
])

// Statuses reached only once the delivery partner has actually collected the
// order from the customer. Used to decide whether the delivery fee is still
// refundable on a cancellation: before pickup, no delivery work has happened
// yet, so the fee refunds along with the subtotal; from here on the pickup
// leg is already done, so — like every other order fee — it's kept.
export const PICKUP_DONE_STATUSES = new Set(['picked_up', 'at_laundry'])
