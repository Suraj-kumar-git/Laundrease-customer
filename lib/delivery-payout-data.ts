// lib/delivery-payout-data.ts
//
// Server-side loaders for the distance-payout calculation.
//
// Split from lib/delivery-payout.ts because that module is imported by the
// admin settings page (a client component) for its live rate preview — pulling
// @/lib/db in there would drag the database client into the browser bundle.
// Pure math lives there; anything touching Postgres lives here.

import { query, queryOne } from '@/lib/db'
import type {
  BonusTier, DeliveryPayoutConfig, PartnerLegDistances, SurgeRule,
} from '@/lib/delivery-payout'

/**
 * The active payout config, or null if none exists.
 *
 * Null is a legitimate state, not an error: it means distance pay was never
 * configured, and every caller falls back to slab-only — exactly the behaviour
 * that existed before this feature.
 */
export async function loadPayoutConfig(): Promise<DeliveryPayoutConfig | null> {
  const row = await queryOne<{
    is_active: boolean
    per_km_rate: string
    minimum_billable_km: string
    max_payout_per_leg: string | null
    slab_floor_enabled: boolean
    failed_trip_payout: string
    first_mile_allowance: string
    surge_timezone: string
  }>(`
    SELECT is_active, per_km_rate::TEXT, minimum_billable_km::TEXT,
           max_payout_per_leg::TEXT, slab_floor_enabled,
           failed_trip_payout::TEXT, first_mile_allowance::TEXT, surge_timezone
    FROM delivery_partner_payout_config
    ORDER BY is_active DESC, id DESC
    LIMIT 1
  `)

  if (!row) return null

  return {
    is_active:            row.is_active,
    per_km_rate:          parseFloat(row.per_km_rate) || 0,
    minimum_billable_km:  parseFloat(row.minimum_billable_km) || 0,
    max_payout_per_leg:   row.max_payout_per_leg != null ? parseFloat(row.max_payout_per_leg) : null,
    slab_floor_enabled:   row.slab_floor_enabled,
    failed_trip_payout:   parseFloat(row.failed_trip_payout) || 0,
    first_mile_allowance: parseFloat(row.first_mile_allowance) || 0,
    surge_timezone:       row.surge_timezone || 'Asia/Kolkata',
  }
}

/** Active peak windows. Empty means no surge is configured — multiplier 1. */
export async function loadSurgeRules(): Promise<SurgeRule[]> {
  const rows = await query<{
    id: number; label: string; day_of_week: number | null
    start_time: string; end_time: string; multiplier: string
  }>(`
    SELECT id, label, day_of_week, start_time::TEXT, end_time::TEXT, multiplier::TEXT
    FROM delivery_payout_surge_rules
    WHERE is_active
    ORDER BY multiplier DESC, id ASC
  `)

  return rows.rows.map(r => ({
    id:          r.id,
    label:       r.label,
    day_of_week: r.day_of_week,
    start_time:  r.start_time,
    end_time:    r.end_time,
    multiplier:  parseFloat(r.multiplier) || 1,
  }))
}

/** Active volume bonus tiers. Empty means no bonus scheme is running. */
export async function loadBonusTiers(): Promise<BonusTier[]> {
  const rows = await query<{ id: number; min_legs: number; bonus_amount: string }>(`
    SELECT id, min_legs, bonus_amount::TEXT
    FROM delivery_payout_bonus_tiers
    WHERE is_active
    ORDER BY min_legs ASC
  `)

  return rows.rows.map(r => ({
    id:           r.id,
    min_legs:     r.min_legs,
    bonus_amount: parseFloat(r.bonus_amount) || 0,
  }))
}

/**
 * Logged failed pickup/delivery attempts per partner in the period.
 *
 * Read from order_pickup_failures, which the status route writes inside the
 * same transaction as the attempt counter — so an attempt cannot be paid for
 * unless it was really logged, against a real reason, on that partner's own
 * profile.
 */
export async function loadFailedAttempts(
  periodStart: string,
  periodEnd: string,
): Promise<Map<string, number>> {
  const rows = await query<{ profile_id: string; attempts: string }>(`
    SELECT delivery_profile_id::TEXT AS profile_id, COUNT(*)::TEXT AS attempts
    FROM order_pickup_failures
    WHERE delivery_profile_id IS NOT NULL
      AND DATE(created_at) BETWEEN $1::DATE AND $2::DATE
    GROUP BY delivery_profile_id
  `, [periodStart, periodEnd])

  return new Map(rows.rows.map(r => [r.profile_id, parseInt(r.attempts, 10) || 0]))
}

/**
 * Every completed leg in the period, grouped by partner, carrying the order's
 * frozen checkout distance.
 *
 * DISTINCT ON (profile, order, leg_type) so a partner is paid once per leg
 * even if the leg row was written twice. That deliberately mirrors the
 * COUNT(DISTINCT l.order_id) the slab counts already use — the two numbers
 * have to describe the same set of work, or the floor comparison is nonsense.
 *
 * delivery_distance_km is the customer<->laundry distance frozen at checkout
 * (see scripts/43-order-fee-base-and-snapshot.sql). Both legs of an order
 * cover that same distance, so both read the same column.
 */
