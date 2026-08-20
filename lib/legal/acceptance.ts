// lib/legal/acceptance.ts
//
// Recording that someone accepted the terms and privacy policy, and refusing
// to proceed when they have not.
//
// The checkbox is the visible half; this is the half that matters. A checkbox
// validated only in the browser stops an honest user and nobody else — the
// registration endpoint is a plain POST, and anyone calling it directly skips
// the form entirely. So the server refuses without acceptance, and the same
// call that refuses is the one that writes the record.
//
// What gets stored is the DOCUMENT VERSION, not a boolean. When the terms are
// revised, the question is never "did they agree?" — it is "which version did
// they agree to", so that re-consent can be asked of exactly the people still
// on the old one.

import { query } from '@/lib/db'
import type { NextRequest } from 'next/server'

export type PolicyRole     = 'customer' | 'laundry' | 'delivery'
export type PolicyDocument = 'terms_of_service' | 'privacy_policy' | 'community_guidelines'

/**
 * The documents a partner accepts at registration.
 *
 * Community guidelines are deliberately NOT here. They are conduct rules the
 * Terms already bind you to, and padding the registration checkbox with a
 * third document makes it less likely anyone reads any of them.
 */
export const REGISTRATION_DOCUMENTS: PolicyDocument[] = ['terms_of_service', 'privacy_policy']

/**
 * Current version per role, read from the documents themselves so a version
 * bump in lib/legal/*-legal.ts is picked up here with no second edit.
 */
export async function currentPolicyVersion(role: PolicyRole): Promise<string> {
  if (role === 'laundry') {
    const { VERSION } = await import('@/lib/legal/laundry-legal')
    return VERSION
  }
  if (role === 'delivery') {
    const { VERSION } = await import('@/lib/legal/delivery-legal')
    return VERSION
  }
  // Customer terms are served from the DB and versioned there; until that
  // flow records acceptance too, this is the placeholder it would use.
  return '1.0'
}

/** Best-effort client fingerprint for the acceptance record. */
export function acceptanceContext(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers.get('x-forwarded-for')
  return {
    // x-forwarded-for is a comma-separated chain; the first entry is the client.
    ip:        fwd ? fwd.split(',')[0].trim() : (req.headers.get('x-real-ip') ?? null),
    userAgent: req.headers.get('user-agent'),
  }
}

/**
 * Write the acceptance rows for a registration.
 *
 * Idempotent: the unique index on (user_id, document, version) means a retried
 * or resumed registration step cannot stack duplicates, while accepting a NEW
 * version deliberately does add a row — that is the history.
 *
 * Never throws. A registration that has already created the user should not
 * fail because the audit insert did; the caller has already refused the
 * request if acceptance was missing, so by this point consent is established.
 */
export async function recordPolicyAcceptance(params: {
  userId:    string | number
  role:      PolicyRole
  documents?: PolicyDocument[]
  version:   string
  ip?:       string | null
  userAgent?: string | null
}): Promise<void> {
  const docs = params.documents ?? REGISTRATION_DOCUMENTS
  try {
    await query(`
      INSERT INTO user_policy_acceptances
        (user_id, role, document, version, ip_address, user_agent)
      SELECT $1::BIGINT, $2, doc, $3, $4, $5
      FROM UNNEST($6::TEXT[]) AS doc
      ON CONFLICT (user_id, document, version) DO NOTHING
    `, [
      params.userId, params.role, params.version,
      params.ip ?? null, params.userAgent ?? null,
      docs,
    ])
  } catch (err) {
    console.error('[policy-acceptance] failed to record:', (err as Error).message)
  }
}

/** Which documents and versions this user has accepted. */
export async function getPolicyAcceptances(userId: string | number) {
  const { rows } = await query<{
    document: PolicyDocument; version: string; accepted_at: string
  }>(`
    SELECT document, version, accepted_at::TEXT
    FROM user_policy_acceptances
    WHERE user_id = $1::BIGINT
    ORDER BY accepted_at DESC
  `, [userId])
  return rows
}
