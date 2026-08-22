// app/api/customer/orders/[id]/call/route.ts
//
// POST { target: 'delivery' | 'laundry' } — ring the customer, then bridge
// them to whichever counterparty they chose.
//
// The customer is the only party who can reach two different people on one
// order, so unlike the partner routes this one needs to be told which.

import { NextRequest } from 'next/server'
import { placeMaskedCall } from '@/lib/telephony/place-call'
import {
  successResponse, errorResponse, unauthorizedResponse, serverErrorResponse,
} from '@/lib/api-response'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id: orderPublicId } = await params

  try {
    const body = await req.json().catch(() => ({})) as { target?: string }
    if (body.target !== 'delivery' && body.target !== 'laundry') {
      return errorResponse('Choose whether to call the laundry or the delivery partner', 400)
    }

    const result = await placeMaskedCall({
      role: 'customer', userId, orderPublicId, target: body.target,
    })
    if (!result.ok) return errorResponse(result.message, result.status)

    return successResponse({
      session_id: result.sessionId,
      message:    `Connecting you to ${result.counterpartyLabel} — your phone will ring first`,
    })
  } catch (err) {
    console.error('[api/customer/orders/[id]/call] POST error:', err)
    return serverErrorResponse()
  }
}
