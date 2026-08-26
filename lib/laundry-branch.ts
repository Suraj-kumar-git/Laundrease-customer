// lib/laundry-branch.ts
//
// Which branch is this laundry request about?
//
// THE PROBLEM THIS REPLACES
// Every laundry route resolved its provider the same way:
//
//   SELECT id FROM laundry_profiles WHERE user_id = $1
//
// That was correct while a login owned exactly one profile. The moment it owns
// two, the query returns whichever row Postgres reaches first — no ORDER BY,
// no tiebreak. A provider would see one branch's orders, another's prices and
// a third's payouts, changing between requests, with nothing in the response
// to say which. It would not error; it would just be wrong.
//
// So the resolver exists before any second profile can be created, and every
// one of those 35 routes goes through it.
//
// HOW THE ACTIVE BRANCH IS CHOSEN
// A cookie, set by the branch switcher. Cookies are client-controlled, so
// ownership is ALWAYS re-checked in SQL — `user_id = $1` is part of every
// lookup, which is what makes a forged cookie resolve to nothing and fall
// through to the caller's own primary branch rather than someone else's shop.
//
// A stale cookie (a branch since deleted, or one belonging to a login the user
// has switched away from) does the same thing. Falling back beats erroring:
// the failure mode of a hard error here is a provider locked out of their own
// dashboard by a cookie they cannot see or clear.
//
// SCOPE
// Everything resolves to ONE branch, deliberately including things that will
// later need to span an owner — consolidated payout statements above all.
// Keeping step 2 to a pure rescoping means it is verifiably a no-op for every
// provider that has one branch, which is all of them today. Promoting specific
// routes to owner scope is a later, smaller, reviewable change.

import { cookies } from 'next/headers'
import type { QueryResultRow } from 'pg'
import { queryOne } from '@/lib/db'

/** Name of the cookie the branch switcher writes. */
export const BRANCH_COOKIE = 'lp_branch'

/**
 * The active branch for this login.
 *
 * `columns` is the SELECT list, so a caller needing more than the id keeps its
 * existing shape — this is a drop-in for the raw queries it replaces rather
 * than a new fetch-everything helper.
 *
 * Returns null when the login has no laundry profile at all, which is the same
 * thing the old queries returned and what every caller already handles.
 */
export async function resolveBranch<T extends QueryResultRow = { id: number }>(
  userId: string | number,
  columns = 'id',
): Promise<T | null> {
  let requested: string | null = null
  try {
    const store = await cookies()
    requested = store.get(BRANCH_COOKIE)?.value ?? null
  } catch {
    // No cookie store in this context (a cron sweep, a background job).
    // Falling through to the primary branch is the right answer there.
  }

  if (requested && /^\d+$/.test(requested)) {
    // `user_id = $2` is the ownership check. A branch id the caller does not
    // own simply does not match, and we fall through below.
    const owned = await queryOne<T>(
      `SELECT ${columns} FROM laundry_profiles WHERE id = $1 AND user_id = $2`,
      [requested, userId]
    )
    if (owned) return owned
  }

  // No selection, or one that is not theirs: the primary branch.
  //
  // ORDER BY is what makes this deterministic. `parent_provider_id IS NULL`
  // first picks the owner row rather than a branch; `id` breaks any remaining
  // tie the same way on every request, which is precisely what the original
  // query failed to do.
  return queryOne<T>(
    `SELECT ${columns} FROM laundry_profiles
     WHERE user_id = $1
     ORDER BY (parent_provider_id IS NULL) DESC, id ASC
     LIMIT 1`,
    [userId]
  )
}

/**
 * Just the id — the shape 30 of the 35 call sites want.
 */
export async function resolveBranchId(userId: string | number): Promise<number | null> {
  const row = await resolveBranch<{ id: number }>(userId)
  return row?.id ?? null
}

/**
 * The PRIMARY branch, ignoring whatever is selected in the switcher.
 *
 * For owner-level questions that a branch selection must not change:
 * registration progress, verification state, dashboard access. A provider
 * looking at their Wakad branch has not un-completed their onboarding, and
 * pausing one shop is not the same as the account being unverified.
 */
export async function resolvePrimaryBranch<T extends QueryResultRow = { id: number }>(
  userId: string | number,
  columns = 'id',
): Promise<T | null> {
  return queryOne<T>(
    `SELECT ${columns} FROM laundry_profiles
     WHERE user_id = $1
     ORDER BY (parent_provider_id IS NULL) DESC, id ASC
     LIMIT 1`,
    [userId]
  )
}

/**
 * Every branch id in this login's owner group.
 *
 * For the questions that span a business rather than a shop — the consolidated
 * payout statement above all. Step 2 deliberately scoped everything to one
 * branch so the rescoping was a verifiable no-op; this is the narrow, explicit
 * exception, used only where the answer is genuinely about the owner.
 *
 * Returns [] when the login has no profile, which callers should treat as
 * "nothing to show" rather than "show everything" — an empty ANY() matches no
 * rows, which is the safe direction.
 */
export async function resolveOwnerBranchIds(userId: string | number): Promise<number[]> {
  const { query } = await import('@/lib/db')
  const res = await query<{ id: number }>(
    `SELECT id FROM laundry_profiles
     WHERE user_id = $1
     ORDER BY (parent_provider_id IS NULL) DESC, id ASC`,
    [userId]
  )
  return res.rows.map(r => Number(r.id))
}

export interface BranchSummary {
  id:            string
  public_id:     string
  business_name: string
  branch_name:   string | null
  city:          string | null
  status:        string
  is_verified:   boolean
  is_primary:    boolean
}

/**
 * Every branch this login owns, for the switcher.
 *
 * Ordered primary-first then by id, so the list reads the same way the
 * fallback above resolves — the top entry is always the default.
 */
export async function listBranches(userId: string | number): Promise<BranchSummary[]> {
  const { query } = await import('@/lib/db')
  const res = await query<BranchSummary & QueryResultRow>(
    `SELECT id::TEXT, public_id::TEXT, business_name, branch_name, city, status, is_verified,
            (parent_provider_id IS NULL) AS is_primary
     FROM laundry_profiles
     WHERE user_id = $1
     ORDER BY (parent_provider_id IS NULL) DESC, id ASC`,
    [userId]
  )
  return res.rows
}

/**
 * Confirm a branch belongs to this login. Used by the switcher before it sets
 * the cookie, so an invalid choice is refused up front instead of silently
 * resolving to something else later.
 */
export async function ownsBranch(userId: string | number, branchId: string | number): Promise<boolean> {
  const row = await queryOne<{ id: number }>(
    `SELECT id FROM laundry_profiles WHERE id = $1 AND user_id = $2`,
    [branchId, userId]
  )
  return !!row
}
