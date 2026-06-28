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

    await transaction(async (client) => {
      await client.query(
        `UPDATE orders
         SET payment_status = 'paid',
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