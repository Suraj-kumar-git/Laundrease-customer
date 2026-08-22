// app/api/customer/webhooks/payments/[provider]/route.ts
//
// POST — the gateway's server-to-server settlement callback.
//
// This is the only channel that reports a payment when the customer's browser
// never comes back: the tab closed on the bank page, mobile data dropped
// mid-3DS, the app was backgrounded through the redirect. In all of those the
// money moved and our browser-return route was never called. Until now this
// endpoint verified a signature and then did nothing at all — the payload fell
// into a TODO — so those payments simply stayed 'initiated' forever while the
// customer's statement said otherwise.
//
// The pieces:
//   lib/payment/webhook-parse.ts  each gateway's payload -> one shape
//   lib/payment/settle.ts         idempotent, monotonic settlement
//   lib/payment/reconcile.ts      the amount check
//
// HTTP semantics matter here, because the status code decides whether the
// gateway retries:
//   200  handled (including deliberate no-ops) — stop retrying
//   400  malformed or not a provider we run — retrying will not help
//   401  signature did not verify — not ours to act on
//   404  no payment row yet; the callback can beat our own commit, so this
//        asks for a retry rather than swallowing a real settlement
//   503  gateway config unreadable — transient, retry
//
// Registered in proxy.ts's PUBLIC_API_ROUTES: the caller is a machine with no
// session cookie. It authenticates by signature against that provider's own
// webhook secret, which is strictly stronger than a cookie would be.

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getGatewayByProvider } from '@/lib/payment'
import { parseWebhookEvent } from '@/lib/payment/webhook-parse'
import { settleFromWebhook } from '@/lib/payment/settle'

const SUPPORTED_PROVIDERS = new Set(['payu', 'cashfree', 'razorpay'])

/** Gateways read the status code, not the body. Keep replies tiny and plain. */
function reply(status: number, body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, { status })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params

  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return reply(400, { ok: false, error: 'Unknown provider' })
  }

  // Read the body ONCE, as text. Every signature covers the exact bytes sent,
  // so re-serialising parsed JSON here would change them and break the check.
  const rawBody = await req.text()

  try {
    const gatewayInfo = await getGatewayByProvider(provider)
    if (!gatewayInfo) {
      console.error(`[payment webhook] no gateway config for provider ${provider}`)
      return reply(503, { ok: false, error: 'Gateway not configured' })
    }

    const signature =
      provider === 'razorpay' ? (req.headers.get('x-razorpay-signature') ?? '')
      : provider === 'cashfree' ? (req.headers.get('x-webhook-signature') ?? '')
      // PayU signs inside the form body (the `hash` field), not in a header —
      // its adapter recomputes the reverse hash from the payload itself.
      : ''

    const verified = gatewayInfo.adapter.verifyWebhook({
      rawBody,
      signature,
      provider: gatewayInfo.provider,
      timestamp: req.headers.get('x-webhook-timestamp') ?? undefined,
    })

    if (!verified) {
      console.warn(`[payment webhook] ${provider}: signature verification failed`)
      return reply(401, { ok: false, error: 'Invalid webhook signature' })
    }

    const event = parseWebhookEvent(provider, rawBody)
    if (!event) {
      console.error(`[payment webhook] ${provider}: unparseable payload`)
      return reply(400, { ok: false, error: 'Unparseable payload' })
    }

    // Razorpay's payload names its OWN order id, not ours, so it needs one hop
    // through the row the pay route wrote at checkout. The other two round-trip
    // our merchant_txn_id directly.
    let merchantTxnId = event.merchantTxnId
    if (!merchantTxnId && event.providerOrderId) {
      const mapped = await query<{ merchant_txn_id: string }>(
        `SELECT merchant_txn_id FROM payment_gateway_transactions
         WHERE provider_order_id = $1 AND provider = $2
         ORDER BY id DESC LIMIT 1`,
        [event.providerOrderId, provider]
      )
      merchantTxnId = mapped.rows[0]?.merchant_txn_id ?? null
    }

    if (!merchantTxnId) {
      console.error(`[payment webhook] ${provider}: could not map callback to a payment`, {
        providerOrderId: event.providerOrderId, eventType: event.eventType,
      })
      return reply(404, { ok: false, error: 'Payment not found' })
    }

    const result = await settleFromWebhook({
      provider,
      merchantTxnId,
      providerPaymentId: event.providerPaymentId,
      outcome:           event.outcome,
      reportedAmount:    event.reportedAmount,
      rawPayload:        rawBody,
      eventType:         event.eventType,
    })

    // Distinguish "we have no such payment" from "handled". The former can
    // simply mean the callback overtook our own INSERT, and a 404 gets it
    // redelivered instead of losing a settlement.
    if (result.status === 'not_found') {
      console.error(`[payment webhook] ${provider}: ${result.detail}`)
      return reply(404, { ok: false, error: 'Payment not found' })
    }

    console.info(`[payment webhook] ${provider} ${event.eventType} -> ${result.status}: ${result.detail}`)
    return reply(200, { ok: true, status: result.status })
  } catch (error) {
    // A 500 here is right: the gateway should retry, because we may have
    // failed partway and the payment is genuinely unsettled.
    console.error('[payment webhook]', provider, error)
    return reply(500, { ok: false, error: 'Webhook handling failed' })
  }
}
