// app/api/customer/reviews/route.ts
// GET  ?orderId=  — check if review already exists for this order
// POST            — submit a new order review

import { NextRequest } from 'next/server'
import { query, queryOne, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId  = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) return errorResponse('orderId is required', 400)

  try {
    const row = await queryOne(
      `SELECT r.id, r.service_rating, r.delivery_rating, r.overall_rating,
              r.comment, r.is_anonymous, r.status, r.created_at,
              o.laundry_profile_id, o.delivery_profile_id,
              o.status AS order_status,
              lp.business_name AS provider_name,
              u.full_name       AS delivery_partner_name
       FROM orders o
       LEFT JOIN reviews r
         ON r.order_id = o.id AND r.customer_id = $2
       LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
       LEFT JOIN delivery_profiles dp ON dp.id = o.delivery_profile_id
       LEFT JOIN users u ON u.id = dp.user_id
       WHERE o.public_id = $1 AND o.customer_id = $2`,
      [orderId, userId]
    )

    if (!row) return errorResponse('Order not found', 404)

    const canReview = ['delivered', 'completed'].includes(row.order_status)

    return successResponse({
      can_review:             canReview,
      order_status:           row.order_status,
      existing_review:        row.id ? {
        id:              row.id,
        service_rating:  row.service_rating,
        delivery_rating: row.delivery_rating,
        overall_rating:  row.overall_rating,
        comment:         row.comment,
        is_anonymous:    row.is_anonymous,
        status:          row.status,
        created_at:      row.created_at,
      } : null,
      provider_name:          row.provider_name,
      delivery_partner_name:  row.delivery_partner_name,
      has_provider:           !!row.laundry_profile_id,
      has_delivery:           !!row.delivery_profile_id,
    })
  } catch (err) {
    console.error('[GET /api/customer/reviews]', err)
    return serverErrorResponse('Failed to fetch review status')
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: {
    order_id:        string
    service_rating?: number | null
    delivery_rating?:number | null
    overall_rating?: number | null
    comment?:        string | null
    is_anonymous?:   boolean
  }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.order_id) return errorResponse('order_id is required', 400)

  const { service_rating, delivery_rating, overall_rating } = body
  if (!service_rating && !delivery_rating && !overall_rating)
    return errorResponse('At least one rating (service, delivery, or overall) is required', 400)

  const validateRating = (r: number | null | undefined) =>
    r == null || (Number.isInteger(r) && r >= 1 && r <= 5)
  if (!validateRating(service_rating))  return errorResponse('service_rating must be 1–5', 400)
  if (!validateRating(delivery_rating)) return errorResponse('delivery_rating must be 1–5', 400)
  if (!validateRating(overall_rating))  return errorResponse('overall_rating must be 1–5', 400)

  try {
    const result = await transaction(async client => {
      // Verify order belongs to user and is in reviewable state
      const order = await client.query(
        `SELECT id, status, laundry_profile_id, delivery_profile_id, customer_id
         FROM orders WHERE public_id = $1 AND customer_id = $2`,
        [body.order_id, userId]
      )
      if (order.rowCount === 0) throw Object.assign(new Error('NOT_FOUND'), { code: 'NOT_FOUND' })
      const o = order.rows[0]
      if (!['delivered', 'completed'].includes(o.status))
        throw Object.assign(new Error('NOT_REVIEWABLE'), { code: 'NOT_REVIEWABLE' })

      // Upsert review (unique constraint: order_id + customer_id)
      const rev = await client.query(
        `INSERT INTO reviews
           (order_id, customer_id, laundry_profile_id, delivery_profile_id,
            service_rating, delivery_rating, overall_rating, comment, is_anonymous)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (order_id, customer_id) DO UPDATE SET
           service_rating  = EXCLUDED.service_rating,
           delivery_rating = EXCLUDED.delivery_rating,
           overall_rating  = EXCLUDED.overall_rating,
           comment         = EXCLUDED.comment,
           is_anonymous    = EXCLUDED.is_anonymous,
           updated_at      = NOW()
         RETURNING id`,
        [
          o.id, userId,
          o.laundry_profile_id || null,
          o.delivery_profile_id || null,
          service_rating  || null,
          delivery_rating || null,
          overall_rating  || null,
          body.comment    || null,
          body.is_anonymous ?? false,
        ]
      )
      // Trigger handles rating recalculation automatically
      return rev.rows[0]
    })

    return successResponse({ review_id: result.id, saved: true }, 201)
  } catch (err: any) {
    if (err.code === 'NOT_FOUND')      return errorResponse('Order not found', 404)
    if (err.code === 'NOT_REVIEWABLE') return errorResponse('Only delivered or completed orders can be reviewed', 400)
    console.error('[POST /api/customer/reviews]', err)
    return serverErrorResponse('Failed to save review')
  }
}
