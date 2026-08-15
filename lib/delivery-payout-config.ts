// lib/delivery-payout-config.ts
//
// Read/write handlers for the independent-partner payout configuration:
// the rate card, peak windows, and volume bonus tiers.
//
// Shared by the admin and support route sets. This codebase's convention is to
// port admin routes into support copies, and that's fine for read queries — but
// these mutate what partners get PAID. Two copies of the validation would mean
// two definitions of a legal rate, free to drift; the admin copy could reject a
// cap that the support copy accepts. Auth and permissions stay in the routes
// (they genuinely differ: requireRole('admin') vs a tab-access level); only the
// rules about what a valid configuration IS live here.

import { query, queryOne } from '@/lib/db'

export type ConfigResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string; status: number }

const fail = (error: string, status = 400): ConfigResult<never> => ({ ok: false, error, status })

// ─── Rate card ────────────────────────────────────────────────────────────────

const CONFIG_COLUMNS = `
  public_id AS id, is_active,
  per_km_rate::TEXT, minimum_billable_km::TEXT, max_payout_per_leg::TEXT,
  slab_floor_enabled,
  failed_trip_payout::TEXT, first_mile_allowance::TEXT,
  updated_at::TEXT
`

export interface PayoutConfigRow {
  id: string
  is_active: boolean
  per_km_rate: string
  minimum_billable_km: string
  max_payout_per_leg: string | null
  slab_floor_enabled: boolean
  failed_trip_payout: string
  first_mile_allowance: string
  updated_at: string
}

export interface PayoutConfigInput {
  is_active?: boolean
  per_km_rate?: number | string
  minimum_billable_km?: number | string
  max_payout_per_leg?: number | string | null
  slab_floor_enabled?: boolean
  failed_trip_payout?: number | string | null
  first_mile_allowance?: number | string | null
}

/** Optional non-negative money field. Blank/absent reads as 0. */
function parseMoney(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return 0
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function getPayoutConfig(): Promise<PayoutConfigRow | null> {
  return queryOne<PayoutConfigRow>(`
    SELECT ${CONFIG_COLUMNS}
    FROM delivery_partner_payout_config
    ORDER BY is_active DESC, id DESC
    LIMIT 1
  `)
}

export async function updatePayoutConfig(
  body: PayoutConfigInput,
  actorId: string,
): Promise<ConfigResult<PayoutConfigRow>> {
  const perKm = Number(body.per_km_rate)
  if (!Number.isFinite(perKm) || perKm < 0) {
    return fail('per_km_rate must be a number of 0 or more')
  }

  const minKm = Number(body.minimum_billable_km)
  if (!Number.isFinite(minKm) || minKm < 0) {
    return fail('minimum_billable_km must be a number of 0 or more')
  }

  // Empty string from a cleared input means "no cap", same as null.
  const maxRaw = body.max_payout_per_leg
  let maxPerLeg: number | null = null
  if (maxRaw !== null && maxRaw !== undefined && maxRaw !== '') {
    maxPerLeg = Number(maxRaw)
    if (!Number.isFinite(maxPerLeg) || maxPerLeg < 0) {
      return fail('max_payout_per_leg must be a number of 0 or more, or blank for no cap')
    }
    // A cap below the guaranteed minimum silently undoes the minimum on every
    // leg — almost certainly a typo, and one that quietly underpays every
    // partner until somebody notices.
    const minimumLegPay = minKm * perKm
    if (maxPerLeg < minimumLegPay) {
      return fail(
        `Cap of ₹${maxPerLeg} is below the ₹${minimumLegPay.toFixed(2)} minimum every leg earns ` +
        `(${minKm} km × ₹${perKm}/km). Raise the cap or lower the minimum.`
      )
    }
  }

  const failedTripPayout = parseMoney(body.failed_trip_payout)
  if (failedTripPayout === null) return fail('failed_trip_payout must be a number of 0 or more')

  const firstMileAllowance = parseMoney(body.first_mile_allowance)
  if (firstMileAllowance === null) return fail('first_mile_allowance must be a number of 0 or more')

  const updated = await queryOne<PayoutConfigRow>(`
    UPDATE delivery_partner_payout_config
    SET is_active            = COALESCE($1, is_active),
        per_km_rate          = $2,
        minimum_billable_km  = $3,
        max_payout_per_leg   = $4,
        slab_floor_enabled   = COALESCE($5, slab_floor_enabled),
        failed_trip_payout   = $7,
        first_mile_allowance = $8,
        updated_by           = $6,
        updated_at           = NOW()
    WHERE id = (SELECT id FROM delivery_partner_payout_config ORDER BY is_active DESC, id DESC LIMIT 1)
    RETURNING ${CONFIG_COLUMNS}
  `, [
    body.is_active ?? null,
    perKm, minKm, maxPerLeg,
    body.slab_floor_enabled ?? null,
    actorId,
    failedTripPayout, firstMileAllowance,
  ])

  if (!updated) return fail('No payout config row to update', 404)
  return { ok: true, data: updated }
}

// ─── Peak windows ─────────────────────────────────────────────────────────────

const SURGE_COLUMNS = `
  public_id AS id, label, day_of_week,
  start_time::TEXT, end_time::TEXT, multiplier::TEXT,
  is_active, created_at::TEXT, updated_at::TEXT
`

/** 'HH:MM' or 'HH:MM:SS' → 'HH:MM:SS', the zero-padded form lexical compare needs. */
export function normaliseTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw.trim())
  return m ? `${m[1]}:${m[2]}:${m[3] ?? '00'}` : null
}

