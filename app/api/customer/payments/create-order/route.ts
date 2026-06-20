// app/api/customer/payments/create-order/route.ts
import { NextRequest } from 'next/server'
import { getActiveGateway } from '@/lib/payment'
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// POST /api/customer/payments/create-order
// Auth required
// Body: { amount: number, order_number: string, customer_name: string, customer_email: string }
// Creates a gateway order and returns clientKey + gatewayOrderId for frontend

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: {
    amount: number
    order_number: string
    customer_name?: string
    customer_email?: string
    customer_phone?: string
  }

  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid body', 400)
  }

  if (!body.amount || body.amount <= 0) return errorResponse('Invalid amount', 400)
  if (!body.order_number) return errorResponse('order_number required', 400)

  try {
    const gatewayInfo = await getActiveGateway()

    if (!gatewayInfo) {
      return errorResponse('No payment gateway configured. Please contact support.', 503)
    }

    const gatewayOrder = await gatewayInfo.adapter.createOrder({
      amount: body.amount,
      currency: 'INR',
      receipt: body.order_number,
      notes: {
        customer_name: body.customer_name ?? '',
        customer_email: body.customer_email ?? '',
        customer_phone: body.customer_phone ?? '',
        productinfo: `Order ${body.order_number}`,
      },
    })

    return successResponse({
      provider: gatewayInfo.provider,
      sandbox: gatewayInfo.sandbox,
      gateway_order_id: gatewayOrder.gatewayOrderId,
      amount: gatewayOrder.amount,
      currency: gatewayOrder.currency,
      // Razorpay
      client_key: gatewayOrder.clientKey ?? null,
      // Cashfree
      payment_session_id: gatewayOrder.paymentSessionId ?? null,
      // PayU / hosted checkout
      checkout_url: gatewayOrder.checkoutUrl ?? null,
      checkout_method: gatewayOrder.checkoutMethod ?? null,
      checkout_form_fields: gatewayOrder.checkoutFormFields ?? null,
    })
  } catch (error) {
    console.error('[POST /api/customer/payments/create-order]', error)
    return serverErrorResponse('Failed to create payment order')
  }
}
