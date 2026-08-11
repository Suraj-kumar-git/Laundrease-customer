// lib/payment/refund.ts
// Initiates a gateway-side refund (money back to the customer's original
// card/UPI/bank) as an alternative to the instant wallet credit. Unlike the
// wallet path, this is async — the gateway confirms completion later (see
// checkOriginalMethodRefundStatus, called from the admin "check status"
// action since PayU has no reliable refund webhook).

import { query, queryOne } from '@/lib/db'
import { getActiveGateway } from './index'

export interface InitiateRefundResult {
  success: boolean
  refundId?: number
  status?: string
  error?: string
}

// How much of an order was actually captured, split by source. Cancellation
// refunds must treat the two buckets differently: the wallet-paid portion can
// only ever go back to the wallet, while the gateway-paid portion may go to
// the wallet OR back to the original payment method (customer's choice).
// Works off completed payment rows rather than orders.payment_status so
// partially-paid orders (wallet+COD, wallet+online with pending gateway leg)
// still get their captured wallet slice refunded.
export interface RefundBreakdown {
  walletPaid:      number
  gatewayPaid:     number
  totalRefundable: number
}

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

export async function getRefundBreakdown(
  runQuery: QueryFn,
  orderId: number | string
): Promise<RefundBreakdown> {
  const res = await runQuery(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE payment_method = 'wallet'), 0)::TEXT           AS wallet_paid,
       COALESCE(SUM(amount) FILTER (WHERE provider IN ('payu', 'cashfree')), 0)::TEXT    AS gateway_paid
     FROM payments
     WHERE order_id = $1 AND status = 'completed'`,
    [orderId]
  )
  const walletPaid  = parseFloat(res.rows[0]?.wallet_paid  || '0')
  const gatewayPaid = parseFloat(res.rows[0]?.gateway_paid || '0')
  return { walletPaid, gatewayPaid, totalRefundable: walletPaid + gatewayPaid }
}

// Cancellation/rejection refunds must never include order-level fees
// (delivery fee, platform/convenience fee, express surcharge, GST on those
// fees) — only the subtotal (which already carries GST on subtotal, folded
// in at order-create time) and net of any coupon discount. Fees are stored
// as order_adjustments rows: kind='delivery_fee', kind='express_fee'
// (express_surcharge), and kind='other' (convenience_fee + fee_gst — see
// feeCodeToKind() in orders/create/route.ts). Coupon rows (kind='coupon',
// negative amount) are deliberately excluded from this sum — that's already
// netted into orders.total_amount, not a fee to strip back out.
//
// Delivery fee is the one exception that isn't always excluded: if the
// order is cancelled before the delivery partner has actually picked it up
// (deliveryFeeRefundable = true), no delivery work happened yet, so it
// refunds along with the subtotal. Once picked up, it's kept like every
// other fee.
//
// Reuses getRefundBreakdown()'s totalRefundable as the starting point (what
// was actually captured — COD's uncollected portion was never charged, so
// there's nothing there to exclude from), then caps it at
// (total_amount - excluded fees). When a split payment (wallet+gateway) has
// to shrink, both legs shrink by the same proportion — there's no reliable
// way to know which leg "paid for" the fee portion, so treating every
// captured rupee as an equal mix of subtotal-and-fees is the fairest
// available assumption.
export async function getCancellationRefund(
  runQuery: QueryFn,
  orderId: number | string,
  totalAmount: number,
  deliveryFeeRefundable: boolean
): Promise<RefundBreakdown & { excludedFees: number }> {
  const breakdown = await getRefundBreakdown(runQuery, orderId)

  const feeRes = await runQuery(
    `SELECT COALESCE(SUM(amount) FILTER (
       WHERE kind IN ('express_fee', 'other') OR (kind = 'delivery_fee' AND NOT $2::BOOLEAN)
     ), 0)::TEXT AS excluded
     FROM order_adjustments
     WHERE order_id = $1`,
    [orderId, deliveryFeeRefundable]
  )
  const excludedFees   = parseFloat(feeRes.rows[0]?.excluded || '0')
  const refundableCap  = Math.max(0, Math.round((totalAmount - excludedFees) * 100) / 100)

  if (breakdown.totalRefundable <= refundableCap) {
    // Nothing captured beyond the refundable cap (e.g. a COD-inclusive order
    // whose captured wallet/online slice never reached the fee portion) —
    // refund everything that was captured, unchanged.
    return { ...breakdown, excludedFees: 0 }
  }

  const ratio       = refundableCap / breakdown.totalRefundable
  const walletPaid  = Math.round(breakdown.walletPaid * ratio * 100) / 100
  const gatewayPaid = Math.round((refundableCap - walletPaid) * 100) / 100
  return {
    walletPaid, gatewayPaid, totalRefundable: walletPaid + gatewayPaid,
    excludedFees: Math.round((breakdown.totalRefundable - refundableCap) * 100) / 100,
  }
}

export async function initiateOriginalMethodRefund(params: {
  orderId: number
  amount: number
  initiatedBy: string | number | null
  initiatedByRole: 'customer' | 'delivery' | 'admin' | 'system'
}): Promise<InitiateRefundResult> {
  const payment = await queryOne<{ id: number; provider: string; amount: string }>(
    `SELECT id, provider, amount FROM payments
     WHERE order_id = $1 AND status = 'completed' AND provider IN ('payu', 'cashfree')
     ORDER BY id DESC LIMIT 1`,
    [params.orderId]
  )
  if (!payment) {
    return { success: false, error: 'No online gateway payment found for this order — use the wallet refund instead.' }
  }

  // The gateway only ever captured this payment row's amount — for a
  // wallet+online split order, that's less than orders.total_amount (the
  // rest came from wallet). Refunding more than was actually captured is
  // rejected by the gateway ("Invalid amount"), so always defer to the
  // captured amount rather than whatever the caller passed in.
  const refundAmount = Math.min(params.amount, parseFloat(payment.amount))

  const gatewayTxn = await queryOne<{ provider_order_id: string | null; provider_payment_id: string | null }>(
    `SELECT provider_order_id, provider_payment_id FROM payment_gateway_transactions
     WHERE payment_id = $1 ORDER BY id DESC LIMIT 1`,
    [payment.id]
  )
  if (!gatewayTxn?.provider_order_id || !gatewayTxn?.provider_payment_id) {
    return { success: false, error: 'Missing gateway transaction details for this payment — cannot initiate a refund.' }
  }

  const gatewayInfo = await getActiveGateway()
  if (!gatewayInfo || gatewayInfo.provider !== payment.provider) {
    return {
      success: false,
      error: `This order was paid via ${payment.provider}, but the currently active gateway is ${gatewayInfo?.provider ?? 'none'}. Refund this manually via the ${payment.provider} dashboard.`,
    }
  }
  if (!gatewayInfo.adapter.initiateRefund) {
    return { success: false, error: `${payment.provider} adapter does not support refunds.` }
  }

  const merchantRefundId = `RF-${params.orderId}-${Date.now()}`

  const result = await gatewayInfo.adapter.initiateRefund({
    gatewayOrderId:   gatewayTxn.provider_order_id,
    gatewayPaymentId: gatewayTxn.provider_payment_id,
    merchantRefundId,
    amount:           refundAmount,
  })

  const inserted = await queryOne<{ id: number }>(
    `INSERT INTO payment_refunds (
       order_id, payment_id, provider, amount,
       initiated_by, initiated_by_role,
       merchant_refund_id, gateway_refund_id,
       status, failure_reason, gateway_response,
       completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
     RETURNING id`,
    [
      params.orderId, payment.id, payment.provider, refundAmount,
      params.initiatedBy, params.initiatedByRole,
      merchantRefundId, result.gatewayRefundId,
      result.status, result.failureReason || null, JSON.stringify(result.rawResponse),
      result.status === 'completed' ? new Date() : null,
    ]
  )

  return { success: result.status !== 'failed', refundId: inserted?.id, status: result.status, error: result.failureReason }
}

export async function checkOriginalMethodRefundStatus(refundId: number): Promise<InitiateRefundResult> {
  const refund = await queryOne<{
    id: number; order_id: number; provider: string; status: string
    merchant_refund_id: string; gateway_refund_id: string | null
  }>(`SELECT id, order_id, provider, status, merchant_refund_id, gateway_refund_id FROM payment_refunds WHERE id = $1`, [refundId])
  if (!refund) return { success: false, error: 'Refund record not found' }
  if (refund.status !== 'processing' && refund.status !== 'pending') {
    return { success: true, refundId: refund.id, status: refund.status }
  }

  const gatewayTxn = await queryOne<{ provider_order_id: string | null }>(
    `SELECT pgt.provider_order_id FROM payment_gateway_transactions pgt
     INNER JOIN payments p ON p.id = pgt.payment_id
     WHERE p.order_id = $1 ORDER BY pgt.id DESC LIMIT 1`,
    [refund.order_id]
  )
  if (!gatewayTxn?.provider_order_id) return { success: false, error: 'Missing gateway order reference' }

  const gatewayInfo = await getActiveGateway()
  if (!gatewayInfo || gatewayInfo.provider !== refund.provider || !gatewayInfo.adapter.checkRefundStatus) {
    return { success: false, error: `Cannot check status — active gateway is not ${refund.provider}` }
  }

  const statusResult = await gatewayInfo.adapter.checkRefundStatus({
    gatewayOrderId:   gatewayTxn.provider_order_id,
    merchantRefundId: refund.merchant_refund_id,
    gatewayRefundId:  refund.gateway_refund_id,
  })

  await query(
    `UPDATE payment_refunds
     SET status = $1::TEXT, gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $2::jsonb,
         completed_at = CASE WHEN $1::TEXT = 'completed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $3`,
    [statusResult.status, JSON.stringify(statusResult.rawResponse), refundId]
  )

  if (statusResult.status === 'completed') {
    await query(`UPDATE orders SET payment_status = 'refunded', updated_at = NOW() WHERE id = $1`, [refund.order_id])
  } else if (statusResult.status === 'failed') {
    await query(`UPDATE orders SET payment_status = 'paid', updated_at = NOW() WHERE id = $1`, [refund.order_id])
  }

  return { success: true, refundId: refund.id, status: statusResult.status }
}

