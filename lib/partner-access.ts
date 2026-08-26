// lib/partner-access.ts
//
// Whether a laundry or delivery partner may enter their dashboard.
//
// Holding a valid JWT is NOT the same as being onboarded. Both registration
// flows issue a session part-way through — laundry at step 1/2, because the
// per-file document uploads in steps 3–4 authenticate via requireRole and need
// a cookie; delivery at OTP verification, for the same reason. That cookie is
// a real, role-stamped laundry/delivery session.
//
// Nothing then checked how far the registration had actually got. The laundry
// register route even carried a comment asserting that "requireRole only checks
// the JWT role claim, not registration_stage, so an incomplete profile still
// can't reach the real dashboard" — the premise was right and the conclusion
// was wrong: no other layer was checking either. A partner who abandoned
// registration at step 2 could return to the public landing page, click
// "Continue to Dashboard", and get in.
//
// Two conditions have to hold, and they are deliberately separate:
//
//   users.profile_completed        the partner finished every step themselves.
//                                  Set by laundry register step 5 and by
//                                  delivery's complete-profile route, so it is
//                                  the one completion signal both flows share.
//   <profile>.status = 'active'    an admin has since verified and activated
//                                  them. Registration being finished is a
//                                  request to be let in, not the decision.
//
// This runs server-side in each dashboard layout, so it covers every page
// beneath it in one place and cannot be bypassed by navigating directly.

import { queryOne } from '@/lib/db'

export type PartnerGateReason =
  | 'no_profile'
  | 'incomplete'
  | 'pending_verification'
  | 'suspended'

export type PartnerGate =
  | { allowed: true }
  | { allowed: false; redirectTo: string; reason: PartnerGateReason }

interface GateRow {
  profile_completed: boolean | null
  profile_status:    string | null
}

/**
 * Shared decision for both personas — the two tables differ only in name, and
 * letting them diverge is how one persona quietly loses the gate later.
 *
 * `selfPausedStatuses` is the one thing that legitimately differs. It names
 * statuses that mean "this partner switched themselves off", which is a
 * business-visibility choice, NOT a verification state — so it must not send
 * them to the onboarding status page.
 *
 * Laundry passes 'inactive'; delivery deliberately passes nothing. The same
 * word means opposite things in the two tables:
 *
 *   laundry_profiles.status  = 'inactive'  only ever written by the provider's
 *                                          own Pause business toggle. Admin
 *                                          and support write 'active' or
 *                                          'suspended', never this.
 *   delivery_profiles.status = 'inactive'  written by admin deactivation, by
 *                                          admin REJECTION alongside
 *                                          registration_stage='rejected', and
 *                                          by a third-party aggregator's
 *                                          deactivate webhook.
 *
 * Treating them alike would let a rejected delivery partner into the
 * dashboard, which is why this is a parameter and not a shared constant.
 */
function decide(
  row: GateRow | null,
  statusPath: string,
  loginPath: string,
  selfPausedStatuses: readonly string[] = [],
): PartnerGate {
  // No profile row at all: nothing to gate, and the dashboard would crash on
  // the first profile-scoped query anyway.
  if (!row) return { allowed: false, redirectTo: loginPath, reason: 'no_profile' }

  if (!row.profile_completed) {
    return { allowed: false, redirectTo: statusPath, reason: 'incomplete' }
  }

  if (row.profile_status === 'suspended') {
    return { allowed: false, redirectTo: statusPath, reason: 'suspended' }
  }

  // Paused by the partner themselves. They are verified and onboarded; they
  // have simply stopped taking new work, and they need the dashboard MORE than
  // usual here — the switch to turn themselves back on lives inside it.
  //
  // This was the bug: pausing set status='inactive', the check below read that
  // as "not yet approved", and the provider was redirected to the onboarding
  // status page. From there the only way back was the very settings screen
  // they could no longer reach, so pausing was a one-way door.
  if (selfPausedStatuses.includes(row.profile_status ?? '')) {
    return { allowed: true }
  }

  if (row.profile_status !== 'active') {
    // Finished every step, waiting on an admin. The status page is the honest
    // destination: it shows where the review has got to rather than an empty
    // dashboard that looks broken.
    return { allowed: false, redirectTo: statusPath, reason: 'pending_verification' }
  }

  return { allowed: true }
}

export async function checkLaundryDashboardAccess(userId: string | number): Promise<PartnerGate> {
  // ORDER BY ... LIMIT 1 is load-bearing now that a login can own several
  // laundry_profiles rows (branches). Without it this LEFT JOIN returns one row
  // per branch and queryOne takes an arbitrary one — so a provider with an
  // active Wakad branch and a suspended Pimpri branch would be let in or thrown
  // out depending on row order, differing between requests.
  //
  // The PRIMARY branch is the right one to gate on: verification and
  // onboarding belong to the account, and branches inherit them. Pausing or
  // suspending one shop must not decide whether the login reaches the
  // dashboard at all.
  const row = await queryOne<GateRow>(`
    SELECT u.profile_completed, lp.status AS profile_status
    FROM users u
    LEFT JOIN laundry_profiles lp ON lp.user_id = u.id
    WHERE u.id = $1::BIGINT AND u.deleted_at IS NULL
    ORDER BY (lp.parent_provider_id IS NULL) DESC, lp.id ASC
    LIMIT 1
  `, [userId])

  // A user row with no laundry profile is as good as no profile.
  if (!row || row.profile_status === null) {
    return { allowed: false, redirectTo: '/laundry/auth/login', reason: 'no_profile' }
  }
  // 'inactive' = the provider paused their own business. See decide().
  return decide(row, '/laundry/onboarding/status', '/laundry/auth/login', ['inactive'])
}

export async function checkDeliveryDashboardAccess(userId: string | number): Promise<PartnerGate> {
  const row = await queryOne<GateRow>(`
    SELECT u.profile_completed, dp.status AS profile_status
    FROM users u
    LEFT JOIN delivery_profiles dp ON dp.user_id = u.id
    WHERE u.id = $1::BIGINT AND u.deleted_at IS NULL
  `, [userId])

  if (!row || row.profile_status === null) {
    return { allowed: false, redirectTo: '/delivery/auth/login', reason: 'no_profile' }
  }
  // No self-paused status for delivery: 'inactive' there means deactivated or
  // rejected, not paused. A partner going off-shift uses is_online /
  // shift_status, which never touches this column.
  return decide(row, '/delivery/onboarding/status', '/delivery/auth/login')
}
