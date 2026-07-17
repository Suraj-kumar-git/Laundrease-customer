// lib/order-cancellation.ts
// Shared cancellation-with-refund-and-email logic, extracted from
// app/api/customer/orders/[id]/cancel/route.ts so the new reschedule-limit
// auto-cancellation (lib/order-reschedule.ts) doesn't reimplement the refund
// dance a second time. The customer cancel route itself is refactored to call
// these two functions instead of inlining the transaction.

import { transaction, queryOne } from '@/lib/db'
import { getRefundBreakdown, initiateOriginalMethodRefund } from '@/lib/payment/refund'
import { sendOrderCancelledEmail, sendProviderOrderCancelledEmail } from '@/lib/notifications/email'
import { CANCELLABLE_STATUSES } from '@/lib/order-status'

export const AUTO_CANCEL_REASON_NOTE = 'Order automatically cancelled after 3 reschedules — pickup could not be completed on the scheduled date after multiple attempts'

export interface CancelOrderTxParams {
  orderId:          number
  reasonNote:       string
  refundMethod:     'wallet' | 'original'
  initiatedBy:      string | number | null
  initiatedByRole:  'customer' | 'delivery' | 'admin' | 'system'
}

export interface CancelOrderTxResult {
  orderId:           number
  orderPublicId:     string
  orderNumber:       string
  customerId:        string
  customerEmail:     string | null
  customerName:      string
  laundryProfileId:  string | null
  providerEmail:     string | null
  providerName:      string | null
  refunded:          boolean
  refundAmount:      number
  walletPaid:        number
  gatewayPaid:       number
  refundToOriginal:  boolean
  walletTxnId:       number | null
}

