// Shared order-status helpers used across customer order API routes.

// Statuses that are still reschedulable (not yet picked up).
export const RESCHEDULABLE_STATUSES = new Set(['pending', 'confirmed'])

// Statuses before the laundry provider has started processing the order.
// Once an order moves into 'processing' (or beyond), it can no longer be cancelled.
export const CANCELLABLE_STATUSES = new Set([
  'pending', 'confirmed', 'assigned_for_pickup', 'picked_up', 'at_laundry',
])

// Statuses reached only once the delivery partner has actually collected the
// order from the customer. Used to decide whether the delivery fee is still
// refundable on a cancellation: before pickup, no delivery work has happened
// yet, so the fee refunds along with the subtotal; from here on the pickup
// leg is already done, so — like every other order fee — it's kept.
export const PICKUP_DONE_STATUSES = new Set(['picked_up', 'at_laundry'])
