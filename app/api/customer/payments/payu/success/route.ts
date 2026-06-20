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
      return buildRedirect('/checkout?payment=failed&provider=payu&reason=missing_txnid')
    }

    const gatewayInfo = await getActiveGateway()

    if (!gatewayInfo || gatewayInfo.provider !== 'payu') {
      return buildRedirect(`/checkout?payment=failed&provider=payu&txnid=${encodeURIComponent(txnid)}&reason=payu_not_active`)
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

    await transaction(async (client) => {
      const paymentResult = await client.query(
        `SELECT id, order_id, status
         FROM payments
         WHERE merchant_txn_id = $1
         LIMIT 1`,
        [txnid]
      )

      if (paymentResult.rowCount === 0) {
        throw new Error(`Payment not found for merchant_txn_id: ${txnid}`)
      }

      const payment = paymentResult.rows[0]
      const isVerifiedSuccess = verification.verified

      await client.query(
        `UPDATE payments
         SET status = $1,
             provider_txn_id = $2,
             gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $3::jsonb,
             updated_at = NOW()
         WHERE merchant_txn_id = $4`,
        [
          isVerifiedSuccess ? 'completed' : 'failed',
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
          [
            isVerifiedSuccess ? 'paid' : 'failed',
            payment.order_id,
          ]
        )
      }
    })

    if (verification.verified) {
      return buildRedirect(`/order/success?provider=payu&txnid=${encodeURIComponent(txnid)}&payment_id=${encodeURIComponent(mihpayid)}`)
    }

    return buildRedirect(`/checkout?payment=failed&provider=payu&txnid=${encodeURIComponent(txnid)}&reason=verification_failed`)
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/success]', error)
    return NextResponse.redirect(
      new URL('/checkout?payment=failed&provider=payu&reason=server_error', process.env.NEXT_PUBLIC_CUSTOMER_URL!)
    )
  }
}