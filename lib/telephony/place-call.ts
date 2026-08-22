// lib/telephony/place-call.ts
//
// One masked call, from request to ringing phone. The three role routes
// (customer, delivery, laundry) differ only in how they establish who is
// asking — everything after that is identical, and lives here.

import { queryOne } from '@/lib/db'
import { resolveTelephony } from './index'
import { toE164India } from './phone'
import { TelephonyError, type CallRole } from './types'
import {
  authorizeCall, createCallSession, attachProviderCallSid, markCallFailed,
} from './session'

/**
 * Minimum gap between two calls by the same person on the same order.
 *
 * Primarily a double-tap guard. A partner on a patchy connection taps the
 * button twice, and without this both taps place a real, billable call and
 * the customer's phone rings twice over.
 */
const COOLDOWN_SECONDS = 15

/**
 * Ceiling on calls per order per day. Not a usage policy — a blast radius.
 * Nobody legitimately calls about one laundry order twenty times in a day, so
 * hitting this means a stuck retry loop or someone probing, and either way it
 * should stop before it becomes a bill.
 */
const MAX_CALLS_PER_ORDER_PER_DAY = 20

export type PlaceCallResult =
  | { ok: true;  sessionId: string; counterpartyLabel: string }
  | { ok: false; status: number; message: string }

/** Where the provider posts call outcomes. */
export function statusCallbackUrl(): string {
  const base   = process.env.TELEPHONY_WEBHOOK_BASE_URL
              || process.env.NEXT_PUBLIC_CUSTOMER_URL
  const secret = process.env.TELEPHONY_WEBHOOK_SECRET

  if (!base || !secret) {
    throw new TelephonyError(
      'not_configured',
      'Set TELEPHONY_WEBHOOK_BASE_URL and TELEPHONY_WEBHOOK_SECRET before enabling masked calling'
    )
  }
  // The secret sits in the path because the provider does not sign its
  // webhooks — see the webhook route for the rest of that story.
  return `${base.replace(/\/+$/, '')}/api/telephony/${secret}/status`
}

export async function placeMaskedCall(params: {
  role:          CallRole
  userId:        string
  orderPublicId: string
  target?:       'delivery' | 'laundry'
}): Promise<PlaceCallResult> {
  // Config first: if masking is off there is nothing to authorize, and a user
  // shouldn't get "this line has closed" when the real answer is "the feature
  // is switched off".
  let telephony
  try {
    telephony = await resolveTelephony()
  } catch (err) {
    if (err instanceof TelephonyError) {
      console.error('[telephony] misconfigured:', err.message)
      return { ok: false, status: 503, message: err.userMessage }
    }
    throw err
  }
  if (!telephony) {
    return { ok: false, status: 503, message: 'Calling is unavailable right now' }
  }

  const auth = await authorizeCall(params)
  if (!auth.ok) {
    const status = auth.code === 'not_found' ? 404 : auth.code === 'closed' ? 409 : 400
    return { ok: false, status, message: auth.reason }
  }
  const ctx = auth.context

  const throttled = await checkThrottle(ctx.orderId, params.userId)
  if (throttled) return throttled

  // The provider wants E.164; the app stores ten digits. Converted here rather
  // than at the adapter so an unusable number is caught before a session row
  // and a provider round trip are spent on it.
  const fromE164 = toE164India(ctx.initiatorPhone)
  const toE164   = toE164India(ctx.counterpartyPhone)
  if (!fromE164 || !toE164) {
    return { ok: false, status: 400, message: 'A number on this order cannot be dialled' }
  }

  const sessionId = await createCallSession(ctx)

  try {
    const result = await telephony.provider.bridge({
      from:               fromE164,
      to:                 toE164,
      callerId:           telephony.exophone,
      record:             telephony.config.record_calls,
      timeLimitSeconds:   telephony.config.call_time_limit_seconds,
      ringTimeoutSeconds: telephony.config.ring_timeout_seconds,
      announcementUrl:    telephony.config.announcement_url,
      // Enough to find the order from a webhook, and nothing more — this
      // string is handed to a third party and echoed back in the clear.
      correlationId:      `${ctx.orderPublicId}:${ctx.pairType}`,
      statusCallbackUrl:  statusCallbackUrl(),
    })

    await attachProviderCallSid(sessionId, result.providerCallSid)
    return { ok: true, sessionId, counterpartyLabel: ctx.counterpartyLabel }
  } catch (err) {
    // The row stays, marked failed. A call that could not be placed is itself
    // a fact worth keeping — it is what backs up "I tried to reach them".
    await markCallFailed(sessionId).catch(() => {})

    if (err instanceof TelephonyError) {
      console.error(`[telephony] bridge failed (${err.code}):`, err.message)
      const status =
        err.code === 'rate_limited'    ? 429 :
        err.code === 'invalid_request' ? 400 :
        err.code === 'provider_error'  ? 502 : 503
      return { ok: false, status, message: err.userMessage }
    }
    throw err
  }
}

async function checkThrottle(
  orderId: string, userId: string
): Promise<PlaceCallResult | null> {
  const row = await queryOne<{ recent: string; today: string }>(`
    SELECT
      COUNT(*) FILTER (
        WHERE initiator_user_id = $2::BIGINT
          AND created_at > NOW() - make_interval(secs => $3::INTEGER)
      ) AS recent,
      COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day') AS today
    FROM order_call_sessions
    WHERE order_id = $1::BIGINT
  `, [orderId, userId, COOLDOWN_SECONDS])

  if (parseInt(row?.recent ?? '0', 10) > 0) {
    return { ok: false, status: 429, message: 'Give it a moment before calling again' }
  }
  if (parseInt(row?.today ?? '0', 10) >= MAX_CALLS_PER_ORDER_PER_DAY) {
    return {
      ok: false,
      status: 429,
      message: 'Too many calls on this order today — please contact support',
    }
  }
  return null
}
