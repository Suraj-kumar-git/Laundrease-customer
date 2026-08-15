// lib/delivery-payout.ts
//
// What the platform pays an independent delivery partner for one leg.
//
// Distinct from lib/order-invoice.ts and calculate_order_fees(), which decide
// what the CUSTOMER is charged. The two numbers are unrelated by design: a
// customer inside the free-delivery radius pays nothing for delivery, and the
// partner is still owed the trip. Reading either as the other is the bug this
// module exists to prevent.
//
// The math lives here rather than in SQL because the admin settings screen
// previews it live as the rates are typed, and the payout calculation route is
// TypeScript too (see app/api/admin/delivery/payouts/calculate/route.ts). One
// implementation, both callers.

export interface DeliveryPayoutConfig {
  is_active:           boolean
  per_km_rate:         number
  minimum_billable_km: number
  /** NULL/undefined = uncapped. */
  max_payout_per_leg:  number | null
  slab_floor_enabled:  boolean
  /** Flat pay for a logged failed attempt. 0 disables it. */
  failed_trip_payout:  number
  /** Flat allowance on every pickup leg, for the unmeasured ride out. */
  first_mile_allowance: number
  /** IANA zone the surge windows are expressed in. */
  surge_timezone:      string
}

/** A peak window that multiplies the distance component. */
export interface SurgeRule {
  id:          number
  label:       string
  /** null = every day. 0 = Sunday … 6 = Saturday. */
  day_of_week: number | null
  /** 'HH:MM:SS'. */
  start_time:  string
  end_time:    string
  multiplier:  number
}

/** Total legs in the period needed to earn `bonus_amount`. */
export interface BonusTier {
  id:           number
  min_legs:     number
  bonus_amount: number
}

export interface LegPayout {
  /** Distance actually billed, after the minimum is applied. */
  billable_km: number
  /** Distance pay before surge and allowances, after any cap. */
  base_amount: number
  /** 1 when no peak window applied. */
  surge_multiplier: number
  /** Extra earned from the multiplier, above base_amount. */
  surge_extra: number
  /** First-mile allowance — pickup legs only. */
  first_mile: number
  /** Total rupees owed for this leg. */
  amount: number
  /** The minimum was billed rather than the real distance. */
  minimum_applied: boolean
  /** max_payout_per_leg clipped the distance component — often a bad geocode. */
  capped: boolean
  /** No usable distance on the order; the minimum was billed as the fair default. */
  distance_missing: boolean
}

/**
 * The multiplier in force for a leg, from its completion time in local terms.
 *
 * Highest multiplier wins where windows overlap — a partner riding through
 * both "evening peak" and "weekend" should get the better of the two, not an
 * arbitrary first match, and certainly not both compounded.
 *
 * A window whose end is at or before its start wraps past midnight, so
 * 22:00–02:00 covers 23:30 and 01:00. Times are 'HH:MM:SS' strings, which
 * compare correctly lexically.
 */
export function resolveSurgeMultiplier(
  rules: SurgeRule[],
  localDayOfWeek: number,
  localTime: string,
): { multiplier: number; rule: SurgeRule | null } {
  let best: SurgeRule | null = null

  for (const rule of rules) {
    if (rule.day_of_week != null && rule.day_of_week !== localDayOfWeek) continue

    const wraps  = rule.end_time <= rule.start_time
    const inside = wraps
      ? (localTime >= rule.start_time || localTime < rule.end_time)
      : (localTime >= rule.start_time && localTime < rule.end_time)

    if (inside && (!best || rule.multiplier > best.multiplier)) best = rule
  }

  return { multiplier: best?.multiplier ?? 1, rule: best }
}

/** Highest tier the leg count qualifies for. Tiers don't stack. */
export function resolveBonusTier(tiers: BonusTier[], legCount: number): BonusTier | null {
  return tiers
    .filter(t => legCount >= t.min_legs)
    .reduce<BonusTier | null>((best, t) => (!best || t.min_legs > best.min_legs ? t : best), null)
}

