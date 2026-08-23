// app/api/customer/payments/payu/sdk-result/route.ts
//
// POST — settle a payment that ran through the native PayU sheet.
//
// The web flow settles from PayU's own POST to surl/furl, whose hash proves
// the message came from PayU. The mobile SDK has no such message: it reports
// the outcome to the device, and the device tells us. That is a claim from a
// client we do not control, so none of it is trusted — the route ignores what
// the app says happened and asks PayU directly via verify_payment.
//
// The app therefore cannot mark its own payment successful. The worst a forged
// call can do is make us re-check a transaction the caller owns, and act on
// PayU's answer.
//
// Settlement itself reuses lib/payment/settle.ts, the same idempotent,
// monotonic path the webhook uses. That matters because both can arrive: the
// SDK callback and PayU's server-to-server webhook race, and whichever lands
// second must be a no-op rather than a second write.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'
import { PayUAdapter } from '@/lib/payment/payu'
import { settleFromWebhook } from '@/lib/payment/settle'
import { sendPushToUser } from '@/lib/push-notifications'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { order_id?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid body', 400, 'INVALID_BODY')
  }

  const publicId = body.order_id
  if (!publicId) return errorResponse('Missing order_id', 400, 'MISSING_FIELDS')

  try {
    const orderRes = await query(
      `SELECT o.id, o.public_id, o.order_number, o.customer_id, o.payment_status
       FROM orders o
       WHERE o.public_id = $1 AND o.customer_id = $2`,
      [publicId, userId]
    )
    if (orderRes.rowCount === 0) return notFoundResponse('Order not found')
    const order = orderRes.rows[0]

    const paymentRes = await query(
      `SELECT merchant_txn_id, status
       FROM payments
       WHERE order_id = $1 AND provider = 'payu'
       ORDER BY created_at DESC
       LIMIT 1`,
      [order.id]
    )
    if (paymentRes.rowCount === 0) {
      return errorResponse('No payment found for this order', 400, 'NO_PAYMENT_ATTEMPT')
    }
    const merchantTxnId = paymentRes.rows[0].merchant_txn_id

    // Already settled by the webhook or an earlier call — nothing to redo, and
    // the caller still needs a truthful answer.
    if (order.payment_status === 'paid') {
      return successResponse({
        settled: true,
        payment_status: 'paid',
        order_id: order.public_id,
        order_number: order.order_number,
      })
    }

    const gatewayInfo = await getActiveGateway()
    if (!gatewayInfo || !(gatewayInfo.adapter instanceof PayUAdapter)) {
      return errorResponse('PayU is not the active gateway', 503, 'GATEWAY_INACTIVE')
    }

    const status = await gatewayInfo.adapter.fetchTransactionStatus(merchantTxnId)

    if (!status.found) {
      // PayU has no record yet. Common when the sheet was dismissed before
      // anything was attempted, and also possible as a brief lag after a real
      // payment — so this is explicitly not a failure verdict.
      return successResponse({
        settled: false,
        payment_status: 'pending',
        order_id: order.public_id,
        order_number: order.order_number,
      })
    }

    const outcome =
      status.status === 'success' ? 'success' as const
      : status.status === 'failure' || status.status === 'failed' ? 'failed' as const
      : 'pending' as const

    const result = await settleFromWebhook({
      provider: 'payu',
      merchantTxnId,
      providerPaymentId: status.gatewayPaymentId,
      outcome,
      // From PayU's own API response rather than the device, so
      // reconcileAmount() is comparing against something authentic.
      reportedAmount: status.amount ?? undefined,
      rawPayload: JSON.stringify(status.raw),
      eventType: 'sdk_verify_payment',
    })

    const settled = result.paymentStatus === 'completed'

    // Best effort, and only when this call is the one that settled it — the
    // webhook path sends its own, and 'already_settled' means someone already
    // did. Outside any transaction: a push failure must not affect the answer.
    if (settled && result.status === 'applied') {
      sendPushToUser({
        userId: order.customer_id,
        category: 'orders',
        title: 'Payment successful',
        body: `Order #${order.order_number} is confirmed and on its way to pickup.`,
        data: { orderId: order.public_id },
      }).catch((error) => console.error('[push] payu/sdk-result send failed', error))
    }

    return successResponse({
      settled,
      payment_status: settled ? 'paid' : outcome === 'failed' ? 'failed' : 'pending',
      order_id: order.public_id,
      order_number: order.order_number,
    })
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/sdk-result]', error)
    return serverErrorResponse('Could not confirm payment')
  }
}
