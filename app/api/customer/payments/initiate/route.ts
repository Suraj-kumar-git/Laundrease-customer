import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, errorResponse } from '@/lib/api-response'
import { decrypt } from '@/lib/encryption'
import { getAuthUser } from '@/lib/auth'

function generatePayUHash(params: {
  key: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  salt: string
}) {
  const hashString =
    `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|||||||||||${params.salt}`

  return crypto.createHash('sha512').update(hashString).digest('hex')
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const method = body?.method
    const walletAmount = Number(body?.wallet_amount || 0)

    if (!method) {
      return errorResponse('Payment method is required')
    }

    const gatewayResult = await query(
      `SELECT provider, api_key_enc, api_secret_enc, config
       FROM payment_gateway_config
       WHERE is_active = TRUE
       LIMIT 1`
    )

    if (!gatewayResult.rowCount) {
      return errorResponse('No active payment gateway configured')
    }

    const gateway = gatewayResult.rows[0]

    if (gateway.provider !== 'payu') {
      return errorResponse('Active payment gateway is not PayU')
    }

    const config = gateway.config ?? {}

    const merchantKey = decrypt(gateway.api_key_enc)
    const merchantSalt = decrypt(gateway.api_secret_enc)

    if (!merchantKey || !merchantSalt) {
      return errorResponse('PayU credentials are missing')
    }

    const user = await getAuthUser(req)

    if (!user) {
      return errorResponse('User not authenticated')
    }

    // Replace this section with your own cart/order summary fetch logic
    const cartResult = await query(
      `SELECT grand_total
       FROM customer_cart_summary
       WHERE user_id = $1
       LIMIT 1`,
      [user.id]
    )

    if (!cartResult.rowCount) {
      return errorResponse('Cart summary not found')
    }

    const grossTotal = Number(cartResult.rows[0].grand_total)
    const finalAmount = Math.max(0, Number((grossTotal - walletAmount).toFixed(2)))

    if (finalAmount <= 0) {
      return errorResponse('Invalid payable amount')
    }

    const txnid = `ORD_${user.id}_${Date.now()}`
    const productinfo = 'Laundry Order'
    const firstname = user.full_name || 'Customer'
    const email = user.email
    const phone = '1234567890' //TODO: Check and update txnid, phone, & firstname

    const amount = finalAmount.toFixed(2)

    const hash = generatePayUHash({
      key: merchantKey,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      salt: merchantSalt,
    })

    const environment = config.environment === 'prod' ? 'prod' : 'sandbox'

    const actionUrl =
      environment === 'prod' ? 'https://secure.payu.in/_payment' : 'https://test.payu.in/_payment'

    const surl =
      config.surl || `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/payments/payu/success`

    const furl =
      config.furl || `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/payments/payu/failure`

    // Recommended: persist payment attempt
    await query(
      `INSERT INTO payments
       (order_id, provider, merchant_txn_id, amount, currency, status, gateway_response, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())`,
      [
        null,
        'payu',
        txnid,
        amount,
        'INR',
        'initiated',
        JSON.stringify({
          method,
          wallet_amount: walletAmount,
          environment,
        }),
      ]
    )

    return successResponse({
      actionUrl,
      fields: {
        key: merchantKey,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        phone,
        surl,
        furl,
        hash,
      },
    })
  } catch (error) {
    console.error('[POST /api/customer/payments/initiate]', error)
    return serverErrorResponse('Failed to initiate payment')
  }
}