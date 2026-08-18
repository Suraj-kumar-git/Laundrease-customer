// Shared order-status helpers used across customer order API routes.

// Statuses that are still reschedulable (not yet picked up).
export const RESCHEDULABLE_STATUSES = new Set(['pending', 'confirmed'])

// Statuses a CUSTOMER can still self-cancel from.
//
// The cutoff is pickup, not the start of processing: once the delivery partner
// has physically collected the parcel, the customer no longer has it and a
// self-service cancellation would strand goods mid-network. 'picked_up' and
// 'at_laundry' were previously included (the old rule was "until the provider
// starts processing") and were removed when that requirement changed.
//
// 'out_for_pickup' stays — the partner is on the way but hasn't collected
// anything yet, and dropping it would make the Cancel button vanish while
// they're en route and reappear on arrival.
//
// This is NOT the delivery partner's set. DELIVERY_CANCELLABLE_STATUSES (in
// app/api/delivery/orders/[id]/status/route.ts) still covers picked_up and
// at_laundry, because a customer asking the partner in person to cancel at the
// door is a different, still-valid path with a human in the loop.
export const CANCELLABLE_STATUSES = new Set([
  'pending', 'confirmed', 'assigned_for_pickup', 'out_for_pickup',
])

// Statuses reached only once the delivery partner has actually collected the
// order from the customer. Used to decide whether the delivery fee is still
// refundable on a cancellation: before pickup, no delivery work has happened
// yet, so the fee refunds along with the subtotal; from here on the pickup
// leg is already done, so — like every other order fee — it's kept.
export const PICKUP_DONE_STATUSES = new Set(['picked_up', 'at_laundry'])
