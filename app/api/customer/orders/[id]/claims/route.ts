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
import { sendClaimSubmittedEmail } from '@/lib/notifications/email'
import { isNotificationEnabled } from '@/lib/notifications/preferences'

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
              gc.decision_note, gc.created_at, gc.paid_at,
              gc.provider_comment, gc.provider_decided_at,
              lp.business_name AS provider_name
       FROM garment_claims gc
       JOIN orders o ON o.id = gc.order_id
       LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
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

    const order = await queryOne<{
      id: number; status: string; delivered_at: string | null; customer_id: string
      order_number: string; laundry_profile_id: string | null
    }>(
      `SELECT id, status, delivered_at, customer_id::TEXT, order_number, laundry_profile_id::TEXT
       FROM orders WHERE public_id = $1 AND customer_id = $2`,
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

    const item = await queryOne<{ id: number; item_label: string }>(
      `SELECT oi.id, COALESCE(oi.garment_label, pt.name) AS item_label
       FROM order_items oi
       JOIN product_types pt ON pt.id = oi.product_type_id
       WHERE oi.id = $1 AND oi.order_id = $2`,
      [body.order_item_id, orderId]
    )
    if (!item) return errorResponse('Item not found on this order', 404)

    const existingOpen = await queryOne(
      `SELECT id FROM garment_claims
       WHERE order_item_id = $1
         AND status IN ('submitted', 'under_review', 'provider_approved', 'amount_issued')`,
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

    const inserted = await queryOne<{ id: number; public_id: string }>(
      `INSERT INTO garment_claims
         (order_id, order_item_id, customer_id, claim_type, description,
          cleaning_charge_snapshot, cap_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, public_id::TEXT`,
      [orderId, body.order_item_id, userId, body.claim_type, body.description.trim(), cleaningCharge, capAmount]
    )

    // Notify the laundry provider (in-app bell) and the customer (email) —
    // best-effort, never blocks the submission itself.
    try {
      if (order.laundry_profile_id) {
        await query(
          `INSERT INTO laundry_notifications (provider_id, type, title, body, order_id)
           VALUES ($1, 'claim_submitted', 'New item report from a customer',
                   'A customer reported a ' || $2 || ' item (' || $3 || ') on order ' || $4 ||
                   '. Please review and approve or reject it.', $5)`,
          [order.laundry_profile_id, body.claim_type, item.item_label, order.order_number, orderId]
        )
      }
    } catch (e) {
      console.error('[api/customer/orders/[id]/claims] provider notification failed:', e)
    }

    try {
      const cust = await queryOne<{ email: string | null; full_name: string }>(
        `SELECT email, full_name FROM users WHERE id = $1`, [userId]
      )
      if (cust?.email && await isNotificationEnabled(userId, 'orders', 'email')) {
        const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
        sendClaimSubmittedEmail({
          to: cust.email, customerName: cust.full_name,
          orderNumber: order.order_number, itemLabel: item.item_label,
          claimType: body.claim_type,
          claimId: inserted!.public_id,
          orderUrl: `${baseUrl}/customer/orders/${publicId}`,
        }).catch(e => console.error('[api/customer/orders/[id]/claims] claim-submitted email failed:', e))
      }
    } catch (e) {
      console.error('[api/customer/orders/[id]/claims] claim-submitted notify failed:', e)
    }

    return successResponse({
      message: 'Claim submitted — the laundry provider will review it shortly',
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
