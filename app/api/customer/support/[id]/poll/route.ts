// app/api/customer/support/[id]/poll/route.ts
// GET — lightweight delta fetch: new PUBLIC comments since `after_id`,
// current status, and whether an agent is typing. `id` here is the raw
// serial support_tickets.id (this surface's own convention — every other
// role's ticket routes key by public_id instead).

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getOtherTypers } from '@/lib/support-ticket-typing'
import { successResponse, unauthorizedResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params

  try {
    const ticket = await queryOne<{ status: string }>(
      `SELECT status FROM support_tickets WHERE id = $1 AND reporter_id = $2 AND reporter_role = 'customer'`,
      [id, userId]
    )
    if (!ticket) return notFoundResponse('Ticket not found')

    const afterId = parseInt(req.nextUrl.searchParams.get('after_id') || '0', 10) || 0

    const comments = await query<any>(`
      SELECT
        stc.id,
        stc.body,
        stc.created_at::TEXT,
        u.full_name     AS author_name,
        CASE WHEN u.id::TEXT = $3 THEN 'reporter' ELSE 'agent' END AS author_role
      FROM support_ticket_comments stc
      INNER JOIN users u ON u.id = stc.author_user_id
      WHERE stc.ticket_id = $1 AND stc.is_private = FALSE AND stc.id > $2
      ORDER BY stc.id ASC
    `, [id, afterId, userId])

    const typers = await getOtherTypers(parseInt(id, 10), userId)

    return successResponse({ comments: comments.rows, status: ticket.status, typers })
  } catch (err) {
    console.error('[api/customer/support/[id]/poll] GET error:', err)
    return serverErrorResponse()
  }
}
