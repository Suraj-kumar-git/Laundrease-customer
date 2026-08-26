// lib/order-measurement-guard.ts
//
// Stopping a pickup from completing while a dimension-priced item is still
// unmeasured.
//
// WHY THIS HAS TO BLOCK
// A per-sqft line is worth ₹0 until someone measures it. Nothing else in the
// system objects to that — the order is internally consistent, the totals add
// up, the trigger chain is happy. It is only wrong in the world: the provider
// cleans a carpet and is paid nothing for it, and the customer is never
// charged for work that was done.
//
// And it cannot be fixed afterwards. The measurement has to be agreed with the
// customer, and the only moment they are present is the pickup itself. An hour
// later there is nobody to show the tape measure to, so a price set then is a
// price imposed rather than agreed. Blocking here is what keeps the number
// something both sides saw.
//
// Checked at BOTH ends of the OTP exchange: triggering (so the customer is not
// sent a code for a step that cannot complete) and verifying (because that is
// the one a client cannot skip).

import { query } from '@/lib/db'

export interface UnmeasuredItem {
  id:           number
  product_name: string
}

/**
 * Items on this order that are priced by dimension and have no measurement.
 *
 * Removed items are excluded: `not_picked_up` means it is not being taken, so
 * there is nothing to measure and nothing to bill.
 */
export async function findUnmeasuredItems(orderId: number | string): Promise<UnmeasuredItem[]> {
  const res = await query<UnmeasuredItem>(
    `SELECT oi.id, pt.name AS product_name
     FROM order_items oi
     JOIN product_types pt ON pt.id = oi.product_type_id
     WHERE oi.order_id = $1
       AND pt.pricing_model = 'per_sqft'
       AND oi.status <> 'not_picked_up'
       AND (oi.area_sqft IS NULL OR oi.area_sqft <= 0)
     ORDER BY oi.id`,
    [orderId]
  )
  return res.rows
}

/** Names the items so the partner knows which one to go and measure. */
export function unmeasuredMessage(items: UnmeasuredItem[]): string {
  const names = items.map(i => i.product_name)
  const list  = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Measure ${list} before confirming pickup — ${
    names.length === 1 ? 'it is' : 'they are'
  } priced by size, and the customer needs to agree the measurement while you are there.`
}
