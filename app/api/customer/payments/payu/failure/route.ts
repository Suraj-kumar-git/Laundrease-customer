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
  // 303, not the default 307 — see payu/success/route.ts for why.
  return NextResponse.redirect(new URL(path, getCustomerBaseUrl()), 303)
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const form = new URLSearchParams(rawBody)

    const txnid = String(form.get('txnid') || '')
    const mihpayid = String(form.get('mihpayid') || '')
    const hash = String(form.get('hash') || '')

    if (!txnid) {
      return buildRedirect('/customer/orders/payment/failure?reason=missing_txnid')
    }

    let webhookVerified = false

    try {
      const gatewayInfo = await getActiveGateway()

      if (gatewayInfo && gatewayInfo.provider === 'payu') {
        webhookVerified = gatewayInfo.adapter.verifyWebhook({
          rawBody,
          signature: hash,
          provider: 'payu'
        })
      }
    } catch (error) {
      console.error('[POST /api/customer/payments/payu/failure] verification error', error)
    }

    const gatewayResponse = JSON.stringify({
      ...Object.fromEntries(form.entries()),
      callback_verified: webhookVerified,
    })

    let orderId: number | null = null

    await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT id, order_id, amount, currency, gateway_config_id
         FROM payments
         WHERE merchant_txn_id = $1
         LIMIT 1`,
        [txnid]
      )

      if (paymentResult.rowCount === 0) {
        return
      }

      const payment = paymentResult.rows[0]
      orderId = payment.order_id

      await client.query(
        `UPDATE payments
         SET status = $1,
             provider_txn_id = $2,
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $3::jsonb,
             updated_at = NOW()
         WHERE merchant_txn_id = $4`,
        [
          'failed',
          mihpayid || null,
          gatewayResponse,
          txnid,
        ]
      )

      await client.query(
        `INSERT INTO payment_gateway_transactions (
           payment_id, gateway_config_id, provider, merchant_txn_id,
           provider_order_id, provider_payment_id, provider_txn_id,
           amount, currency, status, response_payload, failed_at
         )
         VALUES ($1, $2, 'payu', $3, $3, $4, $4, $5, $6, 'failed', $7::jsonb, NOW())
         ON CONFLICT (merchant_txn_id) DO UPDATE SET
           provider_payment_id = EXCLUDED.provider_payment_id,
           provider_txn_id     = EXCLUDED.provider_txn_id,
           status              = 'failed',
           response_payload    = COALESCE(payment_gateway_transactions.response_payload, '{}'::jsonb) || EXCLUDED.response_payload,
           failed_at           = COALESCE(payment_gateway_transactions.failed_at, NOW()),
           updated_at          = NOW()`,
        [
          payment.id,
          payment.gateway_config_id,
          txnid,
          mihpayid || null,
          payment.amount,
          payment.currency || 'INR',
          gatewayResponse,
        ]
      )

      if (payment.order_id) {
        await client.query(
          `UPDATE orders
           SET payment_status = $1,
               updated_at = NOW()
           WHERE id = $2`,
          ['failed', payment.order_id]
        )
      }
    })

    return buildRedirect(`/customer/orders/payment/failure?order_id=${orderId ?? ''}`)
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/failure]', error)
    return NextResponse.redirect(
      new URL('/customer/orders/payment/failure?reason=server_error', process.env.NEXT_PUBLIC_CUSTOMER_URL!),
      303
    )
  }
}