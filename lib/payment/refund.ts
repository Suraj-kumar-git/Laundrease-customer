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

export async function initiateOriginalMethodRefund(params: {
  orderId: number
  amount: number
  initiatedBy: string | number
  initiatedByRole: 'customer' | 'delivery' | 'admin'
}): Promise<InitiateRefundResult> {
  const payment = await queryOne<{ id: number; provider: string }>(
    `SELECT id, provider FROM payments
     WHERE order_id = $1 AND status = 'completed' AND provider IN ('payu', 'cashfree')
     ORDER BY id DESC LIMIT 1`,
    [params.orderId]
  )
  if (!payment) {
    return { success: false, error: 'No online gateway payment found for this order — use the wallet refund instead.' }
  }

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
    amount:           params.amount,
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
      params.orderId, payment.id, payment.provider, params.amount,
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
     SET status = $1, gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $2::jsonb,
         completed_at = CASE WHEN $1 = 'completed' THEN NOW() ELSE completed_at END,
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
