// app/api/customer/payments/payu/sdk-hash/route.ts
//
// POST — sign one hash for the PayU CheckoutPro mobile SDK.
//
// Called by the Android app while the native payment sheet is open (see
// lib/payu-native.ts and PayUCheckoutPlugin.java). The merchant salt must never
// reach the device, so the SDK's hash requests come here instead.
//
// The authorisation rules — and why signing whatever arrives would be a
// serious hole — live in lib/payment/payu-sdk-hash.ts. This route's job is to
// establish *whose* payment is being signed for, rebuild the expected payment
// hash from that row, and refuse anything that does not match.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { getActiveGateway } from '@/lib/payment'
import { PayUAdapter } from '@/lib/payment/payu'
import { authoriseSdkHash } from '@/lib/payment/payu-sdk-hash'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { order_id?: string; hashName?: string; hashString?: string; postSalt?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid body', 400, 'INVALID_BODY')
  }

  const { order_id: publicId, hashName, hashString, postSalt } = body
  if (!publicId || !hashName || !hashString) {
    return errorResponse('Missing required fields', 400, 'MISSING_FIELDS')
  }

  try {
    // Ownership first: the order must belong to the caller. Without this the
    // endpoint would sign against anyone's order given its id.
    const orderRes = await query(
      `SELECT o.id, o.order_number, u.full_name, u.email
       FROM orders o
       JOIN users u ON u.id = o.customer_id
       WHERE o.public_id = $1 AND o.customer_id = $2`,
      [publicId, userId]
    )
    if (orderRes.rowCount === 0) return notFoundResponse('Order not found')
    const order = orderRes.rows[0]

    // The live online-payment attempt. Its amount and merchant_txn_id are the
    // only ones we will sign for — both read here, never taken from the body.
    const paymentRes = await query(
      `SELECT amount, merchant_txn_id
       FROM payments
       WHERE order_id = $1 AND provider = 'payu'
         AND status IN ('initiated', 'pending')
       ORDER BY created_at DESC
       LIMIT 1`,
      [order.id]
    )
    if (paymentRes.rowCount === 0) {
      return errorResponse('No payment in progress for this order', 400, 'NO_PAYMENT_ATTEMPT')
    }
    const payment = paymentRes.rows[0]

    const gatewayInfo = await getActiveGateway()
    if (!gatewayInfo || gatewayInfo.provider !== 'payu') {
      return errorResponse('PayU is not the active gateway', 503, 'GATEWAY_INACTIVE')
    }
    const adapter = gatewayInfo.adapter
    if (!(adapter instanceof PayUAdapter)) {
      return errorResponse('PayU is not the active gateway', 503, 'GATEWAY_INACTIVE')
    }

    // Rebuilt from the database, matching the fields the pay route hands the
    // app in checkout_form_fields. If the app passed the SDK anything else,
    // this will not match and the request is refused rather than signed.
    const expectedPaymentPreSalt = adapter.buildPaymentHashPreSalt({
      txnid: payment.merchant_txn_id,
      amount: Number(payment.amount).toFixed(2),
      productinfo: `Order ${order.order_number}`,
      firstname: order.full_name ?? '',
      email: order.email ?? '',
    })

    const decision = authoriseSdkHash({
      hashName,
      hashString,
      merchantKey: adapter.merchantKey,
      expectedPaymentPreSalt,
    })

    if (!decision.ok) {
      // Worth a loud log: a refusal here is either an integration drift or
      // someone probing the endpoint, and both need to be visible.
      console.error(
        '[payu/sdk-hash] refused',
        JSON.stringify({ reason: decision.reason, hashName, userId, order: publicId })
      )
      return errorResponse('Hash request was refused', 403, 'HASH_REFUSED')
    }

    return successResponse({
      hashName,
      hash: adapter.signMobileSdkHash(decision.preSalt, postSalt),
    })
  } catch (error) {
    console.error('[POST /api/customer/payments/payu/sdk-hash]', error)
    return serverErrorResponse('Could not generate hash')
  }
}
