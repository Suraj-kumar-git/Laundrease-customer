// app/api/customer/orders/[id]/pay/route.ts
// POST /api/customer/orders/[id]/pay
//
// Initiates (or re-initiates, on retry) the online payment for an order that
// already exists in the DB. The amount, merchant_txn_id, and provider are all
// read server-side from the order's own payment row — never trusted from the
// client — so this also closes the "client can send any amount" gap the old
// /api/customer/payments/create-order endpoint had.
//
// Also supports a COD order paying online any time before delivery (so the
// customer never has to hand the delivery partner cash/card at the door):
// when there's no existing online-payment attempt but there is a pending
// COD payment row, that row is superseded by a fresh online-payment row for
// the same amount, mirroring switch-to-cod/route.ts's inverse swap.

import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'
import { randomUUID } from 'crypto'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

const NOT_PAYABLE_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'returned'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { id } = await params
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) return notFoundResponse('Order not found')

  try {
    const orderRes = await query(
      `SELECT o.id, o.order_number, o.status, o.payment_status, u.full_name, u.email, u.phone
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [orderId, userId]
    )
    if (orderRes.rowCount === 0) return notFoundResponse('Order not found')
    const order = orderRes.rows[0]

    if (order.payment_status === 'paid') {
      return errorResponse('This order has already been paid.', 400, 'ALREADY_PAID')
    }
    if (NOT_PAYABLE_STATUSES.has(order.status)) {
      return errorResponse('This order can no longer be paid online.', 400, 'NOT_PAYABLE')
    }

    const gatewayInfo = await getActiveGateway()
    if (!gatewayInfo) {
      return errorResponse('No payment gateway is configured. Please contact support.', 503)
    }

    // The pending online-payment attempt created alongside the order (or the
    // most recent one, on retry after a failed/expired attempt).
    const paymentRes = await query(
      `SELECT id, amount, merchant_txn_id, provider
       FROM payments
       WHERE order_id = $1 AND provider <> 'cod' AND provider <> 'wallet'
         AND status IN ('initiated', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [orderId]
    )

    let payment = paymentRes.rows[0]

    if (!payment) {
      // No online attempt exists — this is a COD order paying online before
      // delivery. Supersede the pending COD row with a fresh online one.
      const codRes = await query(
        `SELECT amount FROM payments WHERE order_id = $1 AND provider = 'cod' AND status = 'pending'`,
        [orderId]
      )
      if (codRes.rowCount === 0) {
        return errorResponse('This order does not have a payment due.', 400, 'NO_PAYMENT_ATTEMPT')
      }

      payment = await transaction(async client => {
        await client.query(
          `UPDATE payments SET status = 'cancelled', updated_at = NOW()
           WHERE order_id = $1 AND provider = 'cod' AND status = 'pending'`,
          [orderId]
        )
        const merchantTxnId = `${gatewayInfo.provider.toUpperCase()}-${orderId}-${randomUUID()}`
        const inserted = await client.query(
          `INSERT INTO payments (order_id, amount, payment_method, status, provider, merchant_txn_id, gateway_config_id)
           VALUES ($1, $2, 'online', 'initiated', $3, $4, $5)
           RETURNING id, amount, merchant_txn_id, provider`,
          [orderId, codRes.rows[0].amount, gatewayInfo.provider, merchantTxnId, gatewayInfo.id]
        )
        return inserted.rows[0]
      })
    } else if (payment.provider !== gatewayInfo.provider) {
      // Keep the payment row's provider/gateway_config_id in sync if admin
      // switched gateways between order creation and this attempt.
      await query(
        `UPDATE payments SET provider = $1, gateway_config_id = $2, status = 'initiated', updated_at = NOW() WHERE id = $3`,
        [gatewayInfo.provider, gatewayInfo.id, payment.id]
      )
    } else if (payment.status === 'failed') {
      await query(
        `UPDATE payments SET gateway_config_id = $1, status = 'initiated', updated_at = NOW() WHERE id = $2`,
        [gatewayInfo.id, payment.id]
      )
    }

    const gatewayOrder = await gatewayInfo.adapter.createOrder({
      amount: parseFloat(payment.amount),
      currency: 'INR',
      receipt: payment.merchant_txn_id,
      notes: {
        customer_name: order.full_name ?? '',
        customer_email: order.email ?? '',
        customer_phone: order.phone ?? '',
        productinfo: `Order ${order.order_number}`,
      },
    })

    return successResponse({
      order_id:    order.id,
      order_number: order.order_number,
      provider:    gatewayInfo.provider,
      sandbox:     gatewayInfo.sandbox,
      gateway_order_id: gatewayOrder.gatewayOrderId,
      amount:      gatewayOrder.amount,
      currency:    gatewayOrder.currency,
      client_key:  gatewayOrder.clientKey ?? null,
      payment_session_id: gatewayOrder.paymentSessionId ?? null,
      checkout_url: gatewayOrder.checkoutUrl ?? null,
      checkout_method: gatewayOrder.checkoutMethod ?? null,
      checkout_form_fields: gatewayOrder.checkoutFormFields ?? null,
    })
  } catch (error) {
    console.error('[POST /api/customer/orders/:id/pay]', error)
    return serverErrorResponse('Failed to initiate payment')
  }
}
