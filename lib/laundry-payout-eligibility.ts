// lib/laundry-payout-eligibility.ts
//
// Single source of truth for "which orders can be paid out to a laundry
// provider, and when did each become payable".
//
// This predicate decides real payments. It was previously copy-pasted across
// four query sites (admin + support × the calculate route's provider scan and
// its per-provider order fetch) plus the list route's outstanding summary —
// five chances for the copies to drift apart. They live here now.
//
// ---- Eligibility date -----------------------------------------------------
// The date an order became payable, which is what decides the payout period
// it falls into:
//
//   online / UPI / wallet        -> orders.delivered_at
//   COD or part-COD (wallet+cod) -> the partner_cash_ledger remittance date
//
// So an order delivered 30 July whose COD cash only reached us on 1 August is
// an AUGUST payout line, showing a July delivery date. Until that cash is
// remitted the order has no eligibility date at all and is not payable — the
// platform hasn't got the money yet, so it can't pass it on.
//
// `payment_method ILIKE '%cod%'` deliberately catches 'cod' and 'wallet+cod'
// alike: any order with a cash component depends on that cash arriving.

/**
 * SQL expression yielding an order's eligibility date (TIMESTAMPTZ), or NULL
 * when it isn't payable yet. `alias` is the table alias for `orders`.
 */
export function eligibilityDateSql(alias = 'o'): string {
  return `
    CASE
      WHEN ${alias}.payment_method ILIKE '%cod%' THEN (
        SELECT MAX(pcl.created_at)
        FROM partner_cash_ledger pcl
        WHERE pcl.order_id = ${alias}.id AND pcl.kind = 'remittance'
      )
      ELSE ${alias}.delivered_at
    END`
}

/**
 * Full WHERE-clause body for orders that a Calculate run should pick up.
 *
 * Requires TWO bind params, in this order: from date, to date (both DATE).
 * Callers pass their own starting placeholder number.
 *
 * The `NOT EXISTS` against provider_payout_orders is what stops an order ever
 * being paid twice — it's belt-and-braces with the UNIQUE index on
 * provider_payout_orders.order_id, which enforces the same thing at the
 * database level even if a caller forgets this clause.
 */
export function eligibleOrdersPredicate(
  fromParam: number,
  toParam: number,
  alias = 'o',
): string {
  const eligDate = eligibilityDateSql(alias)
  return `
    ${alias}.status IN ('completed', 'delivered')
    AND NOT EXISTS (
      SELECT 1 FROM provider_payout_orders ppo WHERE ppo.order_id = ${alias}.id
    )
    AND (${eligDate}) IS NOT NULL
    AND DATE(${eligDate}) BETWEEN $${fromParam}::DATE AND $${toParam}::DATE`
}

/** True when the string looks like YYYY-MM-DD. Rejects anything else. */
export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

export interface PayoutRange { from: string; to: string }

/**
 * Validates a requested payout window. Returns the range or an error message —
 * never throws, so routes can turn it straight into a 400.
 *
 * Rejects an inverted range explicitly: silently swapping the dates would let
 * a typo produce a payout covering a period the operator never intended.
 */
export function parsePayoutRange(body: { from_date?: unknown; to_date?: unknown }):
  { ok: true; range: PayoutRange } | { ok: false; error: string } {
  if (!isIsoDate(body.from_date)) return { ok: false, error: 'from_date is required (YYYY-MM-DD)' }
  if (!isIsoDate(body.to_date))   return { ok: false, error: 'to_date is required (YYYY-MM-DD)' }
  if (body.from_date > body.to_date) {
    return { ok: false, error: 'from_date must be on or before to_date' }
  }
  return { ok: true, range: { from: body.from_date, to: body.to_date } }
}