/** Round to paise. Keeps 1.35 × 14 from surfacing as 18.900000000000002. */
function toPaise(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Pay for a single pickup or delivery leg.
 *
 * Rules, in order:
 *   1. Config inactive → nothing is owed under this scheme (the slab salary,
 *      if any, stands on its own).
 *   2. Every leg bills at least `minimum_billable_km`. At ₹14/km with a 1 km
 *      minimum, a 500 m leg pays ₹14.
 *   3. Above the minimum it is straight pro-rata, not rounded up to the next
 *      km — 1.5 km pays ₹21, not ₹28.
 *   4. `max_payout_per_leg`, when set, clips the result.
 *
 * A null/NaN/negative distance bills the minimum rather than zero: we know a
 * trip happened, we just can't measure it, and a measurement gap is not the
 * partner's fault. `distance_missing` is set so the caller can flag it.
 */
export function computeLegPayout(
  distanceKm: number | null | undefined,
  config: DeliveryPayoutConfig,
  opts: {
    /** Pickup legs earn the first-mile allowance; delivery legs don't. */
    legType?: 'pickup' | 'delivery'
    /** From resolveSurgeMultiplier. Defaults to 1 (no peak). */
    surgeMultiplier?: number
  } = {},
): LegPayout {
  const empty: LegPayout = {
    billable_km: 0, base_amount: 0,
    surge_multiplier: 1, surge_extra: 0, first_mile: 0, amount: 0,
    minimum_applied: false, capped: false, distance_missing: false,
  }
  if (!config.is_active) return empty

  const usable = distanceKm != null && Number.isFinite(distanceKm) && distanceKm >= 0
  const actual = usable ? distanceKm! : 0

  const minimum    = Math.max(0, config.minimum_billable_km)
  const billableKm = Math.max(actual, minimum)

  // The cap bounds the DISTANCE component only. Its job is to contain a bad
  // geocode, so capping the surge or the flat allowance too would penalise a
  // partner for peak hours or for a long first mile — neither of which is the
  // failure the cap exists to catch.
  const rawDistance = toPaise(billableKm * config.per_km_rate)
  const cap         = config.max_payout_per_leg
  const capped      = cap != null && rawDistance > cap
  const baseAmount  = capped ? toPaise(cap) : rawDistance

  const surgeMultiplier = Math.max(1, opts.surgeMultiplier ?? 1)
  const surgeExtra = toPaise(baseAmount * (surgeMultiplier - 1))

  const firstMile = opts.legType === 'pickup'
    ? toPaise(Math.max(0, config.first_mile_allowance || 0))
    : 0

  return {
    billable_km:      toPaise(billableKm),
    base_amount:      baseAmount,
    surge_multiplier: surgeMultiplier,
    surge_extra:      surgeExtra,
    first_mile:       firstMile,
    amount:           toPaise(baseAmount + surgeExtra + firstMile),
    minimum_applied:  billableKm > actual,
    capped,
    distance_missing: !usable,
  }
}

/** One completed leg, with everything needed to price it. */
export interface PricedLeg {
  leg_type:    'pickup' | 'delivery'
  distance_km: number | null
  /** 0 = Sunday … 6 = Saturday, in the config's surge timezone. */
  local_dow:   number
  /** 'HH:MM:SS' in the config's surge timezone. */
  local_time:  string
}

/** One partner's completed legs for a period. */
export interface PartnerLegDistances {
  legs: PricedLeg[]
  /** Logged failed pickup/delivery attempts in the period. */
  failed_attempts: number
}

export interface PartnerPayoutBreakdown {
  /** Base distance pay across all legs, before surge and allowances. */
  distance_pay: number
  /** Extra earned from peak multipliers. */
  surge_pay: number
  /** First-mile allowances across pickup legs. */
  first_mile_pay: number
  /** Compensation for logged failed attempts. */
  failed_trip_pay: number
  failed_trip_count: number
  /** Volume bonus earned, and the tier that awarded it. */
  volume_bonus: number
  volume_bonus_tier_id: number | null
  /** Total billable km behind distance_pay, already minimum-adjusted. */
  billable_km: number
  /** Legs that billed the minimum because no distance was recorded. */
  legs_missing_distance: number
  /** Legs clipped by max_payout_per_leg — a likely geocode problem. */
  legs_capped: number
  /** Slab salary for the period (pickup slab + delivery slab). */
  slab_total: number
  /** Added because the slab floor beat everything else. 0 when the floor is off. */
  slab_top_up: number
  floor_applied: boolean
  /** What is owed before claim deductions. */
  gross: number
}

/**
 * The whole payout for one partner for one period, before claim deductions.
 *
 * Shared by the admin and support calculate routes. Those two files are
 * otherwise near-duplicates by this codebase's convention, but duplicating
 * *this* would mean two implementations of what a partner gets paid, free to
 * drift — the one kind of duplication worth breaking the convention over.
 *
 * `config` may be null (no config row) or inactive, in which case distance pay
 * is skipped entirely and the slab salary stands alone. That is the behaviour
 * that existed before distance pay, so an unconfigured or disabled system
 * calculates exactly as it always did.
 */
export function computePartnerPayout(
  legs: PartnerLegDistances,
  slabTotal: number,
  config: DeliveryPayoutConfig | null,
  surgeRules: SurgeRule[] = [],
  bonusTiers: BonusTier[] = [],
): PartnerPayoutBreakdown {
  const zeroed = {
    distance_pay: 0, surge_pay: 0, first_mile_pay: 0,
    failed_trip_pay: 0, failed_trip_count: 0,
    volume_bonus: 0, volume_bonus_tier_id: null as number | null,
    billable_km: 0, legs_missing_distance: 0, legs_capped: 0,
    slab_total: toPaise(slabTotal),
  }

  if (!config || !config.is_active) {
    return { ...zeroed, slab_top_up: 0, floor_applied: false, gross: toPaise(slabTotal) }
  }

  let distancePay = 0
  let surgePay    = 0
  let firstMile   = 0
  let billableKm  = 0
  let missing     = 0
  let capped      = 0

  for (const leg of legs.legs) {
    const { multiplier } = resolveSurgeMultiplier(surgeRules, leg.local_dow, leg.local_time)
    const priced = computeLegPayout(leg.distance_km, config, {
      legType: leg.leg_type,
      surgeMultiplier: multiplier,
    })
    distancePay += priced.base_amount
    surgePay    += priced.surge_extra
    firstMile   += priced.first_mile
    billableKm  += priced.billable_km
    if (priced.distance_missing) missing++
    if (priced.capped)           capped++
  }

  distancePay = toPaise(distancePay)
  surgePay    = toPaise(surgePay)
  firstMile   = toPaise(firstMile)

  // Failed attempts are compensated even though no leg completed — the trip
  // was still made. Counted from order_pickup_failures, so a partner cannot
  // earn this without a logged reason attached to their own profile.
  const failedCount = legs.failed_attempts
  const failedPay   = toPaise(failedCount * Math.max(0, config.failed_trip_payout || 0))

  // Volume bonus on completed legs only. Failed attempts shouldn't count
  // toward a threshold that's meant to reward delivered work.
  const tier  = resolveBonusTier(bonusTiers, legs.legs.length)
  const bonus = tier ? toPaise(tier.bonus_amount) : 0

  const earned = toPaise(distancePay + surgePay + firstMile + failedPay + bonus)

  // The floor, when enabled, guarantees against everything earned — not just
  // distance — otherwise a partner could clear the slab on bonuses alone and
  // still be topped up.
  const floor = applySlabFloor(earned, slabTotal, config)

  return {
    distance_pay:          distancePay,
    surge_pay:             surgePay,
    first_mile_pay:        firstMile,
    failed_trip_pay:       failedPay,
    failed_trip_count:     failedCount,
    volume_bonus:          bonus,
    volume_bonus_tier_id:  tier?.id ?? null,
    billable_km:           toPaise(billableKm),
    legs_missing_distance: missing,
    legs_capped:           capped,
    slab_total:            toPaise(slabTotal),
    slab_top_up:           floor.top_up,
    floor_applied:         floor.floor_applied,
    gross:                 floor.gross,
  }
}

/**
 * Apply the monthly slab as a floor over summed distance pay.
 *
 * When enabled, a partner whose legs earned less than the slab amount for
 * their job counts is topped up to the slab — the slab becomes a guarantee
 * rather than the salary itself. When disabled, distance pay is the whole
 * figure and partner_salary_slabs is not consulted.
 *
 * Returned separately as `top_up` rather than folded into one number so the
 * payslip can show the partner why they were paid what they were paid.
 */
export function applySlabFloor(
  distancePayTotal: number,
  slabAmount: number,
  config: DeliveryPayoutConfig,
): { gross: number; top_up: number; floor_applied: boolean } {
  if (!config.slab_floor_enabled || slabAmount <= distancePayTotal) {
    return { gross: toPaise(distancePayTotal), top_up: 0, floor_applied: false }
  }
  return {
    gross:         toPaise(slabAmount),
    top_up:        toPaise(slabAmount - distancePayTotal),
    floor_applied: true,
  }
}
