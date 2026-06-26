// ============================================================
// app/api/customer/support/route.ts
// GET  — customer's ticket list (paginated + status filter)
// POST — raise a new support ticket (optionally linked to an order)
// ============================================================

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getAutoAssignGroupId } from '@/lib/support-routing'
import {
  successResponse, errorResponse, unauthorizedResponse,
  serverErrorResponse,
} from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const sp       = req.nextUrl.searchParams
    const status   = sp.get('status') || ''
    const category = sp.get('category') || ''
    const page     = Math.max(1, parseInt(sp.get('page') || '1'))
    const limit    = 10
    const offset   = (page - 1) * limit

    const conds: string[] = [`st.reporter_id = $1`, `st.reporter_role = 'customer'`]
    const params: any[]   = [userId]
    let p = 2

    if (status)   { conds.push(`st.status = $${p++}`);   params.push(status) }
    if (category) { conds.push(`st.category = $${p++}`); params.push(category) }

    const where = `WHERE ${conds.join(' AND ')}`

    const [tickets, countRow] = await Promise.all([
      query<any>(`
        SELECT
          st.id,
          st.category,
          stc.display_name  AS category_label,
          stc.icon          AS category_icon,
          st.priority,
          st.status,
          sts.description   AS status_label,
          st.subject,
          st.order_id,
          o.order_number,
          st.created_at::TEXT,
          st.updated_at::TEXT,
          st.first_response_at::TEXT,
          st.resolved_at::TEXT,
          st.sla_breached,
          st.metadata,
          (
            SELECT COUNT(*) FROM support_ticket_comments stc2
            WHERE stc2.ticket_id = st.id AND stc2.is_private = FALSE
          )::INTEGER AS reply_count,
          (
            SELECT COUNT(*) FROM support_ticket_attachments sta
            WHERE sta.ticket_id = st.id
          )::INTEGER AS attachment_count
        FROM support_tickets st
        LEFT JOIN support_ticket_categories stc ON stc.code = st.category
        LEFT JOIN support_ticket_statuses   sts ON sts.code = st.status
        LEFT JOIN orders o ON o.id = st.order_id
        ${where}
        ORDER BY
          CASE WHEN st.status IN ('open','in_progress','reopened') THEN 0 ELSE 1 END ASC,
          st.created_at DESC
        LIMIT $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),

      queryOne<{ total: string }>(`
        SELECT COUNT(*)::TEXT AS total
        FROM support_tickets st
        ${where}
      `, params),
    ])

    const total = parseInt(countRow?.total || '0')

    return successResponse({
      tickets: tickets.rows,
      pagination: {
        page, limit, total,
        total_pages: Math.ceil(total / limit),
        has_next:    page < Math.ceil(total / limit),
      },
    })
  } catch (err) {
    console.error('[api/customer/support] GET error:', err)
    return serverErrorResponse()
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const body: {
      category:      string
      sub_category?: string
      subject:       string
      description:   string
      priority?:     string
      order_id?:     number
    } = await req.json()

    if (!body.category)            return errorResponse('Category is required', 400)
    if (!body.subject?.trim())     return errorResponse('Subject is required', 400)
    if (!body.description?.trim()) return errorResponse('Description is required', 400)
    if (body.description.trim().length < 20)
      return errorResponse('Please provide more detail (at least 20 characters)', 400)

    // Validate category exists and is allowed for the customer role
    const category = await queryOne<{ code: string; default_priority: string | null }>(
      `SELECT code, default_priority FROM support_ticket_categories
       WHERE code = $1 AND is_active = TRUE
         AND (allowed_roles IS NULL OR allowed_roles @> '"customer"'::jsonb)`,
      [body.category]
    )
    if (!category) return errorResponse('Invalid or unavailable category', 400)

    const priority = body.priority || category.default_priority || 'medium'
    const validPriority = await queryOne(
      `SELECT code FROM support_ticket_priorities WHERE code = $1`, [priority]
    )
    if (!validPriority) return errorResponse('Invalid priority', 400)

    // If an order is referenced, verify it actually belongs to this customer
    let orderId: number | null = null
    let orderNumber: string | null = null
    if (body.order_id) {
      const order = await queryOne<{ id: number; order_number: string }>(
        `SELECT id, order_number FROM orders WHERE id = $1 AND customer_id = $2`,
        [body.order_id, userId]
      )
      if (!order) return errorResponse('Order not found', 400)
      orderId = order.id
      orderNumber = order.order_number
    }

    const metadata = {
      role:          'customer',
      sub_category:  body.sub_category || null,
      order_number:  orderNumber,
      source_portal: 'customer_app',
    }

    const assignedGroupId = await getAutoAssignGroupId(body.category, 'customer', body.sub_category)

    const ticket = await queryOne<{ id: number }>(`
      INSERT INTO support_tickets (
        reporter_id, reporter_role, order_id, category, priority,
        status, source, subject, description, metadata, assigned_group_id
      ) VALUES ($1, 'customer', $2, $3, $4, 'open', 'app', $5, $6, $7, $8)
      RETURNING id
    `, [
      userId,
      orderId,
      body.category,
      priority,
      body.subject.trim(),
      body.description.trim(),
      JSON.stringify(metadata),
      assignedGroupId,
    ])

    const ticketId = ticket!.id
    const ticketRef = `#TICKET-${String(ticketId).padStart(5, '0')}`

    return successResponse({
      ticket_id:  ticketId,
      ticket_ref: ticketRef,
      message:    'Support ticket raised. Our team will respond within 24 hours.',
    }, 201)
  } catch (err) {
    console.error('[api/customer/support] POST error:', err)
    return serverErrorResponse()
  }
}