// ---------------------------------------------------------------------------
// What was ACTUALLY refunded for an order — the figure every customer-facing
// surface must quote.
//
// This can't be read off the payments table: cancellation only flips those
// rows to status='refunded' and leaves `amount` at the captured value, so a
// ₹318.88 payment row marked "Refunded" was, under the fees-are-not-refundable
// policy, only refunded ₹300. Reading the row's own amount overstates the
// refund by exactly the retained fees.
//
// The real record lives in two places, mirroring the two ways money goes back:
//   - wallet_transactions credits written by wallet_credit_for_order()
//   - payment_refunds rows for refunds sent to the original payment method
// Gateway refunds count once they're past 'pending' — the money is committed
// at that point even though it takes days to land, which is what the customer
// is told.
export interface RefundedTotals {
  wallet:        number
  gateway:       number
  total:         number
  /** Captured but deliberately not returned — the order fees. */
  feesRetained:  number
}

export async function getRefundedTotals(
  runQuery: QueryFn,
  orderId: number | string
): Promise<RefundedTotals> {
  const [walletRes, gatewayRes, capturedRes] = await Promise.all([
    runQuery(
      `SELECT COALESCE(SUM(amount), 0)::TEXT AS total
         FROM wallet_transactions
        WHERE order_id = $1 AND kind = 'credit'
          AND metadata->>'type' = 'order_cancellation_refund'`,
      [orderId]
    ),
    runQuery(
      `SELECT COALESCE(SUM(amount), 0)::TEXT AS total
         FROM payment_refunds
        WHERE order_id = $1 AND status IN ('processing', 'completed')`,
      [orderId]
    ),
    runQuery(
      `SELECT COALESCE(SUM(amount), 0)::TEXT AS total
         FROM payments
        WHERE order_id = $1 AND status IN ('completed', 'refunded')`,
      [orderId]
    ),
  ])

  const wallet   = parseFloat(walletRes.rows[0]?.total  ?? '0')
  const gateway  = parseFloat(gatewayRes.rows[0]?.total ?? '0')
  const captured = parseFloat(capturedRes.rows[0]?.total ?? '0')
  const total    = wallet + gateway

  return {
    wallet, gateway, total,
    // Never negative: a full refund (e.g. provider rejection, which returns
    // the fees too) leaves nothing retained.
    feesRetained: Math.max(0, Number((captured - total).toFixed(2))),
  }
}
