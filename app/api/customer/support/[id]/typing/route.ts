// app/api/customer/support/[id]/typing/route.ts
// POST — mark the customer as typing a reply. `id` is the raw serial
// support_tickets.id, matching this surface's other routes.

import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { markTyping } from '@/lib/support-ticket-typing'
import { successResponse, unauthorizedResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params

  try {
    const ticket = await queryOne<{ id: number }>(
      `SELECT id FROM support_tickets WHERE id = $1 AND reporter_id = $2 AND reporter_role = 'customer'`,
      [id, userId]
    )
    if (!ticket) return notFoundResponse('Ticket not found')

    await markTyping(ticket.id, userId)
    return successResponse({ ok: true })
  } catch (err) {
    console.error('[api/customer/support/[id]/typing] POST error:', err)
    return serverErrorResponse()
  }
}
