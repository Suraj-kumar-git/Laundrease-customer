// lib/sweeps.ts
//
// Maintenance sweeps: work that becomes necessary because time passed, not
// because anyone did anything. Nobody clicks a button to make a pickup date go
// stale — it goes stale because tomorrow arrived.
//
// Extracted from their admin routes so the scheduler can call them directly.
// A cron endpoint that HTTP-requests another route on the same deployment
// would need to authenticate to itself, doubling the surface for no gain.

import { addDays, format, startOfDay } from 'date-fns'
import { query, queryOne, transaction } from '@/lib/db'
import { isProviderClosedOnDate } from '@/lib/delivery-estimate'
import { rescheduleOrder } from '@/lib/order-reschedule'
import { autoCancelForRescheduleLimit } from '@/lib/order-cancellation'

// ── Orders missed their pickup date ─────────────────────────────────────────

const PRE_PICKUP_STATUSES = ['pending', 'confirmed', 'assigned_for_pickup', 'out_for_pickup']
const CLOSED_DATE_SEARCH_WINDOW_DAYS = 7

export interface RescheduleSweepResult {
  scanned:        number
  rescheduled:    number
  auto_cancelled: number
  errors:         { order_id: number; error: string }[]
}

async function nextAvailablePickupDate(laundryProfileId: number | null): Promise<string> {
  let candidate = addDays(startOfDay(new Date()), 1)   // "tomorrow" relative to the run
  if (laundryProfileId == null) return format(candidate, 'yyyy-MM-dd')

  for (let i = 0; i < CLOSED_DATE_SEARCH_WINDOW_DAYS; i++) {
    const ds = format(candidate, 'yyyy-MM-dd')
    const closed = await isProviderClosedOnDate((text, p) => query(text, p), laundryProfileId, ds)
    if (!closed) return ds
    candidate = addDays(candidate, 1)
  }
  return format(candidate, 'yyyy-MM-dd')
}

/**
 * Move on any order whose pickup date has passed while it is still pre-pickup.
 *
 * Without this those orders are simply stuck: the customer sees a pickup date
 * in the past, nobody is coming, and the order is neither progressing nor
 * cancelled. The 3-strike auto-cancel can't save them either, because it is
 * driven by reschedules — so nothing ever happens at all.
 */
export async function runRescheduleSweep(
  shouldStop?: () => boolean
): Promise<RescheduleSweepResult> {
  const candidates = await query<{
    id: number; laundry_profile_id: number | null; pickup_date: string
  }>(
    `SELECT id, laundry_profile_id, pickup_date::TEXT
     FROM orders
     WHERE pickup_date < CURRENT_DATE AND status = ANY($1::text[])`,
    [PRE_PICKUP_STATUSES]
  )

  let rescheduled   = 0
  let autoCancelled = 0
  const errors: { order_id: number; error: string }[] = []

  // Sequential on purpose — a large backlog run in parallel would exhaust the
  // connection pool, and each order opens its own transaction.
  for (const order of candidates.rows) {
    if (shouldStop?.()) break

    try {
      const targetDate = await nextAvailablePickupDate(order.laundry_profile_id)
      const result = await transaction(client => rescheduleOrder({
        client, orderId: order.id, laundryProfileId: order.laundry_profile_id,
        newPickupDate: targetDate,
        reasonNote: `Automatically rescheduled to ${targetDate} — order was not picked up on the original pickup date (${order.pickup_date})`,
        initiatedBy: null, initiatedByRole: 'system',
      }))
      rescheduled++

      if (result.autoCancelThresholdReached) {
        const { cancelled } = await autoCancelForRescheduleLimit(order.id)
        if (cancelled) autoCancelled++
      }
    } catch (err: any) {
      // One bad order must not abandon the rest of the backlog.
      errors.push({ order_id: order.id, error: err?.message || 'Unknown error' })
      console.error(`[sweeps/reschedule] failed for order ${order.id}:`, err)
    }
  }

  return {
    scanned: candidates.rowCount ?? 0,
    rescheduled,
    auto_cancelled: autoCancelled,
    errors,
  }
}

// ── Lapsed provider subscriptions ───────────────────────────────────────────

export interface SubscriptionExpiryResult { expired: number }

/**
 * Mark subscriptions expired once their end date has passed, and drop the
 * provider back to Basic.
 *
 * Worth being clear about what this does NOT do: it is not what stops a lapsed
 * provider receiving orders. Customer search independently requires
 * `grace_period_ends_at > NOW()` and the per-order eligibility check tests
 * `ends_at` directly, so a provider falls out of circulation on time whether
 * or not this has run. This is bookkeeping — without it, `status` stays
 * 'active' on subscriptions that have ended, and every report built on that
 * column overstates how many providers are actually paying.
 */
export async function runSubscriptionExpiry(): Promise<SubscriptionExpiryResult> {
  const result = await queryOne<{ count: string }>(
    `SELECT expire_subscriptions_and_fallback()::TEXT AS count`
  )
  return { expired: parseInt(result?.count ?? '0', 10) }
}
