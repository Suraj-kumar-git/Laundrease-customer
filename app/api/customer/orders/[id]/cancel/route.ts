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
//
// The actual transaction + refund + email logic lives in
// lib/order-cancellation.ts, shared with the automatic reschedule-limit
// cancellation (lib/order-reschedule.ts).

import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'
import { cancelOrderTransaction, finalizeCancelSideEffects } from '@/lib/order-cancellation'

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
    // Body missing/unparsable — falls through to the reason check below.
  }
  if (!reason) return errorResponse('A cancellation reason is required', 400)

  try {
    const orderRow = await queryOne<{ id: number }>(
      `SELECT id FROM orders WHERE public_id = $1 AND customer_id = $2`,
      [publicId, userId]
    )
    if (!orderRow) return notFoundResponse('Order not found')

    const result = await cancelOrderTransaction({
      orderId: orderRow.id,
      reasonNote: `Cancelled by customer: ${reason}`,
      refundMethod,
      initiatedBy: userId,
      initiatedByRole: 'customer',
    })

    const { originalRefundError, walletPortionError } = await finalizeCancelSideEffects(result, {
      cancelledByEmailLabel: 'customer',
      cancellationReasonForProvider: reason || 'No reason provided',
      initiatedBy: userId,
      initiatedByRole: 'customer',
    })

    const message = result.refunded
      ? `Order cancelled. ₹${result.refundAmount.toFixed(2)} has been credited to your wallet.`
      : result.refundToOriginal && !originalRefundError
        ? (result.walletPaid > 0
            ? `Order cancelled. ₹${result.gatewayPaid.toFixed(2)} refund initiated to your original payment method (5-7 business days)${walletPortionError ? `. ${walletPortionError}` : ` and ₹${result.walletPaid.toFixed(2)} credited back to your wallet.`}`
            : `Order cancelled. ₹${result.gatewayPaid.toFixed(2)} refund has been initiated to your original payment method — it can take 5-7 business days to reflect.`)
        : result.refundToOriginal && originalRefundError
          ? `Order cancelled, but the refund to your original payment method could not be started (${originalRefundError}). Please contact support or try again from your order history.`
          : 'Order cancelled successfully.'

    return successResponse({
      message,
      order_id: result.orderId,
      order_number: result.orderNumber,
      refunded: result.refunded,
      refund_amount: result.refundAmount,
      wallet_paid: result.walletPaid,
      gateway_paid: result.gatewayPaid,
      wallet_transaction_id: result.walletTxnId,
      refund_to_original: result.refundToOriginal,
      refund_error: originalRefundError || walletPortionError,
    })
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
