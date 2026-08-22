// lib/telephony/retention.ts
//
// Deleting call recordings once they've served their purpose.
//
// Recordings are personal data under the DPDP Act, kept for one reason: to
// settle a dispute about a garment. Once that reason expires they should not
// still exist, and "we never got round to deleting them" is not a defence.
//
// THE RULE, and the subtlety in it:
//
//   Delete when the claim window has passed AND no claim on that order is
//   still open — whichever is later.
//
// The second half matters. A customer can file on the last hour of the window
// and the dispute can then run for weeks. A strict "delete after N hours"
// sweep would destroy the evidence in the middle of the case it exists for.

import { query, queryOne } from '@/lib/db'
import { deleteCallRecording } from '@/lib/s3'

/** Claim states that are finished. Anything else counts as still open. */
const CLOSED_CLAIM_STATUSES = ['paid', 'rejected', 'provider_rejected']

export interface PurgeResult {
  deleted:  number
  failed:   number
  remaining: boolean
}

export async function purgeExpiredRecordings(
  limit = 100,
  shouldStop?: () => boolean
): Promise<PurgeResult> {
  // Read from the policy rather than hardcoding: changing the claim window in
  // admin moves retention with it, so the two can't drift apart.
  const policy = await queryOne<{ claim_window_hours: number }>(
    `SELECT claim_window_hours FROM item_protection_policy ORDER BY id LIMIT 1`
  )
  const windowHours = policy?.claim_window_hours ?? 72

  const { rows } = await query<{ id: string; recording_s3_key: string }>(`
    SELECT cs.id::TEXT, cs.recording_s3_key
    FROM order_call_sessions cs
    INNER JOIN orders o ON o.id = cs.order_id
    WHERE cs.recording_s3_key IS NOT NULL
      -- Anchored on delivery where there was one, otherwise on the call
      -- itself: a cancelled order never gets a delivered_at, and its calls
      -- would otherwise be kept for ever.
      AND COALESCE(o.delivered_at, cs.ended_at, cs.created_at)
          < NOW() - make_interval(hours => $1::INTEGER)
      AND NOT EXISTS (
        SELECT 1 FROM garment_claims gc
        WHERE gc.order_id = cs.order_id
          AND gc.status <> ALL($2::TEXT[])
      )
    ORDER BY cs.created_at ASC
    LIMIT $3
  `, [windowHours, CLOSED_CLAIM_STATUSES, limit])

  let deleted = 0
  let failed  = 0

  for (const row of rows) {
    if (shouldStop?.()) return { deleted, failed, remaining: true }

    try {
      await deleteCallRecording(row.recording_s3_key)
      // Cleared only after the object is actually gone. Clearing first would
      // orphan the file — still holding personal data, with nothing left in
      // the database pointing at it to try again.
      await query(
        `UPDATE order_call_sessions
         SET recording_s3_key = NULL, recording_fetched_at = NULL
         WHERE id = $1::BIGINT`,
        [row.id]
      )
      deleted++
    } catch (err) {
      failed++
      console.error(`[telephony/retention] could not delete recording for session ${row.id}:`, err)
    }
  }

  return { deleted, failed, remaining: rows.length === limit }
}
