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
  return NextResponse.redirect(new URL(path, getCustomerBaseUrl()))
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    const form = new URLSearchParams(rawBody)

    const txnid = String(form.get('txnid') || '')
    const mihpayid = String(form.get('mihpayid') || '')
    const hash = String(form.get('hash') || '')

    if (!txnid) {
      return buildRedirect('/checkout?payment=failed&provider=payu&reason=missing_txnid')
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

    await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT id, order_id
         FROM payments
         WHERE merchant_txn_id = $1
         LIMIT 1`,
        [txnid]
      )

      if (paymentResult.rowCount === 0) {
        return
      }

      const payment = paymentResult.rows[0]

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

    return buildRedirect(`/checkout?payment=failed&provider=payu&txnid=${encodeURIComponent(txnid)}`)
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/failure]', error)
    return NextResponse.redirect(
      new URL('/checkout?payment=failed&provider=payu&reason=server_error', process.env.NEXT_PUBLIC_CUSTOMER_URL!)
    )
  }
}