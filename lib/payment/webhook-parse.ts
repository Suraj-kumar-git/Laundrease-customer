// lib/payment/webhook-parse.ts
//
// Turning each gateway's webhook body into one shape the settlement code can
// act on, so lib/payment/settle.ts never has to know whose callback it is.
//
// The three payloads have nothing in common — PayU posts form-encoded fields,
// Cashfree and Razorpay post JSON with different nesting, amounts arrive in
// rupees from two of them and paise from the third, and each names the payment
// differently. All of that is contained here.
//
// ---- How each one identifies OUR payment row -------------------------------
// We key payments on `merchant_txn_id`, which the pay route generates and
// hands to the gateway:
//
//   PayU      `txnid` IS our merchant_txn_id (round-tripped verbatim).
//   Cashfree  `data.order.order_id` is our merchant_txn_id — that is what
//             CashfreeAdapter.createOrder() sends as `order_id`.
//   Razorpay  gives us neither. Its `order_id` is Razorpay's own id, so the
//             lookup goes through payment_gateway_transactions.provider_order_id,
//             which the pay route stored at checkout. `receipt` on the order
//             entity is our id when Razorpay includes the order in the payload,
//             so it's taken as a fallback.

export type WebhookOutcome = 'success' | 'failed' | 'pending'

export interface ParsedWebhookEvent {
  /** Our own payments.merchant_txn_id, when the payload carries it. */
  merchantTxnId: string | null
  /** The gateway's order id — the fallback lookup key for Razorpay. */
  providerOrderId: string | null
  /** The gateway's id for the payment attempt itself. */
  providerPaymentId: string | null
  outcome: WebhookOutcome
  /**
   * Amount in RUPEES the callback claims was collected, or undefined when the
   * signature does not cover it.
   *
   * The signature on all three of these covers the whole body, so an amount
   * read out of a verified body IS vouched for — unlike the browser-return
   * path, where Razorpay signs only `order_id|payment_id`. That is why
   * webhooks can reconcile a Razorpay payment and the return route cannot.
   */
  reportedAmount?: number
  /** The event name, kept for the audit trail. */
  eventType: string
}

export function parseWebhookEvent(provider: string, rawBody: string): ParsedWebhookEvent | null {
  switch (provider) {
    case 'payu':     return parsePayU(rawBody)
    case 'cashfree': return parseCashfree(rawBody)
    case 'razorpay': return parseRazorpay(rawBody)
    default:         return null
  }
}

function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : undefined
}

// PayU posts the same form fields as the browser callback.
// status: 'success' | 'failure' | 'pending' (also 'failed' in some flows).
function parsePayU(rawBody: string): ParsedWebhookEvent {
  const form = new URLSearchParams(rawBody)
  const status = (form.get('status') ?? '').toLowerCase()

  return {
    merchantTxnId:     form.get('txnid') || null,
    providerOrderId:   form.get('txnid') || null,
    providerPaymentId: form.get('mihpayid') || null,
    outcome:           status === 'success' ? 'success'
                     : status === 'pending' ? 'pending'
                     : 'failed',
    reportedAmount:    toNumber(form.get('amount')),
    eventType:         `payu.${status || 'unknown'}`,
  }
}

// Cashfree PG v2:
//   { type: 'PAYMENT_SUCCESS_WEBHOOK' | 'PAYMENT_FAILED_WEBHOOK'
//           | 'PAYMENT_USER_DROPPED_WEBHOOK',
//     data: { order: { order_id, order_amount }, payment: { cf_payment_id,
//             payment_status, payment_amount } } }
function parseCashfree(rawBody: string): ParsedWebhookEvent | null {
  let body: any
  try { body = JSON.parse(rawBody) } catch { return null }

  const order   = body?.data?.order   ?? {}
  const payment = body?.data?.payment ?? {}
  const status  = String(payment.payment_status ?? '').toUpperCase()
  const type    = String(body?.type ?? '')

  // USER_DROPPED and FAILED are both "no money arrived". They are distinct
  // events to Cashfree but identical to us, and collapsing them here keeps
  // the settlement code from having to care.
  const outcome: WebhookOutcome =
    status === 'SUCCESS' ? 'success'
    : status === 'PENDING' ? 'pending'
    : 'failed'

  return {
    merchantTxnId:     order.order_id ? String(order.order_id) : null,
    providerOrderId:   body?.data?.order?.cf_order_id ? String(body.data.order.cf_order_id) : null,
    providerPaymentId: payment.cf_payment_id != null ? String(payment.cf_payment_id) : null,
    outcome,
    // payment_amount is what was actually collected; order_amount is what was
    // asked for. Reconciliation wants the former.
    reportedAmount:    toNumber(payment.payment_amount) ?? toNumber(order.order_amount),
    eventType:         type || `cashfree.${status.toLowerCase()}`,
  }
}

// Razorpay:
//   { event: 'payment.captured' | 'payment.failed' | 'payment.authorized',
//     payload: { payment: { entity: { id, order_id, amount, status } },
//                order:   { entity: { receipt } } } }
//
// `payment.authorized` is money held but NOT captured. It is deliberately
// treated as pending, not success: an authorised-only payment can still expire
// uncaptured, and settling the order on it would hand over laundry for money
// we never took.
function parseRazorpay(rawBody: string): ParsedWebhookEvent | null {
  let body: any
  try { body = JSON.parse(rawBody) } catch { return null }

  const entity = body?.payload?.payment?.entity ?? {}
  const event  = String(body?.event ?? '')

  const outcome: WebhookOutcome =
    event === 'payment.captured' ? 'success'
    : event === 'payment.failed' ? 'failed'
    : 'pending'

  const paise = toNumber(entity.amount)

  return {
    merchantTxnId:     body?.payload?.order?.entity?.receipt
                         ? String(body.payload.order.entity.receipt) : null,
    providerOrderId:   entity.order_id ? String(entity.order_id) : null,
    providerPaymentId: entity.id ? String(entity.id) : null,
    outcome,
    // Razorpay speaks paise everywhere; our payments table is in rupees.
    reportedAmount:    paise === undefined ? undefined : paise / 100,
    eventType:         event || 'razorpay.unknown',
  }
}