export async function loadLegDistances(
  periodStart: string,
  periodEnd: string,
  /** Zone the surge windows are written in — see loadPayoutConfig. */
  surgeTimezone = 'Asia/Kolkata',
): Promise<Map<string, PartnerLegDistances>> {
  // The day-of-week and time-of-day are computed in the surge timezone, not
  // UTC: "evening peak" means 6pm where the partner rode. Postgres does the
  // conversion because it owns the tz database; deriving it in Node would mean
  // a second, drift-prone implementation of the same rule.
  const rows = await query<{
    profile_id: string
    leg_type: string
    distance_km: string | null
    local_dow: number
    local_time: string
  }>(`
    SELECT DISTINCT ON (l.delivery_profile_id, l.order_id, l.leg_type)
      l.delivery_profile_id::TEXT AS profile_id,
      l.leg_type,
      o.delivery_distance_km::TEXT AS distance_km,
      EXTRACT(DOW FROM (l.completed_at AT TIME ZONE $3))::INTEGER AS local_dow,
      ((l.completed_at AT TIME ZONE $3)::TIME)::TEXT              AS local_time
    FROM order_delivery_legs l
    INNER JOIN orders o ON o.id = l.order_id
    WHERE l.status = 'completed'
      AND l.delivery_profile_id IS NOT NULL
      AND l.leg_type IN ('pickup', 'delivery')
      AND DATE(l.completed_at) BETWEEN $1::DATE AND $2::DATE
    ORDER BY l.delivery_profile_id, l.order_id, l.leg_type, l.completed_at ASC
  `, [periodStart, periodEnd, surgeTimezone])

  const byPartner = new Map<string, PartnerLegDistances>()

  for (const row of rows.rows) {
    let entry = byPartner.get(row.profile_id)
    if (!entry) {
      entry = { legs: [], failed_attempts: 0 }
      byPartner.set(row.profile_id, entry)
    }
    const distance = row.distance_km != null ? parseFloat(row.distance_km) : null

    entry.legs.push({
      leg_type:    row.leg_type === 'pickup' ? 'pickup' : 'delivery',
      distance_km: distance != null && Number.isFinite(distance) ? distance : null,
      local_dow:   row.local_dow,
      // Postgres renders TIME as 'HH:MM:SS'; resolveSurgeMultiplier compares
      // these lexically, which is only correct with the zero-padded form.
      local_time:  row.local_time,
    })
  }

  return byPartner
}

/** Empty legs, for partners the leg query returned nothing for. */
export const NO_LEGS: PartnerLegDistances = { legs: [], failed_attempts: 0 }

export interface DatedLeg {
  /** ISO date (YYYY-MM-DD) the leg completed on. */
  completed_on: string
  distance_km:  number | null
}

export interface PeriodBoundaries {
  today:       string
  week_start:  string
  month_start: string
}

/**
 * One partner's completed legs since the start of the current week or month,
 * whichever is earlier, plus the period boundaries Postgres considers current.
 *
 * A single query rather than one per period: the dashboard needs today, this
 * week and this month, and bucketing three windows in TypeScript beats three
 * round trips plus three near-identical SQL fragments.
 *
 * The boundaries come from Postgres too, so "this week" means whatever
 * date_trunc('week') means to the database (Monday-based) rather than whatever
 * the Node process's locale would have guessed. Dates are ISO strings, which
 * compare correctly lexically.
 */
export async function loadPartnerRecentLegs(profileId: string): Promise<{
  legs: DatedLeg[]
  boundaries: PeriodBoundaries
}> {
  const boundaries = await queryOne<PeriodBoundaries>(`
    SELECT CURRENT_DATE::TEXT                        AS today,
           date_trunc('week',  CURRENT_DATE)::DATE::TEXT AS week_start,
           date_trunc('month', CURRENT_DATE)::DATE::TEXT AS month_start
  `)

  // Same DISTINCT ON dedupe as the payout calculation — the dashboard must
  // not tell a partner they earned something the payout run won't pay.
  const rows = await query<{ completed_on: string; distance_km: string | null }>(`
    SELECT DISTINCT ON (l.order_id, l.leg_type)
      DATE(l.completed_at)::TEXT AS completed_on,
      o.delivery_distance_km::TEXT AS distance_km
    FROM order_delivery_legs l
    INNER JOIN orders o ON o.id = l.order_id
    WHERE l.delivery_profile_id = $1::BIGINT
      AND l.status = 'completed'
      AND l.leg_type IN ('pickup', 'delivery')
      AND l.completed_at >= LEAST(
            date_trunc('week',  CURRENT_DATE),
            date_trunc('month', CURRENT_DATE)
          )
    ORDER BY l.order_id, l.leg_type, l.completed_at ASC
  `, [profileId])

  return {
    legs: rows.rows.map(r => {
      const d = r.distance_km != null ? parseFloat(r.distance_km) : null
      return {
        completed_on: r.completed_on,
        distance_km:  d != null && Number.isFinite(d) ? d : null,
      }
    }),
    boundaries: boundaries ?? { today: '', week_start: '', month_start: '' },
  }
}
