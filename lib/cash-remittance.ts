// lib/cash-remittance.ts
// Shared "log a physical cash hand-over" action — used by both the admin
// and support Cash Remittance write routes so the validation/insert logic
// exists in exactly one place (a duplicated copy here is exactly the kind
// of drift that caused a real payout-count mismatch bug earlier — see the
// leg-attribution vs order_status_history split that used to exist for
// delivery payouts).

import { query, queryOne, transaction } from '@/lib/db'
import crypto from 'crypto'

export type LogRemittanceResult =
  | { success: true; batch_ref: string; total: number; order_count: number }
  | { success: false; error: string; status: number }

export async function logCashRemittance(params: {
  orderIds: number[]
  note:     string | null
  loggedBy: string | number
}): Promise<LogRemittanceResult> {
  const { orderIds, note, loggedBy } = params

  if (orderIds.length === 0) {
    return { success: false, error: 'order_ids must be a non-empty array', status: 400 }
  }

  // Pull the matching cod_collected entries — these are the source of
  // truth for both the amount and which partner they belong to.
  const collected = await query<{
    order_id: string; delivery_profile_id: string; amount: string
  }>(
    `SELECT order_id::TEXT, delivery_profile_id::TEXT, amount::TEXT
     FROM partner_cash_ledger
     WHERE order_id = ANY($1::BIGINT[]) AND kind = 'cod_collected'`,
    [orderIds]
  )

  if (collected.rowCount !== orderIds.length) {
    return { success: false, error: 'One or more orders have no recorded COD collection', status: 400 }
  }

  const partnerIds = new Set(collected.rows.map(r => r.delivery_profile_id))
  if (partnerIds.size > 1) {
    return { success: false, error: 'All selected orders must belong to the same delivery partner', status: 400 }
  }

  // Already-remitted orders would violate the unique index — check up
  // front so we can return a clear error instead of a raw DB conflict.
  const alreadyRemitted = await query<{ order_id: string }>(
    `SELECT order_id::TEXT FROM partner_cash_ledger
     WHERE order_id = ANY($1::BIGINT[]) AND kind = 'remittance'`,
    [orderIds]
  )
  if (alreadyRemitted.rowCount! > 0) {
    return {
      success: false,
      error: `Order(s) ${alreadyRemitted.rows.map(r => r.order_id).join(', ')} have already been marked as remitted`,
      status: 409,
    }
  }

  const deliveryProfileId = Number([...partnerIds][0])
  const batchRef = `RB-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  let total = 0

  await transaction(async client => {
    for (const row of collected.rows) {
      total += Number(row.amount)
      await client.query(
        `INSERT INTO partner_cash_ledger
           (delivery_profile_id, order_id, kind, amount, note, batch_ref, logged_by)
         VALUES ($1, $2, 'remittance', $3, $4, $5, $6)`,
        [deliveryProfileId, row.order_id, row.amount, note, batchRef, loggedBy]
      )
    }
  })

  return { success: true, batch_ref: batchRef, total, order_count: collected.rowCount! }
}

export interface PendingOrder {
  order_id:     string
  order_number: string
  amount:       number
  delivered_at: string
}
export interface PartnerPending {
  delivery_profile_id: string
  partner_name:        string
  phone:               string | null
  city:                string | null
  balance:              number
  orders:              PendingOrder[]
}

// Every cod_collected ledger entry that doesn't yet have a matching
// remittance row for the same order, grouped by partner. Shared by both
// the admin and support Cash Remittance pages' "pending hand-over" picker.
// Optionally scoped to one pickup pincode — ops covering a specific area
// only wants to see (and reconcile) COD orders from that area.
//
// deliveryProfileId narrows it to a single partner, which is what the
// partner's own /delivery/cash screen needs. It's a filter on this query
// rather than a second query so the partner and ops can never be shown a
// different set of orders for the same balance; without it the delivery
// route would compute every partner's position and discard all but one.
export async function getPendingRemittanceByPartner(
  pincode: string | null = null,
  deliveryProfileId: number | string | null = null,
): Promise<PartnerPending[]> {
  const pending = await query<{
    delivery_profile_id: string; partner_name: string; phone: string | null; city: string | null
    order_id: string; order_number: string; amount: string; delivered_at: string
  }>(`
    SELECT
      dp.id::TEXT AS delivery_profile_id,
      u.full_name AS partner_name,
      u.phone,
      dp.city,
      pcl.order_id::TEXT,
      o.order_number,
      pcl.amount::TEXT,
      o.delivered_at::TEXT
    FROM partner_cash_ledger pcl
    INNER JOIN orders o            ON o.id = pcl.order_id
    INNER JOIN delivery_profiles dp ON dp.id = pcl.delivery_profile_id
    INNER JOIN users u              ON u.id = dp.user_id
    WHERE pcl.kind = 'cod_collected'
      AND NOT EXISTS (
        SELECT 1 FROM partner_cash_ledger r
        WHERE r.order_id = pcl.order_id AND r.kind = 'remittance'
      )
      AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
      AND ($2::BIGINT IS NULL OR pcl.delivery_profile_id = $2::BIGINT)
    ORDER BY u.full_name ASC, o.delivered_at ASC
  `, [pincode, deliveryProfileId])

  const byPartner = new Map<string, PartnerPending>()
  for (const row of pending.rows) {
    if (!byPartner.has(row.delivery_profile_id)) {
      byPartner.set(row.delivery_profile_id, {
        delivery_profile_id: row.delivery_profile_id,
        partner_name:        row.partner_name,
        phone:               row.phone,
        city:                row.city,
        balance:             0,
        orders:              [],
      })
    }
    const entry = byPartner.get(row.delivery_profile_id)!
    const amount = Number(row.amount)
    entry.balance += amount
    entry.orders.push({
      order_id: row.order_id, order_number: row.order_number,
      amount, delivered_at: row.delivered_at,
    })
  }

  return [...byPartner.values()].sort((a, b) => b.balance - a.balance)
}

export async function getCodCashCap(): Promise<number> {
  const capRow = await queryOne<{ value: string }>(
    `SELECT value FROM platform_config WHERE key = 'cod_cash_cap'`
  )
  return capRow ? Number(JSON.parse(capRow.value)) : 5000
}

// ── Pincode + period-scoped analytics ─────────────────────────────────────
// Shared by both admin's and support's Cash Remittance GET routes so the
// numbers can never drift between the two pages.

export type RemittancePeriod = 'today' | '2d' | 'week' | '30d'

// period is always one of the 4 literals above (never raw user input), so
// splicing it into the query text here is safe — same convention already
// used by the pre-existing finance-overview/cash-remittance routes.
function periodFromClause(period: string): string {
  switch (period) {
    case 'today': return `DATE_TRUNC('day', NOW())`
    case '2d':    return `NOW() - INTERVAL '2 days'`
    case '30d':   return `NOW() - INTERVAL '30 days'`
    case 'week':
    default:      return `NOW() - INTERVAL '7 days'`
  }
}

export interface CashRemittanceSummary {
  total_to_receive:          number
  total_received:            number
  total_pending:             number
  partners_with_outstanding: number
}

// Running, all-time (never period-limited) reconciliation snapshot: of
// every rupee ever collected in cash by a delivery partner for a COD order
// (optionally scoped to one pincode), how much has actually been handed
// over to the company vs. still sitting with partners right now.
export async function getCashRemittanceSummary(pincode: string | null): Promise<CashRemittanceSummary> {
  const row = await queryOne<{
    total_to_receive: string; total_received: string; partners_with_outstanding: string
  }>(`
    SELECT
      COALESCE(SUM(pcl.amount) FILTER (WHERE pcl.kind = 'cod_collected'), 0)::TEXT AS total_to_receive,
      COALESCE(SUM(pcl.amount) FILTER (WHERE pcl.kind = 'remittance'), 0)::TEXT    AS total_received,
      COUNT(DISTINCT pcl.delivery_profile_id) FILTER (
        WHERE pcl.kind = 'cod_collected' AND NOT EXISTS (
          SELECT 1 FROM partner_cash_ledger r WHERE r.order_id = pcl.order_id AND r.kind = 'remittance'
        )
      )::TEXT AS partners_with_outstanding
    FROM partner_cash_ledger pcl
    INNER JOIN orders o ON o.id = pcl.order_id
    WHERE ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
  `, [pincode])

  const totalToReceive = row ? Number(row.total_to_receive) : 0
  const totalReceived  = row ? Number(row.total_received)   : 0
  return {
    total_to_receive: totalToReceive,
    total_received:   totalReceived,
    total_pending:    Math.max(0, Math.round((totalToReceive - totalReceived) * 100) / 100),
    partners_with_outstanding: row ? Number(row.partners_with_outstanding) : 0,
  }
}

export interface CashRemittancePeriodStats {
  collected_period:          number
  remitted_period:           number
  remittance_entries_period: number
}

// How much cash flowed through the system in a specific window ("this
// day" / "last 2 days" / "this week" / "last 30 days") — a separate,
// period-boxed view from the always-current summary above, since a
// remittance logged today can cover cash collected days earlier.
export async function getCashRemittancePeriodStats(
  period: string, pincode: string | null
): Promise<CashRemittancePeriodStats> {
  const from = periodFromClause(period)
  const row = await queryOne<{
    collected_period: string; remitted_period: string; remittance_entries_period: string
  }>(`
    SELECT
      COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'cod_collected' AND pcl.created_at BETWEEN ${from} AND NOW()
      ), 0)::TEXT AS collected_period,
      COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'remittance' AND pcl.created_at BETWEEN ${from} AND NOW()
      ), 0)::TEXT AS remitted_period,
      COUNT(*) FILTER (
        WHERE pcl.kind = 'remittance' AND pcl.created_at BETWEEN ${from} AND NOW()
      )::TEXT AS remittance_entries_period
    FROM partner_cash_ledger pcl
    INNER JOIN orders o ON o.id = pcl.order_id
    WHERE ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
  `, [pincode])

  return {
    collected_period:          row ? Number(row.collected_period) : 0,
    remitted_period:           row ? Number(row.remitted_period) : 0,
    remittance_entries_period: row ? Number(row.remittance_entries_period) : 0,
  }
}

export interface DailyRemittanceRow {
  date: string; total_remitted: string; order_count: string; partner_count: string
}

export async function getDailyRemittance(period: string, pincode: string | null): Promise<DailyRemittanceRow[]> {
  const from = periodFromClause(period)
  const result = await query<DailyRemittanceRow>(`
    SELECT
      DATE(pcl.created_at)::TEXT                AS date,
      COALESCE(SUM(pcl.amount), 0)::TEXT        AS total_remitted,
      COUNT(*)::TEXT                            AS order_count,
      COUNT(DISTINCT pcl.delivery_profile_id)::TEXT AS partner_count
    FROM partner_cash_ledger pcl
    INNER JOIN orders o ON o.id = pcl.order_id
    WHERE pcl.kind = 'remittance' AND pcl.created_at BETWEEN ${from} AND NOW()
      AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
    GROUP BY DATE(pcl.created_at)
    ORDER BY date DESC
  `, [pincode])
  return result.rows
}

export interface PartnerBreakdownRow {
  delivery_profile_id: string; partner_name: string
  remitted_period: string; outstanding_balance: string
}

// Per-partner "how much they've handed over this period vs. how much
// they're still holding right now" — always visible on both pages, not
// gated behind a click, so ops sees the full distribution at a glance.
export async function getByPartnerBreakdown(period: string, pincode: string | null): Promise<PartnerBreakdownRow[]> {
  const from = periodFromClause(period)
  const result = await query<PartnerBreakdownRow>(`
    SELECT
      dp.id::TEXT AS delivery_profile_id,
      u.full_name AS partner_name,
      COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'remittance' AND pcl.created_at BETWEEN ${from} AND NOW()
          AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
      ), 0)::TEXT AS remitted_period,
      COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'cod_collected'
          AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
          AND NOT EXISTS (
            SELECT 1 FROM partner_cash_ledger r WHERE r.order_id = pcl.order_id AND r.kind = 'remittance'
          )
      ), 0)::TEXT AS outstanding_balance
    FROM delivery_profiles dp
    INNER JOIN users u ON u.id = dp.user_id
    LEFT JOIN partner_cash_ledger pcl ON pcl.delivery_profile_id = dp.id
    LEFT JOIN orders o ON o.id = pcl.order_id
    GROUP BY dp.id, u.full_name
    HAVING
      COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'remittance' AND pcl.created_at BETWEEN ${from} AND NOW()
          AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
      ), 0) > 0
      OR COALESCE(SUM(pcl.amount) FILTER (
        WHERE pcl.kind = 'cod_collected'
          AND ($1::TEXT IS NULL OR o.pickup_pincode = $1::TEXT)
          AND NOT EXISTS (
            SELECT 1 FROM partner_cash_ledger r WHERE r.order_id = pcl.order_id AND r.kind = 'remittance'
          )
      ), 0) > 0
    ORDER BY outstanding_balance DESC
  `, [pincode])
  return result.rows
}
