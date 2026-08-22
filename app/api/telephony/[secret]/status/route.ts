// app/api/telephony/[secret]/status/route.ts
//
// POST — the provider tells us how a call went.
//
// AUTHENTICATION, AND WHY IT LOOKS LIKE THIS
//
// Exotel does not sign its webhooks. There is no HMAC header to verify, so the
// usual "recompute the signature" approach isn't available and this endpoint
// is reachable by anyone who learns the URL. Three things stand in for a
// signature:
//
//   1. A secret path segment, compared in constant time. Without it, anyone
//      who guessed /api/telephony/*/status could write call records — marking
//      calls answered that never happened, which is exactly the evidence a
//      failed-pickup dispute turns on.
//   2. An optional IP allowlist, for when the provider publishes its egress
//      ranges. Defence in depth: the secret can leak into a log or a support
//      ticket, an IP range cannot be copy-pasted out of one.
//   3. The payload itself decides nothing. It can only update a row whose call
//      SID we already issued, and only fields the provider owns. A forged
//      body cannot create a session, change who was called, or touch an order.
//
// Unrecognised requests get 200 with an empty body — never 401 or 404. A
// scanner learns nothing about whether it found a real endpoint, and a
// genuine provider retrying a stale event stops rather than backing off for
// hours against something we were always going to ignore.

import { NextRequest, NextResponse } from 'next/server'
import { webhookSecretMatches, webhookIpAllowed } from '@/lib/telephony/webhook-auth'
import { resolveTelephony } from '@/lib/telephony'
import { applyCallStatusEvent } from '@/lib/telephony/session'
import { captureCallRecording } from '@/lib/telephony/recording'
import { isTerminalCallStatus } from '@/lib/telephony/types'

/** Deliberately uniform: acknowledge everything, reveal nothing. */
const ACK = () => new NextResponse(null, { status: 200 })

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params
  if (!webhookSecretMatches(secret)) {
    console.warn('[telephony/webhook] rejected: bad secret')
    return ACK()
  }

  if (!webhookIpAllowed(req)) {
    console.warn('[telephony/webhook] rejected: IP not in allowlist')
    return ACK()
  }

  try {
    const payload = await readBody(req)
    if (!payload) return ACK()

    const telephony = await resolveTelephony().catch(() => null)
    if (!telephony) {
      // Masking switched off mid-flight; calls already placed still report back.
      console.warn('[telephony/webhook] event arrived while telephony is inactive')
      return ACK()
    }

    const event = telephony.provider.parseStatusCallback(payload)
    if (!event) return ACK()

    // Matched on the call SID, which is UNIQUE — a retried delivery of the
    // same event updates the same row instead of duplicating it.
    const sessionId = await applyCallStatusEvent(event)
    if (!sessionId) {
      console.warn('[telephony/webhook] no session for call sid', event.providerCallSid)
      return ACK()
    }

    // Optimistic capture. Most first attempts on a just-ended call will find
    // the provider still encoding — findUncapturedRecordings() sweeps those up
    // later, so a miss here is normal and not worth failing the webhook over.
    if (isTerminalCallStatus(event.status) && telephony.config.record_calls) {
      captureCallRecording(sessionId, event.recordingUrl).catch(err =>
        console.warn('[telephony/webhook] recording capture failed:', err)
      )
    }

    return ACK()
  } catch (err) {
    // Still 200. A 5xx makes the provider retry an event we cannot process,
    // and the retries would arrive just as unprocessable.
    console.error('[telephony/webhook] handler error:', err)
    return ACK()
  }
}

// ── Body ────────────────────────────────────────────────────────────────────

/** Accepts JSON or form-encoded — providers switch between them. */
async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') ?? ''
  try {
    if (contentType.includes('application/json')) {
      return await req.json()
    }
    const form = await req.formData()
    const out: Record<string, unknown> = {}
    form.forEach((value, key) => { out[key] = typeof value === 'string' ? value : null })
    return out
  } catch {
    return null
  }
}
