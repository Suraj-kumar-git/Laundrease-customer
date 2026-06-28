// app/api/customer/orders/[id]/claims/route.ts
// POST — file an item-protection claim (damaged/lost/stolen) for one item
// on a delivered order. Gated by the policy's claim window and active flag.
// GET  — list claims already filed on this order (status tracking).

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id: publicId } = await params

  try {
    const claims = await query(
      `SELECT gc.id, gc.order_item_id, gc.claim_type, gc.description, gc.photo_urls, gc.status,
              gc.cleaning_charge_snapshot, gc.cap_amount, gc.compensation_amount,
              gc.decision_note, gc.created_at, gc.paid_at
       FROM garment_claims gc
       JOIN orders o ON o.id = gc.order_id
       WHERE o.public_id = $1 AND gc.customer_id = $2
       ORDER BY gc.created_at DESC`,
      [publicId, userId]
    )
    return successResponse({ claims: claims.rows })
  } catch (err) {
    console.error('[api/customer/orders/[id]/claims] GET error:', err)
    return serverErrorResponse()
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id: publicId } = await params

  try {
    const body: {
      order_item_id: number
      claim_type:    'damaged' | 'lost' | 'stolen'
      description:   string
    } = await req.json()

    if (!body.order_item_id) return errorResponse('order_item_id is required', 400)
    if (!['damaged', 'lost', 'stolen'].includes(body.claim_type)) {
      return errorResponse('claim_type must be damaged, lost, or stolen', 400)
    }
    if (!body.description?.trim() || body.description.trim().length < 10) {
      return errorResponse('Please describe what happened (min 10 characters)', 400)
    }

    const policy = await queryOne<{
      multiplier: string; max_cap_amount: string; claim_window_hours: number; is_active: boolean
    }>(`SELECT multiplier, max_cap_amount, claim_window_hours, is_active FROM item_protection_policy ORDER BY id LIMIT 1`)
    if (!policy?.is_active) {
      return errorResponse('Item protection claims are not currently available', 400)
    }

    const order = await queryOne<{ id: number; status: string; delivered_at: string | null; customer_id: string }>(
      `SELECT id, status, delivered_at, customer_id::TEXT FROM orders WHERE public_id = $1 AND customer_id = $2`,
      [publicId, userId]
    )
    if (!order) return notFoundResponse('Order not found')
    const orderId = order.id
    if (!['delivered', 'completed'].includes(order.status) || !order.delivered_at) {
      return errorResponse('Claims can only be filed on a delivered order', 400)
    }

    const deadline = new Date(order.delivered_at)
    deadline.setHours(deadline.getHours() + policy.claim_window_hours)
    if (new Date() > deadline) {
      return errorResponse(`The claim window (${policy.claim_window_hours}h after delivery) for this order has passed`, 400)
    }

    const item = await queryOne<{ id: number }>(
      `SELECT oi.id FROM order_items oi WHERE oi.id = $1 AND oi.order_id = $2`,
      [body.order_item_id, orderId]
    )
    if (!item) return errorResponse('Item not found on this order', 404)

    const existingOpen = await queryOne(
      `SELECT id FROM garment_claims WHERE order_item_id = $1 AND status IN ('submitted', 'under_review')`,
      [body.order_item_id]
    )
    if (existingOpen) return errorResponse('A claim for this item is already in progress', 409)

    const charge = await queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(line_total), 0) AS total FROM order_item_services WHERE order_item_id = $1`,
      [body.order_item_id]
    )
    const cleaningCharge = parseFloat(charge?.total || '0')
    const multiplier     = parseFloat(policy.multiplier)
    const maxCap          = parseFloat(policy.max_cap_amount)
    const capAmount       = Math.min(cleaningCharge * multiplier, maxCap)

    const inserted = await queryOne<{ id: number }>(
      `INSERT INTO garment_claims
         (order_id, order_item_id, customer_id, claim_type, description,
          cleaning_charge_snapshot, cap_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [orderId, body.order_item_id, userId, body.claim_type, body.description.trim(), cleaningCharge, capAmount]
    )

    return successResponse({
      message: 'Claim submitted — our support team will review it shortly',
      id: inserted!.id, cap_amount: capAmount,
    }, 201)
  } catch (err: any) {
    if (err.code === '23505') {
      return errorResponse('A claim for this item is already in progress', 409)
    }
    console.error('[api/customer/orders/[id]/claims] POST error:', err)
    return serverErrorResponse()
  }
}
