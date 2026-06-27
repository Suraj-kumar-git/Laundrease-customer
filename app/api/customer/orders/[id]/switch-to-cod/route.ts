// app/api/customer/orders/[id]/switch-to-cod/route.ts
// POST /api/customer/orders/[id]/switch-to-cod
//
// Used from the payment-failure page when a customer's online payment didn't
// go through but the remaining amount is still within the COD limit. Cancels
// the failed/initiated online payment attempt and switches the order to COD
// so it can proceed without requiring payment right now.

import { NextRequest } from 'next/server'
import { transaction } from '@/lib/db'
import { getCodConfig } from '@/lib/payment'
import { randomUUID } from 'crypto'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { id: publicId } = await params

  try {
    const result = await transaction(async (client) => {
      const orderRes = await client.query(
        `SELECT id, order_number, total_amount, payment_status, payment_method
         FROM orders WHERE public_id = $1 AND customer_id = $2 FOR UPDATE`,
        [publicId, userId]
      )
      if (orderRes.rowCount === 0) throw new Error('NOT_FOUND')
      const order = orderRes.rows[0]
      const orderId = order.id

      if (order.payment_status === 'paid') throw new Error('ALREADY_PAID')

      const walletPaidRes = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS amount
         FROM payments WHERE order_id = $1 AND payment_method = 'wallet' AND status = 'completed'`,
        [orderId]
      )
      const walletPaid       = parseFloat(walletPaidRes.rows[0].amount)
      const remainingAmount  = Math.max(0, parseFloat(order.total_amount) - walletPaid)

      const { enabled: codEnabled, maxAmount: codMaxAmount } = await getCodConfig()
      if (!codEnabled) throw new Error('COD_DISABLED')
      if (remainingAmount > codMaxAmount) throw new Error('COD_LIMIT_EXCEEDED')

      // Superseded online-payment attempts no longer apply.
      await client.query(
        `UPDATE payments SET status = 'cancelled', updated_at = NOW()
         WHERE order_id = $1 AND provider <> 'cod' AND provider <> 'wallet'
           AND status IN ('initiated', 'failed')`,
        [orderId]
      )

      const newPaymentMethod = walletPaid > 0 ? 'wallet+cod' : 'cod'
      await client.query(
        `UPDATE orders SET payment_method = $1, payment_status = 'pending', updated_at = NOW() WHERE id = $2`,
        [newPaymentMethod, orderId]
      )

      if (remainingAmount > 0) {
        await client.query(
          `INSERT INTO payments (order_id, amount, payment_method, status, provider, merchant_txn_id)
           VALUES ($1, $2, 'cod', 'pending', 'cod', $3)`,
          [orderId, remainingAmount, `COD-${orderId}-${randomUUID()}`]
        )
      }

      return { orderId: order.id, orderNumber: order.order_number }
    })

    return successResponse({
      message: 'Order switched to Cash on Delivery.',
      order_id: result.orderId,
      order_number: result.orderNumber,
    })
  } catch (error: any) {
    if (error.message === 'NOT_FOUND')          return notFoundResponse('Order not found')
    if (error.message === 'ALREADY_PAID')       return errorResponse('This order has already been paid.', 400)
    if (error.message === 'COD_DISABLED')       return errorResponse('Cash on Delivery is not available.', 400)
    if (error.message === 'COD_LIMIT_EXCEEDED') return errorResponse('Order amount exceeds the Cash on Delivery limit.', 400)
    console.error('[POST /api/customer/orders/:id/switch-to-cod]', error)
    return serverErrorResponse('Failed to switch to Cash on Delivery')
  }
}
