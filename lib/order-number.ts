// lib/order-number.ts
//
// One shape for every order number: ORD-XXXXXXXX.
//
// ---- What was inconsistent -------------------------------------------------
// Order numbers came from two different places, and which one you got depended
// on how the order happened to be created:
//
//   ORD-F0FFB301        the cart's draft_order_number, reserved by
//                       ensure_draft_order_number() when the cart was created
//                       (scripts/17-cart-resume.sql) so the customer can see
//                       their order number before checkout and keep it across
//                       a resumed cart.
//
//   ORD1787394257965    `ORD${Date.now()}` — the fallback in the create route,
//                       used whenever there was no draft to adopt: a cart that
//                       predates the draft column, an order that did not come
//                       through the cart flow, or a draft number already spent
//                       by an earlier unpaid order that got voided on retry.
//
// Both are unique, so nothing broke — it just meant a customer could hold two
// invoices with two different-looking references, and anyone searching by
// order number had to know both shapes.
//
// ---- Why ORD-XXXXXXXX won ---------------------------------------------------
// It is the format the draft reservation already produces, and that
// reservation is a real feature (the number is shown before the order exists).
// Changing it would mean changing the DB function and re-reserving every live
// cart's number mid-session. Changing the fallback instead is a one-line
// behaviour change with nothing depending on it.
//
// The epoch fallback was also weaker than it looked: two orders created in the
// same millisecond produce the same string, and the only thing standing behind
// it is the UNIQUE constraint — which would have surfaced as a failed
// checkout, not as a retry.

import crypto from 'crypto'

export type Exec = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>

/** Attempts before giving up. 8 hex chars is ~4.3 billion values. */
const MAX_ATTEMPTS = 10

/** `ORD-` + 8 uppercase hex, matching ensure_draft_order_number(). */
function candidate(): string {
  return `ORD-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

/**
 * A fresh order number that collides with nothing.
 *
 * Checks `shopping_carts.draft_order_number` as well as `orders.order_number`:
 * a draft number is a RESERVATION for an order that does not exist yet, so
 * ignoring those would let us take a number some open cart is already showing
 * its customer, and their checkout would then fail on the unique constraint.
 *
 * Pass the transaction's client when inserting inside one, so the check and
 * the insert see the same snapshot.
 */
export async function generateOrderNumber(exec: Exec): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const value = candidate()
    const clash = await exec(
      `SELECT 1
         FROM orders WHERE order_number = $1
       UNION ALL
       SELECT 1
         FROM shopping_carts WHERE draft_order_number = $1
       LIMIT 1`,
      [value]
    )
    if (clash.rowCount === 0) return value
  }

  // Ten collisions in a row against a 4-billion space is not bad luck, it is a
  // broken RNG or a corrupt table. Fail loudly rather than fall back to a
  // second format and reintroduce exactly the inconsistency this removes.
  throw new Error('Could not generate a unique order number after 10 attempts')
}
