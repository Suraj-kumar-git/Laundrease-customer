// lib/partner-completion-token.ts
//
// Extending or reissuing the registration-completion link for a partner who
// ran out of time.
//
// A laundry or delivery partner verifies their phone and email, gets a link to
// finish registration later, and that link expires. If they miss the window
// they contact us, and an admin — or a support member granted write on the
// Users tab — extends it or issues a new one.
//
// Shared between /api/admin/users/[id] and /api/support/users/[id] so the two
// cannot drift on what is allowed, what is audited, or when an email goes out.
//
// The bug this replaces
// --------------------
// Both actions 500'd. The UPDATE reused one parameter in two incompatible
// positions:
//
//   SET expires_at = NOW() + ($1 || ' hours')::INTERVAL,
//       validity_hours = $1          -- integer column
//
// $1 has to be text for the concatenation and integer for the column. Postgres
// resolves a parameter's type once per statement, cannot satisfy both, and
// errors out. The expiry is computed in JS here instead, so every parameter
// has exactly one type — the same shape the working delivery-specific route
// (app/api/admin/delivery/[id]/extend-token) already used.

import crypto from 'crypto'
import { queryOne, transaction } from '@/lib/db'
import {
  sendProviderCompletionLinkEmail,
  sendDeliveryCompletionLinkEmail,
} from '@/lib/notifications/email'

export type TokenActionResult =
  | { ok: true;  message: string; expiresAt: string; emailed?: boolean }
  | { ok: false; status: number; message: string }

interface PartnerRow {
  id:                string
  role:              string
  email:             string | null
  full_name:         string
  profile_completed: boolean
  has_token:         boolean
  business_name:     string | null
}

/** The partner behind a users.public_id, with everything both actions need. */
async function loadPartner(userPublicId: string): Promise<PartnerRow | null> {
  return queryOne<PartnerRow>(`
    SELECT
      u.id::TEXT,
      r.name AS role,
      u.email,
      u.full_name,
      COALESCE(u.profile_completed, FALSE)              AS profile_completed,
      (u.profile_completion_token IS NOT NULL)          AS has_token,
      lp.business_name
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    LEFT JOIN laundry_profiles lp ON lp.user_id = u.id
    WHERE u.public_id = $1 AND u.deleted_at IS NULL
  `, [userPublicId])
}

/**
 * Shared preconditions.
 *
 * Both actions are meaningless outside a partner mid-registration, and the
 * completed case matters most: the UI already hides the buttons once a profile
 * is complete, but the endpoint is a plain PATCH and a hidden button is not a
 * guard. Reissuing a link to a finished registration would hand out a valid
 * onboarding URL for an account that no longer needs one.
 */
function checkEligible(p: PartnerRow | null): { ok: false; status: number; message: string } | null {
  if (!p) return { ok: false, status: 404, message: 'User not found' }
  if (p.role !== 'laundry' && p.role !== 'delivery')
    return { ok: false, status: 400, message: 'Only laundry and delivery partners have a completion link' }
  if (p.profile_completed)
    return { ok: false, status: 400, message: 'Registration is already complete — there is no link to issue' }
  return null
}

/** The partner-facing onboarding URL, which differs by role AND by deployment. */
function completionLink(role: string, token: string): string {
  const base = role === 'laundry'
    ? (process.env.NEXT_PUBLIC_LAUNDRY_URL  || 'http://localhost:3002')
    : (process.env.NEXT_PUBLIC_DELIVERY_URL || 'http://localhost:3001')
  return `${base}/${role}/onboarding/${token}`
}

/**
 * Give the existing link more time.
 *
 * No email: the link itself does not change, so the message the partner
 * already has in their inbox starts working again. Sending a second copy of
 * the same URL would only add confusion about which one is current.
 */
