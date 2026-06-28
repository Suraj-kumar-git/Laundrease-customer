// app/api/customer/support/[id]/route.ts
// GET  — ticket detail (comments, attachments, status history, tags)
// POST — add a reply to the ticket

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, unauthorizedResponse,
  notFoundResponse, serverErrorResponse,
} from '@/lib/api-response'
import { getSupportAttachmentUrl } from '@/lib/s3'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params

  try {
    const ticket = await queryOne<any>(`
      SELECT
        st.id, st.category, st.priority, st.status,
        st.subject, st.description, st.metadata,
        st.order_id, o.order_number,
        st.sla_breached,
        st.first_response_at::TEXT,
        st.first_response_due_at::TEXT,
        st.resolution_due_at::TEXT,
        st.resolved_at::TEXT,
        st.closed_at::TEXT,
        st.created_at::TEXT, st.updated_at::TEXT,
        stc.display_name AS category_label,
        stc.icon         AS category_icon,
        stp.description  AS priority_label,
        sts.description  AS status_label,
        sts.is_terminal  AS status_is_terminal
      FROM support_tickets st
      LEFT JOIN support_ticket_categories stc ON stc.code = st.category
      LEFT JOIN support_ticket_priorities stp ON stp.code = st.priority
      LEFT JOIN support_ticket_statuses   sts ON sts.code = st.status
      LEFT JOIN orders o ON o.id = st.order_id
      WHERE st.id = $1
        AND st.reporter_id = $2
        AND st.reporter_role = 'customer'
    `, [id, userId])

    if (!ticket) return notFoundResponse('Ticket not found')

    const comments = await query<any>(`
      SELECT
        stc.id,
        stc.body,
        stc.created_at::TEXT,
        u.full_name     AS author_name,
        CASE WHEN u.id::TEXT = $2 THEN 'reporter' ELSE 'agent' END AS author_role
      FROM support_ticket_comments stc
      INNER JOIN users u ON u.id = stc.author_user_id
      WHERE stc.ticket_id = $1 AND stc.is_private = FALSE
      ORDER BY stc.created_at ASC
    `, [id, userId])

    const attachmentRows = await query<any>(`
      SELECT id, filename, content_type, size_bytes, storage_key, created_at::TEXT
      FROM support_ticket_attachments
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [id])

    const attachments = await Promise.all(
      attachmentRows.rows.map(async (a: any) => ({
        ...a,
        url: await getSupportAttachmentUrl(a.storage_key).catch(() => null),
      }))
    )

    const statusHistory = await query<any>(`
      SELECT from_status, to_status, note, created_at::TEXT
      FROM support_ticket_status_history
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `, [id])

    return successResponse({
      ticket,
      comments:       comments.rows,
      attachments,
      status_history: statusHistory.rows,
    })
  } catch (err) {
    console.error('[api/customer/support/[id]] GET error:', err)
    return serverErrorResponse()
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params

  try {
    const body: { body: string } = await req.json()
    if (!body.body?.trim())          return errorResponse('Reply body is required', 400)
    if (body.body.trim().length < 3) return errorResponse('Reply too short', 400)

    const ticket = await queryOne<{ status: string }>(
      `SELECT status FROM support_tickets WHERE id = $1 AND reporter_id = $2 AND reporter_role = 'customer'`,
      [id, userId]
    )
    if (!ticket) return notFoundResponse('Ticket not found')
    if (['closed', 'resolved'].includes(ticket.status)) {
      return errorResponse('Cannot reply to a resolved or closed ticket. Please raise a new ticket if the issue persists.', 400)
    }

    await query(`
      INSERT INTO support_ticket_comments (ticket_id, author_user_id, body, is_private)
      VALUES ($1, $2, $3, FALSE)
    `, [id, userId, body.body.trim()])

    if (ticket.status === 'hold') {
      await query(
        `UPDATE support_tickets SET status = 'reopened', updated_at = NOW() WHERE id = $1`,
        [id]
      )
    }

    return successResponse({ message: 'Reply added' }, 201)
  } catch (err) {
    console.error('[api/customer/support/[id]] POST error:', err)
    return serverErrorResponse()
  }
}
