// app/api/customer/support/meta/route.ts
// GET — support lookup data scoped to the customer role:
//   categories (with customer-specific sub-categories), priorities, statuses
// Called once when the support page mounts.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, unauthorizedResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const [categories, priorities, statuses] = await Promise.all([
      query<any>(`
        SELECT
          code,
          display_name,
          icon,
          description,
          COALESCE(sub_categories_by_role->'customer', sub_categories) AS sub_categories,
          default_priority,
          sort_order
        FROM support_ticket_categories
        WHERE is_active = TRUE
          AND (
            allowed_roles IS NULL
            OR allowed_roles @> '"customer"'::jsonb
          )
        ORDER BY sort_order ASC
      `),

      query<any>(`
        SELECT code, description, sort_order, first_response_sla_minutes, resolution_sla_minutes
        FROM support_ticket_priorities
        ORDER BY sort_order ASC
      `),

      query<any>(`
        SELECT code, description, sort_order, is_terminal
        FROM support_ticket_statuses
        ORDER BY sort_order ASC
      `),
    ])

    return successResponse({
      categories: categories.rows,
      priorities: priorities.rows,
      statuses:   statuses.rows,
    })
  } catch (err) {
    console.error('[api/customer/support/meta] GET error:', err)
    return serverErrorResponse()
  }
}
