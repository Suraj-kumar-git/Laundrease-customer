import { errorResponse, successResponse, serverErrorResponse } from '@/lib/api-response'
import { getActiveGateway } from '@/lib/payment'
import { NextRequest } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const rawBody = await req.text()

  try {
    const gatewayInfo = await getActiveGateway()

    if (!gatewayInfo || gatewayInfo.provider !== provider) {
      return errorResponse('Invalid provider', 400)
    }

    let signature = ''

    if (provider === 'razorpay') {
      signature = req.headers.get('x-razorpay-signature') ?? ''
    } else if (provider === 'cashfree') {
      signature = req.headers.get('x-webhook-signature') ?? ''
    } else if (provider === 'payu') {
      signature = ''
    }

    const verified = gatewayInfo.adapter.verifyWebhook({
      rawBody,
      signature,
      provider: gatewayInfo.provider
    })

    if (!verified) {
      return errorResponse('Invalid webhook signature', 400)
    }

    // TODO:
    // 1. parse payload
    // 2. find order/payment row
    // 3. update payment status idempotently
    // 4. store raw webhook payload for audit/debugging

    return successResponse({ ok: true })
  } catch (error) {
    console.error('[payment webhook]', error)
    return serverErrorResponse('Webhook handling failed')
  }
}