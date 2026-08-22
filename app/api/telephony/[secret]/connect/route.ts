// app/api/telephony/[secret]/connect/route.ts
//
// GET — someone dialled the platform's virtual number. Decide who to connect
// them to.
//
// This is Exotel's Connect applet in dynamic-URL mode ("Programmable Connect"):
// the applet calls this endpoint mid-call and dials whatever numbers come back.
// Not the Passthru applet, which can only signal a binary branch via 200/302
// and so cannot express "ring this particular person".
//
// FLOW BUILDER SETUP THIS EXPECTS
//   ExoPhone → Flow → Connect applet, Dial Whom = "Fetch from URL", pointed at
//   this route. Put a Voicemail applet after the Connect applet: when this
//   endpoint returns a non-200 (nobody to route to, out of hours), the flow
//   falls through to it, and that is the voicemail-into-a-ticket path.
//
// WHY THIS EXISTS AT ALL
//   People redial. The customer misses the partner's call, sees the platform
//   number in their log and rings it back. Without this they reach dead air
//   and then telephone you about it.

import { NextRequest, NextResponse } from 'next/server'
import { loadCallConfig } from '@/lib/telephony'
import { findRedialMatch, createInboundCallSession } from '@/lib/telephony/session'
import { toE164India, toTenDigits } from '@/lib/telephony/phone'
import {
  webhookAuthorized, nowInIst, withinHours,
} from '@/lib/telephony/webhook-auth'

/** Nobody to connect to — the flow's next applet (voicemail) takes over. */
const NO_ROUTE = () => new NextResponse(null, { status: 404 })

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params
  if (!webhookAuthorized(req, secret)) {
    console.warn('[telephony/connect] rejected: failed webhook auth')
    return NO_ROUTE()
  }

  try {
    const url        = req.nextUrl.searchParams
    const callerRaw  = url.get('CallFrom') ?? ''
    const callSid    = url.get('CallSid')
    // Reduced to ten digits before lookup: the redial query compares the same
    // way on the stored side, so a caller ID arriving as +91… or 0… still
    // matches the number we dialled.
    const callerPhone = toTenDigits(callerRaw)

    const config = await loadCallConfig()
    if (!config || !config.is_active) return NO_ROUTE()

    // 1. Were they just talking to someone?
    const match = callerPhone
      ? await findRedialMatch(callerPhone, config.inbound_redial_window_minutes)
      : null

    if (match?.reconnectPhone) {
      const dial = toE164India(match.reconnectPhone)
      if (!dial) return NO_ROUTE()

      // Reconnected on the strength of the recent conversation alone, without
      // re-checking whether that order's line is still open. A customer ringing
      // back two minutes after a handover is continuing the same conversation,
      // and the redial window is the guard on how long that stays true.
      await createInboundCallSession({
        match,
        callerPhone,
        calleePhone: match.reconnectPhone,
        providerCallSid: callSid,
      }).catch(err => console.error('[telephony/connect] could not log inbound call:', err))

      return connectTo([dial], config, `Order ${match.orderPublicId}`)
    }

    // 2. No live conversation — this is a cold call to the platform.
    const open = withinHours(nowInIst(), config.support_hours_start, config.support_hours_end)
    const supportDial = toE164India(config.support_forward_number)
    if (open && supportDial) {
      return connectTo([supportDial], config, 'Support')
    }

    // 3. Out of hours, or no support line configured. Falling through to the
    //    flow's voicemail applet is the honest outcome: better a message that
    //    becomes a ticket than a phone ringing in an empty office.
    return NO_ROUTE()
  } catch (err) {
    console.error('[telephony/connect] handler error:', err)
    return NO_ROUTE()
  }
}

/**
 * The Connect applet's response contract. `destination.numbers` is the only
 * mandatory field; everything else overrides a flow-level default.
 */
function connectTo(
  numbers: string[],
  config: NonNullable<Awaited<ReturnType<typeof loadCallConfig>>>,
  context: string
): NextResponse {
  const body: Record<string, unknown> = {
    fetch_after_attempt: false,
    destination: { numbers },
    record: config.record_calls,
    recording_channels: 'dual',
    // Applet caps: ringing ≤ 60s, conversation ≤ 4500s.
    max_ringing_duration:      Math.min(config.ring_timeout_seconds, 60),
    max_conversation_duration: Math.min(config.call_time_limit_seconds, 4500),
  }

  if (config.exophone) body.outgoing_phone_number = config.exophone

  if (config.record_calls) {
    // The inbound path can speak the notice rather than play a file — one less
    // asset to host, and it stays correct if the wording changes. Both parties
    // hear it: the person who rang in is being recorded too.
    body.start_call_playback = {
      playback_to: 'both',
      type:  'text',
      value: 'This call is recorded for quality and safety.',
    }
  }

  console.info(`[telephony/connect] routing inbound call — ${context}`)
  return NextResponse.json(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
