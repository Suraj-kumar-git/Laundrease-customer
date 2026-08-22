import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: {
    order_id: number
    gateway_order_id: string
    gateway_payment_id: string
    signature: string
    extra?: Record<string, string>
  }

  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid body', 400)
  }

  if (!body.order_id || !body.gateway_order_id || !body.gateway_payment_id || !body.signature) {
    return errorResponse('Missing required fields', 400)
  }

  try {
    const orderCheck = await query(
      `SELECT id, order_number, total_amount, payment_status
       FROM orders
       WHERE id = $1 AND customer_id = $2`,
      [body.order_id, userId]
    )

    if (orderCheck.rowCount === 0) {
      return errorResponse('Order not found', 404)
    }

    const order = orderCheck.rows[0]

    if (order.payment_status === 'paid') {
      return successResponse({
        verified: true,
        already_paid: true,
        order_id: order.id,
        order_number: order.order_number,
      })
    }

    const gatewayInfo = await getActiveGateway()
    if (!gatewayInfo) {
      return errorResponse('Payment gateway not configured', 503)
    }

    if (gatewayInfo.provider !== 'razorpay') {
      return errorResponse('This verify route is only for Razorpay frontend verification', 400)
    }

    const verification = await gatewayInfo.adapter.verifyPayment({
      gatewayOrderId: body.gateway_order_id,
      gatewayPaymentId: body.gateway_payment_id,
      signature: body.signature,
      extra: body.extra,
    })

    if (!verification.verified) {
      return errorResponse('Payment verification failed. Invalid signature.', 400)
    }

    // Razorpay's signature covers order_id|payment_id — NOT the amount. So
    // unlike the PayU and Cashfree callbacks there is no signed figure to
    // reconcile against, and reading an amount out of the client-supplied
    // `extra` would be checking a number the attacker chose.
    //
    // What the signature DOES bind is the gateway order, and we created that
    // order server-side with this payment row's amount (see the pay route).
    // So the binding that matters here is: the gateway_order_id being verified
    // must be the one we issued for this payment. Without that, a signature
    // from any other order of the same customer would settle this one.
    const boundOrder = await query(
      `SELECT 1
       FROM payment_gateway_transactions pgt
       INNER JOIN payments p ON p.id = pgt.payment_id
       WHERE p.order_id = $1
         AND p.provider NOT IN ('cod', 'wallet')
         AND pgt.provider_order_id = $2`,
      [body.order_id, body.gateway_order_id]
    )
    if (boundOrder.rowCount === 0) {
      console.error(
        `[payment-reconcile] REJECTED verify order_id=${body.order_id} ` +
        `gateway_order_id=${body.gateway_order_id} reason=unbound_gateway_order`
      )
      return errorResponse(
        'Payment verification failed. This payment does not belong to that order.',
        400
      )
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
             status = CASE WHEN status = 'failed' THEN 'pending' ELSE status END,
             updated_at = NOW()
         WHERE id = $1`,
        [body.order_id]
      )

      await client.query(
        `UPDATE payments
         SET status = 'completed',
             transaction_id = $1,
             method_details = $2,
             updated_at = NOW()
         WHERE order_id = $3 AND provider <> 'cod' AND provider <> 'wallet'
           AND status IN ('initiated', 'failed')`,
        [
          body.gateway_payment_id,
          JSON.stringify({
            provider: gatewayInfo.provider,
            gateway_order_id: body.gateway_order_id,
            gateway_payment_id: body.gateway_payment_id,
            signature: body.signature,
            extra: body.extra ?? {},
            verification_source: 'frontend_verify',
            verified_at: new Date().toISOString(),
          }),
          body.order_id,
        ]
      )
    })

    // Cart was deliberately kept around (not cleared at order-create time)
    // until payment is actually confirmed — clear it now that it is.
    try { await query(`DELETE FROM shopping_carts WHERE user_id = $1`, [userId]) }
    catch { /* non-fatal */ }

    return successResponse({
      verified: true,
      order_id: body.order_id,
      order_number: order.order_number,
      provider: gatewayInfo.provider,
    })
  } catch (error) {
    console.error('[POST /api/customer/payments/verify]', error)
    return serverErrorResponse('Failed to verify payment')
  }
}