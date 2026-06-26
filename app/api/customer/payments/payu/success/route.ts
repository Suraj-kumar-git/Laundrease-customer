import { NextRequest, NextResponse } from 'next/server'
import { transaction } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'

function getCustomerBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_CUSTOMER_URL is not configured')
  }
  return baseUrl
}

function buildRedirect(path: string): NextResponse {
  // 303 (not the default 307) — this callback arrives as a POST from PayU's
  // hosted page, and a 307 would preserve POST on the follow-up request to
  // our own page route. Post/Redirect/Get: force the browser to GET instead.
  return NextResponse.redirect(new URL(path, getCustomerBaseUrl()), 303)
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const form = new URLSearchParams(rawBody)

    const txnid = String(form.get('txnid') || '')
    const status = String(form.get('status') || '')
    const mihpayid = String(form.get('mihpayid') || '')
    const hash = String(form.get('hash') || '')
    const amount = String(form.get('amount') || '')
    const productinfo = String(form.get('productinfo') || '')
    const firstname = String(form.get('firstname') || '')
    const email = String(form.get('email') || '')
    const udf1 = String(form.get('udf1') || '')
    const udf2 = String(form.get('udf2') || '')
    const udf3 = String(form.get('udf3') || '')
    const udf4 = String(form.get('udf4') || '')
    const udf5 = String(form.get('udf5') || '')

    if (!txnid) {
      return buildRedirect('/customer/orders/payment/failure?reason=missing_txnid')
    }

    const gatewayInfo = await getActiveGateway()

    if (!gatewayInfo || gatewayInfo.provider !== 'payu') {
      return buildRedirect(`/customer/orders/payment/failure?reason=payu_not_active`)
    }

    const verification = await gatewayInfo.adapter.verifyPayment({
      gatewayOrderId: txnid,
      gatewayPaymentId: mihpayid,
      signature: hash,
      extra: {
        status,
        amount,
        productinfo,
        firstname,
        email,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
        txnid,
        mihpayid,
      },
    })

    const gatewayResponse = JSON.stringify(Object.fromEntries(form.entries()))

    let orderId: number | null = null

    await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT p.id, p.order_id, p.status, p.amount, p.currency, p.gateway_config_id
         FROM payments p
         WHERE p.merchant_txn_id = $1
         LIMIT 1`,
        [txnid]
      )

      if (paymentResult.rowCount === 0) {
        throw new Error(`Payment not found for merchant_txn_id: ${txnid}`)
      }

      const payment = paymentResult.rows[0]
      orderId = payment.order_id
      const isVerifiedSuccess = verification.verified
      const paymentStatus = isVerifiedSuccess ? 'completed' : 'failed'
      const completedAt = isVerifiedSuccess ? new Date() : null
      const failedAt     = isVerifiedSuccess ? null : new Date()

      await client.query(
        `UPDATE payments
         SET status = $1,
             provider_txn_id = $2,
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $3::jsonb,
             updated_at = NOW()
         WHERE merchant_txn_id = $4`,
        [
          paymentStatus,
          mihpayid || null,
          gatewayResponse,
          txnid,
        ]
      )

      await client.query(
        `INSERT INTO payment_gateway_transactions (
           payment_id, gateway_config_id, provider, merchant_txn_id,
           provider_order_id, provider_payment_id, provider_txn_id,
           amount, currency, status, response_payload,
           completed_at, failed_at
         )
         VALUES ($1, $2, 'payu', $3, $3, $4, $4, $5, $6, $7, $8::jsonb, $9, $10)
         ON CONFLICT (merchant_txn_id) DO UPDATE SET
           provider_payment_id = EXCLUDED.provider_payment_id,
           provider_txn_id     = EXCLUDED.provider_txn_id,
           status              = EXCLUDED.status,
           response_payload    = COALESCE(payment_gateway_transactions.response_payload, '{}'::jsonb) || EXCLUDED.response_payload,
           completed_at = CASE
             WHEN EXCLUDED.status = 'completed' AND payment_gateway_transactions.completed_at IS NULL
             THEN EXCLUDED.completed_at ELSE payment_gateway_transactions.completed_at END,
           failed_at = CASE
             WHEN EXCLUDED.status = 'failed' AND payment_gateway_transactions.failed_at IS NULL
             THEN EXCLUDED.failed_at ELSE payment_gateway_transactions.failed_at END,
           updated_at = NOW()`,
        [
          payment.id,
          payment.gateway_config_id,
          txnid,
          mihpayid || null,
          payment.amount,
          payment.currency || 'INR',
          paymentStatus,
          gatewayResponse,
          completedAt,
          failedAt,
        ]
      )

      if (payment.order_id) {
        await client.query(
          `UPDATE orders
           SET payment_status = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [
            isVerifiedSuccess ? 'paid' : 'failed',
            payment.order_id,
          ]
        )
      }
    })

    if (verification.verified) {
      return buildRedirect(`/customer/orders/payment/success?order_id=${orderId}`)
    }

    return buildRedirect(`/customer/orders/payment/failure?order_id=${orderId}&reason=verification_failed`)
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/success]', error)
    return NextResponse.redirect(
      new URL('/customer/orders/payment/failure?reason=server_error', process.env.NEXT_PUBLIC_CUSTOMER_URL!),
      303
    )
  }
}