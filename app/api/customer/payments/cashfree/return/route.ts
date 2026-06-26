import { NextRequest, NextResponse } from 'next/server'
import { query, transaction } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'

function getCustomerBaseUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL
  if (!baseUrl) {
    throw new Error('NEXT_PUBLIC_CUSTOMER_URL is not configured')
  }
  return baseUrl
}

function buildRedirect(path: string): NextResponse {
  // 303 — Cashfree's return can arrive as a POST; force the follow-up
  // request to be a GET instead of preserving POST (see PayU success route).
  return NextResponse.redirect(new URL(path, getCustomerBaseUrl()), 303)
}

async function extractCallbackPayload(req: NextRequest): Promise<Record<string, string>> {
  const url = new URL(req.url)
  const payload: Record<string, string> = {}

  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value
  }

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') || ''

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await req.formData()
      for (const [key, value] of formData.entries()) {
        payload[key] = String(value)
      }
    } else if (contentType.includes('application/json')) {
      try {
        const body = await req.json()
        if (body && typeof body === 'object') {
          for (const [key, value] of Object.entries(body)) {
            payload[key] = String(value ?? '')
          }
        }
      } catch {
        // ignore parse errors and continue with query params only
      }
    }
  }

  return payload
}

async function handle(req: NextRequest) {
  try {
    const payload = await extractCallbackPayload(req)

    const merchantTxnId =
      payload.order_id ??
      payload.orderId ??
      ''

    const providerPaymentId =
      payload.cf_payment_id ??
      payload.payment_id ??
      ''

    const providerOrderId =
      payload.cf_order_id ??
      payload.gateway_order_id ??
      ''

    if (!merchantTxnId || !providerPaymentId) {
      return buildRedirect(
        `/customer/orders/payment/failure?reason=${encodeURIComponent('missing_callback_params')}`
      )
    }

    const paymentLookup = await query(
      `SELECT
         p.id,
         p.order_id,
         p.amount,
         p.currency,
         p.status,
         p.provider,
         p.gateway_config_id,
         o.order_number
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.merchant_txn_id = $1
       LIMIT 1`,
      [merchantTxnId]
    )

    if (paymentLookup.rowCount === 0) {
      return buildRedirect(
        `/customer/orders/payment/failure?reason=${encodeURIComponent('payment_not_found')}`
      )
    }

    const payment = paymentLookup.rows[0]

    if (payment.status === 'completed') {
      return buildRedirect(`/customer/orders/payment/success?order_id=${payment.order_id}`)
    }

    const gatewayInfo = await getActiveGateway()

    if (!gatewayInfo || gatewayInfo.provider !== 'cashfree') {
      return buildRedirect(
        `/customer/orders/payment/failure?order_id=${payment.order_id ?? ''}&reason=${encodeURIComponent('cashfree_not_active')}`
      )
    }

    const result = await gatewayInfo.adapter.verifyPayment({
      gatewayOrderId: providerOrderId || merchantTxnId,
      gatewayPaymentId: providerPaymentId,
      signature: '',
      extra: {
        orderId: merchantTxnId,
      },
    })

    const paymentStatus = result.verified ? 'completed' : 'failed'
    const orderPaymentStatus = result.verified ? 'paid' : 'failed'
    const completedAt = result.verified ? new Date() : null
    const failedAt     = result.verified ? null : new Date()

    const responsePayload = {
      callback_source: 'cashfree_return',
      verified: result.verified,
      merchant_txn_id: merchantTxnId,
      provider_payment_id: providerPaymentId,
      provider_order_id: providerOrderId || null,
      ...payload,
    }

    await transaction(async (client) => {
      await client.query(
        `UPDATE payments
         SET status = $1,
             provider = $2,
             provider_txn_id = $3,
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $4::jsonb,
             updated_at = NOW()
         WHERE id = $5`,
        [
          paymentStatus,
          'cashfree',
          providerPaymentId,
          JSON.stringify(responsePayload),
          payment.id,
        ]
      )

      await client.query(
        `INSERT INTO payment_gateway_transactions (
           payment_id,
           gateway_config_id,
           provider,
           merchant_txn_id,
           provider_order_id,
           provider_payment_id,
           provider_txn_id,
           amount,
           currency,
           status,
           response_payload,
           completed_at,
           failed_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
         ON CONFLICT (merchant_txn_id)
         DO UPDATE SET
           gateway_config_id = EXCLUDED.gateway_config_id,
           provider = EXCLUDED.provider,
           provider_order_id = COALESCE(EXCLUDED.provider_order_id, payment_gateway_transactions.provider_order_id),
           provider_payment_id = EXCLUDED.provider_payment_id,
           provider_txn_id = EXCLUDED.provider_txn_id,
           status = EXCLUDED.status,
           response_payload = COALESCE(payment_gateway_transactions.response_payload, '{}'::jsonb) || EXCLUDED.response_payload,
           completed_at = CASE
             WHEN EXCLUDED.status = 'completed' AND payment_gateway_transactions.completed_at IS NULL
             THEN EXCLUDED.completed_at
             ELSE payment_gateway_transactions.completed_at
           END,
           failed_at = CASE
             WHEN EXCLUDED.status = 'failed' AND payment_gateway_transactions.failed_at IS NULL
             THEN EXCLUDED.failed_at
             ELSE payment_gateway_transactions.failed_at
           END,
           updated_at = NOW()`,
        [
          payment.id,
          payment.gateway_config_id,
          'cashfree',
          merchantTxnId,
          providerOrderId || null,
          providerPaymentId,
          providerPaymentId,
          payment.amount,
          payment.currency || 'INR',
          paymentStatus,
          JSON.stringify(responsePayload),
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
          [orderPaymentStatus, payment.order_id]
        )
      }
    })

    if (!result.verified) {
      return buildRedirect(
        `/customer/orders/payment/failure?order_id=${payment.order_id ?? ''}&reason=${encodeURIComponent('verification_failed')}`
      )
    }

    return buildRedirect(`/customer/orders/payment/success?order_id=${payment.order_id}`)
  } catch (error) {
    console.error('[Cashfree return]', error)

    return buildRedirect(
      `/customer/orders/payment/failure?reason=${encodeURIComponent('unexpected_error')}`
    )
  }
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}