function validMultiplier(raw: unknown): number | null {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null
}

function validDow(raw: unknown): boolean {
  return raw == null || (Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) <= 6)
}

export async function listSurgeRules() {
  const rules = await query<any>(`
    SELECT ${SURGE_COLUMNS}
    FROM delivery_payout_surge_rules
    ORDER BY is_active DESC, day_of_week NULLS FIRST, start_time ASC
  `)
  return rules.rows
}

export async function createSurgeRule(
  body: { label?: string; day_of_week?: number | null; start_time?: string; end_time?: string; multiplier?: number | string },
  actorId: string,
): Promise<ConfigResult<any>> {
  const label = body.label?.trim()
  if (!label) return fail('A label is required')

  const start = normaliseTime(body.start_time)
  const end   = normaliseTime(body.end_time)
  if (!start) return fail('start_time must be HH:MM')
  if (!end)   return fail('end_time must be HH:MM')

  // Equal start and end is a zero-length window under the non-wrapping read and
  // a 24-hour one under the wrapping read. Too ambiguous to guess.
  if (start === end) {
    return fail('start_time and end_time cannot be the same — use 00:00 to 23:59 for a whole day')
  }

  const multiplier = validMultiplier(body.multiplier)
  if (multiplier === null) return fail('multiplier must be between 1.00 and 5.00')
  if (!validDow(body.day_of_week)) {
    return fail('day_of_week must be 0 (Sunday) to 6 (Saturday), or omitted for every day')
  }

  const created = await queryOne<any>(`
    INSERT INTO delivery_payout_surge_rules
      (label, day_of_week, start_time, end_time, multiplier, created_by)
    VALUES ($1, $2, $3::TIME, $4::TIME, $5, $6)
    RETURNING ${SURGE_COLUMNS}
  `, [label, body.day_of_week ?? null, start, end, multiplier, actorId])

  return { ok: true, data: created }
}

export async function updateSurgeRule(
  publicId: string,
  body: { label?: string; day_of_week?: number | null; start_time?: string; end_time?: string; multiplier?: number | string; is_active?: boolean },
): Promise<ConfigResult<any>> {
  // Every field is optional — a bare {} is the "just toggle" case the list UI
  // uses, and COALESCE leaves anything unsent untouched.
  let start: string | null = null
  if (body.start_time !== undefined) {
    start = normaliseTime(body.start_time)
    if (!start) return fail('start_time must be HH:MM')
  }
  let end: string | null = null
  if (body.end_time !== undefined) {
    end = normaliseTime(body.end_time)
    if (!end) return fail('end_time must be HH:MM')
  }

  let multiplier: number | null = null
  if (body.multiplier !== undefined) {
    multiplier = validMultiplier(body.multiplier)
    if (multiplier === null) return fail('multiplier must be between 1.00 and 5.00')
  }

  if (body.day_of_week !== undefined && !validDow(body.day_of_week)) {
    return fail('day_of_week must be 0 (Sunday) to 6 (Saturday), or null for every day')
  }

  const updated = await queryOne<any>(`
    UPDATE delivery_payout_surge_rules
    SET label       = COALESCE($2, label),
        -- day_of_week is legitimately nullable ("every day"), so COALESCE
        -- won't do — an explicit null has to be able to clear it.
        day_of_week = CASE WHEN $3::BOOLEAN THEN $4::SMALLINT ELSE day_of_week END,
        start_time  = COALESCE($5::TIME, start_time),
        end_time    = COALESCE($6::TIME, end_time),
        multiplier  = COALESCE($7, multiplier),
        is_active   = COALESCE($8, is_active),
        updated_at  = NOW()
    WHERE public_id = $1
    RETURNING ${SURGE_COLUMNS}
  `, [
    publicId,
    body.label?.trim() || null,
    body.day_of_week !== undefined,
    body.day_of_week ?? null,
    start, end, multiplier,
    body.is_active ?? null,
  ])

  if (!updated) return fail('Surge window not found', 404)
  return { ok: true, data: updated }
}

