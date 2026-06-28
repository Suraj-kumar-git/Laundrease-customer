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

    // The redirect URL needs the order's public_id (UUID) — orders.id is an
    // internal BIGSERIAL the customer-facing routes don't accept.
    let orderPublicId: string | null = null

    await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT p.id, p.order_id, p.amount, p.currency, p.gateway_config_id,
                o.public_id AS order_public_id
         FROM payments p
         LEFT JOIN orders o ON o.id = p.order_id
         WHERE p.merchant_txn_id = $1
         LIMIT 1`,
        [txnid]
      )

      if (paymentResult.rowCount === 0) {
        return
      }

      const payment = paymentResult.rows[0]
      orderPublicId = payment.order_public_id

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
               status = 'failed',
               updated_at = NOW()
           WHERE id = $2`,
          ['failed', payment.order_id]
        )
      }
    })

    return buildRedirect(`/customer/orders/payment/failure?order_id=${orderPublicId ?? ''}`)
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/failure]', error)
    return NextResponse.redirect(
      new URL('/customer/orders/payment/failure?reason=server_error', process.env.NEXT_PUBLIC_CUSTOMER_URL!),
      303
    )
  }
}