// Throws 'NOT_FOUND' / 'NOT_CANCELLABLE' — same sentinel-error convention the
// existing cancel route already relies on.
export async function cancelOrderTransaction(params: CancelOrderTxParams): Promise<CancelOrderTxResult> {
  return transaction(async (client) => {
    const orderRes = await client.query(
      `SELECT o.id, o.public_id::TEXT AS public_id, o.order_number, o.status,
              o.customer_id::TEXT AS customer_id, o.laundry_profile_id::TEXT AS laundry_profile_id,
              cu.email AS customer_email, cu.full_name AS customer_name,
              pu.email AS provider_email, lp.business_name AS provider_name
       FROM orders o
       INNER JOIN users cu ON cu.id = o.customer_id
       LEFT  JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
       LEFT  JOIN users pu ON pu.id = lp.user_id
       WHERE o.id = $1
       FOR UPDATE`,
      [params.orderId]
    )
    if (orderRes.rowCount === 0) throw new Error('NOT_FOUND')
    const order = orderRes.rows[0]
    if (!CANCELLABLE_STATUSES.has(order.status)) throw new Error('NOT_CANCELLABLE')

    // What was actually captured, by source. Covers partially-paid orders
    // (wallet+COD, wallet+online) whose payment_status never reached 'paid'
    // but whose wallet slice was debited at checkout.
    const { walletPaid, gatewayPaid, totalRefundable } = await getRefundBreakdown(
      (text, p) => client.query(text, p), order.id
    )
    const refundToOriginal = params.refundMethod === 'original' && gatewayPaid > 0

    let walletTxnId: number | null = null
    if (totalRefundable > 0 && !refundToOriginal) {
      // Everything captured (wallet + gateway slices) back to the wallet, instantly.
      const txn = await client.query(
        `SELECT wallet_credit_for_order($1, $2, $3, $4) AS txn_id`,
        [order.customer_id, order.id, totalRefundable, `Refund for cancelled order ${order.order_number}`]
      )
      walletTxnId = txn.rows[0].txn_id
      await client.query(
        `UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'completed'`,
        [order.id]
      )
    }

    // Original-method refund is initiated via an external API call after this
    // transaction commits — here we only set the in-between status so the
    // order doesn't look like nothing happened.
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
      [order.id, totalRefundable > 0 && !refundToOriginal, refundToOriginal]
    )

    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes, updated_by) VALUES ($1, 'cancelled', $2, $3)`,
      [order.id, params.reasonNote, params.initiatedBy]
    )

    return {
      orderId: order.id, orderPublicId: order.public_id, orderNumber: order.order_number,
      customerId: order.customer_id, customerEmail: order.customer_email, customerName: order.customer_name,
      laundryProfileId: order.laundry_profile_id, providerEmail: order.provider_email, providerName: order.provider_name,
      refunded: totalRefundable > 0 && !refundToOriginal, refundAmount: totalRefundable,
      walletPaid, gatewayPaid, refundToOriginal, walletTxnId,
    }
  })
}

export interface FinalizeCancelOptions {
  cancelledByEmailLabel:         'customer' | 'delivery_partner' | 'platform'
  cancellationReasonForProvider: string
  initiatedBy:                   string | number | null
  initiatedByRole:               'customer' | 'delivery' | 'admin' | 'system'
  // Overrides the customer email's mapped "cancelled ..." phrase when the
  // default label text isn't specific enough (e.g. 3-failed-pickups cancels).
  customerCancelledByText?:      string
}

export interface FinalizeCancelResult {
  originalRefundError: string | null
  walletPortionError:  string | null
}

// Post-commit: gateway refund call (if refunding to original method) + the
// wallet-paid-portion top-up on a split order + best-effort emails. Never
// called before cancelOrderTransaction's transaction has already committed.
export async function finalizeCancelSideEffects(
  result: CancelOrderTxResult,
  opts:   FinalizeCancelOptions
): Promise<FinalizeCancelResult> {
  let originalRefundError: string | null = null
  let walletPortionError:  string | null = null

  if (result.refundToOriginal) {
    const refundResult = await initiateOriginalMethodRefund({
      orderId: result.orderId, amount: result.gatewayPaid,
      initiatedBy: opts.initiatedBy, initiatedByRole: opts.initiatedByRole,
    })
    if (!refundResult.success) {
      originalRefundError = refundResult.error || 'Refund could not be initiated'
      // Cancellation already went through — only the refund failed to start.
      await queryOne(`UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [result.orderId])
    } else if (result.walletPaid > 0) {
      try {
        await queryOne(
          `SELECT wallet_credit_for_order($1, $2, $3, $4) AS txn_id`,
          [result.customerId, result.orderId, result.walletPaid, `Wallet-paid portion refund for cancelled order ${result.orderNumber}`]
        )
        await queryOne(
          `UPDATE payments SET status = 'refunded' WHERE order_id = $1 AND status = 'completed' AND payment_method = 'wallet'`,
          [result.orderId]
        )
      } catch (walletErr) {
        console.error('[order-cancellation] wallet-portion credit failed:', walletErr)
        walletPortionError = 'The wallet-paid portion could not be credited automatically — please contact support.'
      }
    }
  }

  // Best-effort notifications — never fail the cancellation if this errors.
  try {
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'

    if (result.customerEmail) {
      const refundNote = result.refunded
        ? `₹${result.refundAmount.toFixed(2)} has been credited to your Laundrease wallet.`
        : result.refundToOriginal && !originalRefundError
          ? result.walletPaid > 0
            ? `₹${result.gatewayPaid.toFixed(2)} refund initiated to your original payment method (5–7 business days) and ₹${result.walletPaid.toFixed(2)} credited back to your wallet.`
            : `₹${result.gatewayPaid.toFixed(2)} refund initiated to your original payment method (5–7 business days).`
          : 'No payment was captured for this order.'
      await sendOrderCancelledEmail({
        to: result.customerEmail, customerName: result.customerName, orderNumber: result.orderNumber,
        cancelledBy: opts.cancelledByEmailLabel, cancelledByText: opts.customerCancelledByText, refundNote,
        orderUrl: `${baseUrl}/customer/orders/${result.orderPublicId}`,
      })
    }

    if (result.providerEmail) {
      await sendProviderOrderCancelledEmail({
        to: result.providerEmail, providerName: result.providerName || 'Partner',
        orderNumber: result.orderNumber,
        cancelledBy: opts.cancelledByEmailLabel === 'customer' ? 'the customer'
          : opts.cancelledByEmailLabel === 'delivery_partner' ? 'the delivery partner'
          : 'Laundrease',
        cancellationReason: opts.cancellationReasonForProvider,
        orderUrl: `${baseUrl}/laundry/orders/${result.orderPublicId}`,
      })
    }
  } catch (notifyErr) {
    console.error('[order-cancellation] notification failed:', notifyErr)
  }

  return { originalRefundError, walletPortionError }
}

// System-initiated cancel with original-method refund + emails. Swallows
// NOT_FOUND/NOT_CANCELLABLE — the action that triggered this (a reschedule or
// a pickup-failure log) already committed successfully, so a rare race that
// makes the order no longer cancellable must not fail that response.
export async function systemAutoCancelOrder(
  orderId:    number,
  reasonNote: string,
  customerCancelledByText?: string,
): Promise<{ cancelled: boolean }> {
  try {
    const result = await cancelOrderTransaction({
      orderId, refundMethod: 'original', initiatedBy: null, initiatedByRole: 'system',
      reasonNote,
    })
    await finalizeCancelSideEffects(result, {
      cancelledByEmailLabel: 'platform', initiatedBy: null, initiatedByRole: 'system',
      cancellationReasonForProvider: reasonNote,
      customerCancelledByText,
    })
    return { cancelled: true }
  } catch (err: any) {
    console.error(`[order-cancellation] auto-cancel skipped/failed for order ${orderId}:`, err.message)
    return { cancelled: false }
  }
}

// Thin wrapper used by every reschedule call site once a reschedule pushes an
// order's reschedule_count to the 3-strike limit.
export async function autoCancelForRescheduleLimit(orderId: number): Promise<{ cancelled: boolean }> {
  return systemAutoCancelOrder(orderId, AUTO_CANCEL_REASON_NOTE)
}
