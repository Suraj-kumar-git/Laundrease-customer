// lib/delivery-cash-cap.ts
// Single source of truth for "is this delivery partner over the COD
// cash-in-hand cap" — used to gate accepting NEW COD delivery legs.
//
// Exposure = cash already collected and not yet remitted, PLUS cash the
// partner is already committed to collect from COD delivery legs they've
// accepted but not yet completed. Without the second term, a partner could
// stack several COD delivery legs back-to-back (each accept check only
// ever sees the FIRST term, which stays low until a delivery is actually
// completed) and end up holding far more cash than the cap intends by the
// time they've delivered them all. This does NOT double count: a leg's
// order stops contributing to the "committed" term the moment it's
// delivered (status flips out of assigned/in_progress) and starts
// contributing to the "collected" term instead via the cod_collected
// ledger row written at that same moment.
//
// This is exposure used only for the accept-time gate — it is NOT the same
// number as "balance pending remittance" shown on the Cash Remittance page,
// which intentionally reflects only cash actually already collected (real
// money physically held), not cash from jobs still in progress.

import { query, queryOne } from '@/lib/db'
import { getPendingRemittanceByPartner, type PendingOrder } from '@/lib/cash-remittance'

export interface CodCashExposure {
  collectedUnremitted: number
  committedExposure:   number
  totalExposure:       number
  cap:                 number
  overCap:             boolean
}

/**
 * Does this order still have cash to collect at the door?
 *
 * Reads the pending COD payments row, NOT orders.payment_method.
 *
 * The two are not equivalent. An order paid in full online and then grown at
 * pickup (partner adds items) gets a pending COD payments row written by
 * app/api/delivery/orders/[id]/items/route.ts while orders.payment_method
 * stays 'upi' — so a payment_method test says "no cash here" on an order the
 * partner will collect real money for. getCodCashExposure() has always
 * counted those rupees; the gates used to miss them, which let a partner at
 * the cap keep accepting exactly the orders the cap exists to stop.
 *
 * Same source the rest of the COD-collection flow trusts (trigger-otp,
 * verify-otp and the committed-exposure term below all key off this row), so
 * this is the one definition of "cash due" across every gate.
 */
export async function orderHasCashDue(orderId: number | string): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM payments
     WHERE order_id = $1::BIGINT AND provider = 'cod' AND status = 'pending' AND amount > 0
     LIMIT 1`,
    [orderId]
  )
  return row !== null
}

export async function getCodCashExposure(deliveryProfileId: number | string): Promise<CodCashExposure> {
  const [capRow, balanceRow, committedRow] = await Promise.all([
    queryOne<{ value: string }>(`SELECT value FROM platform_config WHERE key = 'cod_cash_cap'`),

    queryOne<{ balance: string }>(
      `SELECT (
         COALESCE(SUM(amount) FILTER (WHERE kind = 'cod_collected'), 0) -
         COALESCE(SUM(amount) FILTER (WHERE kind = 'remittance'), 0)
       )::TEXT AS balance
       FROM partner_cash_ledger WHERE delivery_profile_id = $1::BIGINT`,
      [deliveryProfileId]
    ),

    // Cash this partner is already on the hook to collect: COD delivery
    // legs they hold that haven't been completed yet. Uses the pending COD
    // payment row's amount (not order.total_amount) so a wallet+COD split
    // only counts the actual COD portion still due — the same source the
    // rest of the COD-collection flow already trusts.
    query<{ amount: string }>(
      `SELECT p.amount::TEXT
       FROM order_delivery_legs l
       INNER JOIN orders o   ON o.id = l.order_id
       INNER JOIN payments p ON p.order_id = o.id AND p.provider = 'cod' AND p.status = 'pending' AND p.amount > 0
       WHERE l.delivery_profile_id = $1::BIGINT
         AND l.leg_type = 'delivery'
         AND l.status IN ('assigned', 'in_progress')`,
      [deliveryProfileId]
    ),
  ])

  const cap                 = capRow ? Number(JSON.parse(capRow.value)) : 5000
  const collectedUnremitted = balanceRow ? Number(balanceRow.balance) : 0
  const committedExposure   = committedRow.rows.reduce((s, r) => s + Number(r.amount), 0)
  const totalExposure       = collectedUnremitted + committedExposure

  return { collectedUnremitted, committedExposure, totalExposure, cap, overCap: totalExposure >= cap }
}

export interface CodCashDetail extends CodCashExposure {
  /** Rupees of further COD the partner may take on. Never negative. */
  headroom: number
  /** The exact orders whose cash is still with them — same rows ops sees. */
  orders:   PendingOrder[]
}

/**
 * The partner-facing view of their own cash position.
 *
 * Deliberately a thin wrapper over getCodCashExposure() rather than its own
 * query: what the partner is shown and what the accept gate enforces must be
 * the same arithmetic, or a partner blocked at ₹5,000 while their screen
 * reads ₹4,100 will (correctly) believe they're being cheated.
 *
 * The order list comes from getPendingRemittanceByPartner() — the same query
 * behind the ops Cash Remittance page — so a partner standing at the hub can
 * check their screen against the ops screen line by line.
 *
 * Note the two figures measure different things and both are shown: the order
 * list totals collectedUnremitted (real notes in their pocket), while the cap
 * is compared against totalExposure, which also counts cash they're committed
 * to collect on delivery legs already accepted. Showing only one would make
 * the cap arithmetic look wrong.
 */
export async function getCodCashDetail(deliveryProfileId: number | string): Promise<CodCashDetail> {
  const [exposure, pending] = await Promise.all([
    getCodCashExposure(deliveryProfileId),
    getPendingRemittanceByPartner(null, deliveryProfileId),
  ])

  return {
    ...exposure,
    headroom: Math.max(0, Math.round((exposure.cap - exposure.totalExposure) * 100) / 100),
    orders:   pending[0]?.orders ?? [],
  }
}
