// Shared order-status helpers used across customer order API routes.

// Statuses that are still reschedulable (not yet picked up).
export const RESCHEDULABLE_STATUSES = new Set(['pending', 'confirmed'])

// Statuses before the laundry provider has started processing the order.
// Once an order moves into 'processing' (or beyond), it can no longer be cancelled.
export const CANCELLABLE_STATUSES = new Set([
  'pending', 'confirmed', 'assigned_for_pickup', 'picked_up', 'at_laundry',
])
