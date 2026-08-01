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

export interface CodCashExposure {
  collectedUnremitted: number
  committedExposure:   number
  totalExposure:       number
  cap:                 number
  overCap:             boolean
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
