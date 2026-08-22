// lib/telephony/recording.ts
//
// Moving a call recording from the provider's storage into ours.
//
// Kept separate from the webhook because it has to be runnable twice: once
// optimistically when the call ends, and again later for the ones that weren't
// ready yet. Providers do not finish encoding the moment a call hangs up, so a
// share of first attempts will legitimately 404 — that is expected, not an
// error to alarm about.

import { query, queryOne } from '@/lib/db'
import { buildCallRecordingKey, uploadCallRecording } from '@/lib/s3'
import { resolveTelephony } from './index'

export type CaptureOutcome =
  | 'stored'        // now in our bucket
  | 'already'       // captured on an earlier attempt
  | 'not_ready'     // provider hasn't finished encoding — try later
  | 'no_recording'  // this call was never recorded
  | 'unavailable'   // telephony not configured

/**
 * Fetch and store the recording for one call session.
 *
 * `recordingUrl` comes from the status webhook when it has one. Without it we
 * ask the provider, which is the path a later retry takes — that is why the
 * provider's URL is never persisted: it can always be re-derived from the call
 * SID, and storing a third-party URL that expires just creates stale rows.
 */
export async function captureCallRecording(
  sessionId: string,
  recordingUrl?: string | null
): Promise<CaptureOutcome> {
  const session = await queryOne<{
    order_id: string
    provider_call_sid: string | null
    recording_s3_key: string | null
  }>(`
    SELECT order_id::TEXT, provider_call_sid, recording_s3_key
    FROM order_call_sessions WHERE id = $1::BIGINT
  `, [sessionId])

  if (!session) return 'no_recording'
  if (session.recording_s3_key) return 'already'
  if (!session.provider_call_sid) return 'no_recording'

  const telephony = await resolveTelephony().catch(() => null)
  if (!telephony) return 'unavailable'

  let url = recordingUrl ?? null
  if (!url) {
    const details = await telephony.provider
      .getCall(session.provider_call_sid)
      .catch(() => null)
    url = details?.recordingUrl ?? null
  }
  if (!url) return 'not_ready'

  try {
    const { buffer, contentType } = await telephony.provider.fetchRecording(url)
    const key = buildCallRecordingKey(session.order_id, sessionId)

    await uploadCallRecording(key, buffer, contentType, {
      orderId: session.order_id, sessionId,
    })

    await queryOne(`
      UPDATE order_call_sessions
      SET recording_s3_key = $2, recording_fetched_at = NOW()
      WHERE id = $1::BIGINT
    `, [sessionId, key])

    return 'stored'
  } catch (err) {
    // Encoding lag is the common case here, not a fault. Left uncaptured so a
    // later pass picks it up; the call row is unchanged and still eligible.
    console.warn(`[telephony] recording not captured for session ${sessionId}:`,
      err instanceof Error ? err.message : err)
    return 'not_ready'
  }
}

/**
 * Sessions whose recording was never captured — the queue a retry pass works
 * through. Bounded so one bad night can't turn into an unbounded job.
 */
export async function findUncapturedRecordings(limit = 50): Promise<string[]> {
  const { rows } = await query<{ id: string }>(`
    SELECT id::TEXT
    FROM order_call_sessions
    WHERE recording_s3_key IS NULL
      AND provider_call_sid IS NOT NULL
      AND call_status = 'completed'
      -- Give the provider time to finish encoding before chasing it.
      AND ended_at < NOW() - INTERVAL '5 minutes'
      AND ended_at > NOW() - INTERVAL '2 days'
    ORDER BY ended_at ASC
    LIMIT $1
  `, [limit])

  return rows.map(r => r.id)
}
