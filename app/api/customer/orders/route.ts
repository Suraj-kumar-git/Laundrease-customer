// app/api/customer/orders/route.ts
// GET /api/customer/orders
// Returns paginated list of customer orders with status, provider, amounts.
// Query params: ?page=1&limit=10&status=pending&time_range=30d&payment=cod

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

const TIME_RANGE_DAYS: Record<string, number> = {
  '30d': 30, '3m': 90, '6m': 180,
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { searchParams } = req.nextUrl
  const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
  const limit      = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '10')))
  const status     = searchParams.get('status') // optional filter
  const timeRange  = searchParams.get('time_range') // '30d' | '3m' | '6m'
  const payment    = searchParams.get('payment') // 'cod' | 'online'
  const offset = (page - 1) * limit

  try {
    // Orders awaiting online payment confirmation aren't "placed" yet — an
    // order row exists up front (so it has an id to attach the gateway
    // payment to), but until that payment actually clears, it shouldn't
    // appear as a real order to the customer. COD orders are exempt since
    // they're never online-payment-gated. If the customer retries payment
    // or switches to COD, payment_status/payment_method change and the
    // order becomes visible normally.
    const conditions = [
      'o.customer_id = $1',
      // 'failed', 'cancelled' and 'rejected' orders are always shown to the
      // customer regardless of payment_status — cancelling/rejecting a paid
      // order flips payment_status to 'refunded', which wouldn't match
      // payment_status = 'paid' below. Only the still-pending,
      // payment-not-yet-resolved drafts stay invisible.
      `(o.payment_method LIKE '%cod%' OR o.payment_status = 'paid' OR o.status IN ('failed', 'cancelled', 'rejected'))`,
    ]
    const params: any[] = [userId]
    let pi = 2

    if (status) {
      conditions.push(`o.status = $${pi++}`)
      params.push(status)
    }

    if (timeRange && TIME_RANGE_DAYS[timeRange]) {
      conditions.push(`o.created_at >= NOW() - $${pi++}::INTERVAL`)
      params.push(`${TIME_RANGE_DAYS[timeRange]} days`)
    }

    if (payment === 'cod') {
      conditions.push(`o.payment_method ILIKE '%cod%'`)
    } else if (payment === 'online') {
      conditions.push(`o.payment_method NOT ILIKE '%cod%'`)
    }

    const where = conditions.join(' AND ')

    const [ordersRes, countRes] = await Promise.all([
      query(
        `SELECT
           o.public_id AS id,
           o.order_number,
           o.status,
           o.pickup_date,
           o.pickup_time_slot,
           o.delivery_date,
           o.delivery_time_slot,
           o.is_express,
           o.subtotal,
           o.total_amount,
           o.payment_status,
           o.payment_method,
           o.created_at,
           o.assignment_status,
           lp.business_name  AS provider_name,
           lp.city           AS provider_city,
           -- Quick item summary: count items and services
           (SELECT COUNT(*)  FROM order_items oi  WHERE oi.order_id = o.id)::int AS item_count,
           (SELECT COUNT(*)  FROM order_items oi
            JOIN order_item_services ois ON ois.order_item_id = oi.id
            WHERE oi.order_id = o.id)::int AS service_count
         FROM orders o
         LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
         WHERE ${where}
         ORDER BY o.created_at DESC
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...params, limit, offset]
      ),
      query(
        `SELECT COUNT(*)::int AS total
         FROM orders o
         WHERE ${where}`,
        params
      ),
    ])

    const total      = countRes.rows[0].total
    const totalPages = Math.ceil(total / limit)

    return successResponse({
      orders: ordersRes.rows.map(r => ({
        id:               r.id,
        order_number:     r.order_number,
        status:           r.status,
        pickup_date:      r.pickup_date,
        pickup_time_slot: r.pickup_time_slot,
        delivery_date:    r.delivery_date,
        delivery_time_slot: r.delivery_time_slot,
        is_express:       r.is_express,
        subtotal:         parseFloat(r.subtotal),
        total_amount:     parseFloat(r.total_amount),
        payment_status:   r.payment_status,
        payment_method:   r.payment_method,
        created_at:       r.created_at,
        assignment_status: r.assignment_status,
        provider_name:    r.provider_name,
        provider_city:    r.provider_city,
        item_count:       r.item_count,
        service_count:    r.service_count,
      })),
      pagination: { page, limit, total, total_pages: totalPages },
    })
  } catch (error) {
    console.error('[GET /api/customer/orders]', error)
    return serverErrorResponse('Failed to fetch orders')
  }
}