export async function extendCompletionToken(params: {
  userPublicId: string
  hours:        number
  actorId:      string | number
  reason?:      string | null
}): Promise<TokenActionResult> {
  const { userPublicId, hours, actorId } = params

  if (!Number.isFinite(hours) || hours < 1 || hours > 720)
    return { ok: false, status: 400, message: 'Hours must be between 1 and 720' }

  const partner = await loadPartner(userPublicId)
  const bad = checkEligible(partner)
  if (bad) return bad

  // Extending a token that was never issued would set an expiry on NULL,
  // producing a date that looks valid next to a link that does not exist.
  if (!partner!.has_token)
    return { ok: false, status: 400, message: 'This partner has no completion link yet — regenerate one instead' }

  const expiresAt = new Date(Date.now() + hours * 3600 * 1000)

  await transaction(async (client) => {
    await client.query(`
      UPDATE users
      SET profile_completion_token_expires_at     = $1,
          profile_completion_token_validity_hours = $2,
          updated_at                              = NOW()
      WHERE id = $3
    `, [expiresAt, hours, partner!.id])

    await client.query(`
      INSERT INTO user_approval_history (user_id, action, performed_by, reason, metadata)
      VALUES ($1, 'token_extended', $2, $3, $4)
    `, [
      partner!.id, actorId, params.reason ?? null,
      JSON.stringify({ hours_extended: hours, new_expiry: expiresAt.toISOString() }),
    ])
  })

  return {
    ok: true,
    message: `Completion link extended by ${hours} hours`,
    expiresAt: expiresAt.toISOString(),
    emailed: false,
  }
}

/**
 * Issue a fresh link and email it to the partner.
 *
 * The old token is replaced, so the partner's existing email now points at a
 * dead URL — emailing the new one is not a nicety here, it is the only way
 * they receive something that works.
 */
export async function regenerateCompletionToken(params: {
  userPublicId: string
  hours:        number
  actorId:      string | number
  reason?:      string | null
}): Promise<TokenActionResult> {
  const { userPublicId, hours, actorId } = params

  if (!Number.isFinite(hours) || hours < 1 || hours > 720)
    return { ok: false, status: 400, message: 'Hours must be between 1 and 720' }

  const partner = await loadPartner(userPublicId)
  const bad = checkEligible(partner)
  if (bad) return bad

  const token     = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000)

  await transaction(async (client) => {
    await client.query(`
      UPDATE users
      SET profile_completion_token              = $1,
          profile_completion_token_generated_at = NOW(),
          profile_completion_token_expires_at   = $2,
          profile_completion_token_used_at      = NULL,
          profile_completion_token_validity_hours = $3,
          updated_at                            = NOW()
      WHERE id = $4
    `, [token, expiresAt, hours, partner!.id])

    await client.query(`
      INSERT INTO user_approval_history (user_id, action, performed_by, reason, metadata)
      VALUES ($1, 'token_regenerated', $2, $3, $4)
    `, [
      partner!.id, actorId, params.reason ?? null,
      JSON.stringify({ new_expiry_hours: hours, new_expiry: expiresAt.toISOString() }),
    ])
  })

  // Best-effort, after commit. The token is already valid; failing to send
  // must not roll that back — the operator can regenerate again, and the
  // failure is logged. Reported honestly in `emailed` either way.
  let emailed = false
  if (partner!.email) {
    const link = completionLink(partner!.role, token)
    const name = partner!.role === 'laundry'
      ? (partner!.business_name || partner!.full_name)
      : partner!.full_name
    try {
      if (partner!.role === 'laundry') {
        await sendProviderCompletionLinkEmail(partner!.email, name, link)
      } else {
        await sendDeliveryCompletionLinkEmail(partner!.email, name, link)
      }
      emailed = true
    } catch (err) {
      console.error('[partner-completion-token] link email failed:', (err as Error).message)
    }
  }

  return {
    ok: true,
    message: emailed
      ? 'New completion link generated and emailed to the partner'
      : 'New completion link generated, but the email could not be sent',
    expiresAt: expiresAt.toISOString(),
    emailed,
  }
}
