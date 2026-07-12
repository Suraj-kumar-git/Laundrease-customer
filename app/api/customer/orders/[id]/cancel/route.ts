// app/api/customer/orders/[id]/cancel/route.ts
// POST /api/customer/orders/[id]/cancel
//
// Lets a customer cancel their own order as long as the laundry provider
// has not yet started processing it (i.e. status is still one of
// CANCELLABLE_STATUSES — see app/api/customer/orders/[id]/route.ts).
//
// Refunds work off the completed payment rows (not orders.payment_status),
// split by source — see getRefundBreakdown:
//  - The wallet-paid portion (wallet-only or the wallet slice of a
//    wallet+online / wallet+COD order) can only go back to the wallet.
//  - The gateway-paid portion (PayU/Cashfree) goes to the wallet by default,
//    or back to the original method when refund_method = 'original'. That
//    path is async — the order moves to 'refund_processing' until an admin
//    confirms completion (see lib/payment/refund.ts).
// COD orders with no payment captured are simply marked cancelled.

import { NextRequest } from 'next/server'
import { transaction, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'
import { sendOrderCancelledEmail, sendProviderOrderCancelledEmail } from '@/lib/notifications/email'
import { CANCELLABLE_STATUSES } from '@/lib/order-status'
import { initiateOriginalMethodRefund, getRefundBreakdown } from '@/lib/payment/refund'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { id: publicId } = await params

  let reason: string | null = null
  let refundMethod: 'wallet' | 'original' = 'wallet'
  try {
    const body = await req.json()
    reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : null
    if (body?.refund_method === 'original') refundMethod = 'original'
  } catch {
    // Body is optional — no reason provided is fine.
  }

  try {
    const result = await transaction(async (client) => {
      // Set user context for the order_status_history audit trigger
      await client.query(`SELECT set_config('app.current_user_id', $1, TRUE)`, [userId])

      const orderRes = await client.query(
        `SELECT id, order_number, status, payment_status, total_amount, customer_id
         FROM orders
         WHERE public_id = $1 AND customer_id = $2
         FOR UPDATE`,
        [publicId, userId]
      )
      if (orderRes.rowCount === 0) throw new Error('NOT_FOUND')

      const order = orderRes.rows[0]
      const orderId = order.id
      if (!CANCELLABLE_STATUSES.has(order.status)) {
        throw new Error('NOT_CANCELLABLE')
      }

      // What was actually captured, by source. Covers partially-paid orders
      // (wallet+COD, wallet+online) whose payment_status never reached 'paid'
      // but whose wallet slice was debited at checkout.
      const { walletPaid, gatewayPaid, totalRefundable } = await getRefundBreakdown(
        (text, params) => client.query(text, params), orderId
      )
      const refundToOriginal = refundMethod === 'original' && gatewayPaid > 0

      let walletTxnId: number | null = null
      if (totalRefundable > 0 && !refundToOriginal) {
        // Everything captured (wallet + gateway slices) back to the wallet, instantly.
        const txn = await client.query(
          `SELECT wallet_credit_for_order($1, $2, $3, $4) AS txn_id`,
          [
            order.customer_id,
            orderId,
            totalRefundable,
            `Refund for cancelled order ${order.order_number}`,
          ]
        )
        walletTxnId = txn.rows[0].txn_id

        // Reflect the refund on the original payment rows for the invoice/payment history view
        await client.query(
          `UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'completed'`,
          [orderId]
        )
      }

      // Original-method refund is initiated via an external API call after
      // this transaction commits (see below) — here we only set the
      // in-between status so the order doesn't look like nothing happened.
      await client.query(
        `UPDATE orders
         SET status = 'cancelled',
             payment_status = CASE
               WHEN $2 THEN 'refunded'
               WHEN $3 THEN 'refund_processing'
               ELSE payment_status
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [orderId, totalRefundable > 0 && !refundToOriginal, refundToOriginal]
      )

      await client.query(
        `INSERT INTO order_status_history (order_id, status, notes, updated_by)
         VALUES ($1, 'cancelled', $2, $3)`,
        [orderId, reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer', userId]
      )

      return {
        order_id: orderId,
        order_number: order.order_number,
        refunded: totalRefundable > 0 && !refundToOriginal,
        refund_amount: totalRefundable,
        wallet_paid: walletPaid,
        gateway_paid: gatewayPaid,
        wallet_transaction_id: walletTxnId,
        refund_to_original: refundToOriginal,
      }
    })

    let originalRefundError: string | null = null
    let walletPortionError: string | null = null
    if (result.refund_to_original) {
      // Only the gateway-captured slice can go back through the gateway —
      // the helper clamps to the captured amount anyway, but be explicit.
      const refundResult = await initiateOriginalMethodRefund({
        orderId: result.order_id, amount: result.gateway_paid, initiatedBy: userId, initiatedByRole: 'customer',
      })
      if (!refundResult.success) {
        originalRefundError = refundResult.error || 'Refund could not be initiated'
        // Cancellation already went through — only the refund failed to start.
        // Revert to 'paid' (nothing is actually processing at the gateway,
        // and the wallet slice hasn't been credited yet either) so the
        // customer can retry, e.g. via the wallet option instead.
        await queryOne(`UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [result.order_id])
      } else if (result.wallet_paid > 0) {
        // The wallet-paid slice of a split order can't go back through the
        // gateway — credit it back to the wallet now that the gateway leg
        // is safely initiated.
        try {
          await queryOne(
            `SELECT wallet_credit_for_order($1, $2, $3, $4) AS txn_id`,
            [userId, result.order_id, result.wallet_paid, `Wallet-paid portion refund for cancelled order ${result.order_number}`]
          )
          await queryOne(
            `UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'completed' AND payment_method = 'wallet'`,
            [result.order_id]
          )
        } catch (walletErr) {
          console.error('[POST /api/customer/orders/:id/cancel] wallet-portion credit failed:', walletErr)
          walletPortionError = 'The wallet-paid portion could not be credited automatically — please contact support.'
        }
      }
    }

    // Best-effort notification — never fail the cancellation if this errors.
    try {
      const customerRes = await queryOne<{ email: string; full_name: string }>(
        `SELECT email, full_name FROM users WHERE id = $1`,
        [userId]
      )
      const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'

      if (customerRes?.email) {
        const refundNote = result.refunded
          ? `₹${result.refund_amount.toFixed(2)} has been credited to your Laundrease wallet.`
          : result.refund_to_original && !originalRefundError
            ? result.wallet_paid > 0
              ? `₹${result.gateway_paid.toFixed(2)} refund initiated to your original payment method (5–7 business days) and ₹${result.wallet_paid.toFixed(2)} credited back to your wallet.`
              : `₹${result.gateway_paid.toFixed(2)} refund initiated to your original payment method (5–7 business days).`
            : 'No payment was captured for this order.'
        await sendOrderCancelledEmail({
          to: customerRes.email,
          customerName: customerRes.full_name,
          orderNumber: result.order_number,
          cancelledBy: 'customer',
          refundNote,
          orderUrl: `${baseUrl}/customer/orders/${publicId}`,
        })
      }

      // Tell the laundry provider too — they may already be processing it.
      const providerRes = await queryOne<{ email: string | null; business_name: string }>(
        `SELECT pu.email, lp.business_name
         FROM orders o
         INNER JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
         INNER JOIN users pu ON pu.id = lp.user_id
         WHERE o.id = $1`,
        [result.order_id]
      )
      if (providerRes?.email) {
        await sendProviderOrderCancelledEmail({
          to: providerRes.email,
          providerName: providerRes.business_name,
          orderNumber: result.order_number,
          cancelledBy: 'the customer',
          cancellationReason: reason || 'No reason provided',
          orderUrl: `${baseUrl}/laundry/orders/${publicId}`,
        })
      }
    } catch (notifyErr) {
      console.error('[POST /api/customer/orders/:id/cancel] notification failed:', notifyErr)
    }

    const message = result.refunded
      ? `Order cancelled. ₹${result.refund_amount.toFixed(2)} has been credited to your wallet.`
      : result.refund_to_original && !originalRefundError
        ? (result.wallet_paid > 0
            ? `Order cancelled. ₹${result.gateway_paid.toFixed(2)} refund initiated to your original payment method (5-7 business days)${walletPortionError ? `. ${walletPortionError}` : ` and ₹${result.wallet_paid.toFixed(2)} credited back to your wallet.`}`
            : `Order cancelled. ₹${result.gateway_paid.toFixed(2)} refund has been initiated to your original payment method — it can take 5-7 business days to reflect.`)
        : result.refund_to_original && originalRefundError
          ? `Order cancelled, but the refund to your original payment method could not be started (${originalRefundError}). Please contact support or try again from your order history.`
          : 'Order cancelled successfully.'

    return successResponse({ message, ...result, refund_error: originalRefundError || walletPortionError })
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') return notFoundResponse('Order not found')
    if (error.message === 'NOT_CANCELLABLE') {
      return errorResponse(
        'This order can no longer be cancelled — the laundry has already started processing it.',
        400,
        'NOT_CANCELLABLE'
      )
    }
    console.error('[POST /api/customer/orders/:id/cancel]', error)
    return serverErrorResponse('Failed to cancel order')
  }
}