export async function deleteSurgeRule(publicId: string): Promise<ConfigResult<null>> {
  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM delivery_payout_surge_rules WHERE public_id = $1 RETURNING public_id AS id`,
    [publicId]
  )
  if (!deleted) return fail('Surge window not found', 404)
  return { ok: true, data: null }
}

// ─── Volume bonus tiers ───────────────────────────────────────────────────────

const BONUS_COLUMNS = `
  public_id AS id, min_legs, bonus_amount::TEXT,
  is_active, created_at::TEXT, updated_at::TEXT
`

export async function listBonusTiers() {
  const tiers = await query<any>(`
    SELECT ${BONUS_COLUMNS} FROM delivery_payout_bonus_tiers ORDER BY min_legs ASC
  `)
  return tiers.rows
}

export async function createBonusTier(
  body: { min_legs?: number | string; bonus_amount?: number | string },
  actorId: string,
): Promise<ConfigResult<any>> {
  const minLegs = Number(body.min_legs)
  if (!Number.isInteger(minLegs) || minLegs < 1) {
    return fail('min_legs must be a whole number of 1 or more')
  }

  const amount = Number(body.bonus_amount)
  if (!Number.isFinite(amount) || amount < 0) {
    return fail('bonus_amount must be a number of 0 or more')
  }

  // A partial unique index enforces one ACTIVE tier per threshold. Catching it
  // here gives a usable message instead of a 500 from the constraint.
  const clash = await queryOne<{ id: string }>(
    `SELECT public_id AS id FROM delivery_payout_bonus_tiers WHERE min_legs = $1 AND is_active`,
    [minLegs]
  )
  if (clash) return fail(`An active tier at ${minLegs} legs already exists — edit that one instead`)

  const created = await queryOne<any>(`
    INSERT INTO delivery_payout_bonus_tiers (min_legs, bonus_amount, created_by)
    VALUES ($1, $2, $3)
    RETURNING ${BONUS_COLUMNS}
  `, [minLegs, amount, actorId])

  return { ok: true, data: created }
}

export async function updateBonusTier(
  publicId: string,
  body: { min_legs?: number | string; bonus_amount?: number | string; is_active?: boolean },
): Promise<ConfigResult<any>> {
  let minLegs: number | null = null
  if (body.min_legs !== undefined) {
    minLegs = Number(body.min_legs)
    if (!Number.isInteger(minLegs) || minLegs < 1) {
      return fail('min_legs must be a whole number of 1 or more')
    }
  }

  let amount: number | null = null
  if (body.bonus_amount !== undefined) {
    amount = Number(body.bonus_amount)
    if (!Number.isFinite(amount) || amount < 0) {
      return fail('bonus_amount must be a number of 0 or more')
    }
  }

  // Reactivating, or re-thresholding onto an existing active tier, would trip
  // the partial unique index. Report it as a conflict rather than a 500.
  if (minLegs != null || body.is_active === true) {
    const clash = await queryOne<{ min_legs: number }>(`
      SELECT min_legs FROM delivery_payout_bonus_tiers
      WHERE is_active
        AND public_id <> $1
        AND min_legs = COALESCE($2, (SELECT min_legs FROM delivery_payout_bonus_tiers WHERE public_id = $1))
    `, [publicId, minLegs])
    if (clash) return fail(`An active tier at ${clash.min_legs} legs already exists`)
  }

  const updated = await queryOne<any>(`
    UPDATE delivery_payout_bonus_tiers
    SET min_legs     = COALESCE($2, min_legs),
        bonus_amount = COALESCE($3, bonus_amount),
        is_active    = COALESCE($4, is_active),
        updated_at   = NOW()
    WHERE public_id = $1
    RETURNING ${BONUS_COLUMNS}
  `, [publicId, minLegs, amount, body.is_active ?? null])

  if (!updated) return fail('Bonus tier not found', 404)
  return { ok: true, data: updated }
}

export async function deleteBonusTier(publicId: string): Promise<ConfigResult<null>> {
  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM delivery_payout_bonus_tiers WHERE public_id = $1 RETURNING public_id AS id`,
    [publicId]
  )
  if (!deleted) return fail('Bonus tier not found', 404)
  return { ok: true, data: null }
}
