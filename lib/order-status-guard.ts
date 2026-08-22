// lib/order-status-guard.ts
//
// Is this order past the point where its status can still be changed?
//
// The database already refuses: prevent_invalid_status_transition() (a BEFORE
// UPDATE trigger on orders.status, scripts/03-create-function.sql) raises when
// the CURRENT status is flagged terminal in laundry_statuses — today that is
// 'cancelled' and 'delivered'.
//
// That guard is correct and stays. What it did badly was surface: a RAISE
// EXCEPTION from a trigger arrives at the API as an unhandled error, so an
// admin picking a new status on a cancelled order got "Internal server error"
// with no hint that they had asked for something the system deliberately
// forbids. Checking first turns that into a sentence.
//
// This is a nicety on top of the real control, not a replacement for it. The
// trigger is still what enforces the rule — including for any code path that
// forgets to call this.

import { queryOne } from '@/lib/db'

/**
 * Terminal statuses, read from the same table the trigger consults so the two
 * can never disagree about which states are final.
 */
export async function isTerminalOrderStatus(status: string): Promise<boolean> {
  const row = await queryOne<{ is_terminal: boolean }>(
    `SELECT is_terminal FROM laundry_statuses WHERE code = $1`,
    [status]
  )
  return row?.is_terminal === true
}

/** Message shown when someone tries to move an order out of a final state. */
export function terminalStatusMessage(status: string): string {
  if (status === 'cancelled') {
    return 'This order was cancelled and any refund has already been processed. ' +
           'It cannot be moved back to another status — the customer needs to place a new order.'
  }
  if (status === 'delivered') {
    return 'This order has been delivered. Its status can no longer be changed.'
  }
  return `This order is ${status}, which is a final state. Its status can no longer be changed.`
}
