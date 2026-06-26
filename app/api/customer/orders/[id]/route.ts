// app/api/customer/orders/[id]/route.ts
// GET  /api/customer/orders/[id]  — full order detail
// PATCH /api/customer/orders/[id] — reschedule pickup (date + time slot)

import { NextRequest } from 'next/server'
import { query, queryOne, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'
import { RESCHEDULABLE_STATUSES, CANCELLABLE_STATUSES } from '@/lib/order-status'
import { calculateEstimatedDeliveryDate } from '@/lib/delivery-estimate'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId  = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { id } = await params
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) return notFoundResponse('Order not found')

  try {
    // Main order row
    const orderRes = await query(
      `SELECT
         o.id, o.order_number, o.status, o.assignment_status,
         o.pickup_address, o.delivery_address,
         o.pickup_date, o.pickup_time_slot,
         o.delivery_date, o.delivery_time_slot, o.estimated_delivery_date,
         o.delivered_at,
         o.special_instructions, o.is_express,
         o.subtotal, o.tax_amount, o.discount_amount, o.total_amount,
         o.payment_status, o.payment_method,
         o.created_at, o.updated_at,
         -- Provider
         lp.id            AS provider_id,
         lp.business_name AS provider_name,
         lp.address_line1 AS provider_address,
         lp.city          AS provider_city,
         lp.contact_person_phone AS provider_phone,
         -- Delivery partner (if assigned)
         u.full_name      AS delivery_partner_name,
         u.phone          AS delivery_partner_phone
       FROM orders o
       LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
       LEFT JOIN delivery_profiles dp ON dp.id = o.delivery_profile_id
       LEFT JOIN users u  ON u.id = dp.user_id
       WHERE o.id = $1 AND o.customer_id = $2`,
      [orderId, userId]
    )

    if (orderRes.rowCount === 0) return notFoundResponse('Order not found')
    const order = orderRes.rows[0]

    // Order items + services
    const itemsRes = await query(
      `SELECT
         oi.id, oi.quantity, oi.weight_kg, oi.garment_label,
         pt.name          AS product_type_name,
         pt.icon,
         s.id             AS service_id,
         s.name           AS service_name,
         s.category       AS service_category,
         ois.unit_price,
         ois.line_total,
         ois.is_express,
         ois.express_multiplier
       FROM order_items oi
       JOIN product_types pt ON pt.id = oi.product_type_id
       JOIN order_item_services ois ON ois.order_item_id = oi.id
       JOIN services s ON s.id = ois.service_id
       WHERE oi.order_id = $1
       ORDER BY oi.id, s.name`,
      [orderId]
    )

    // Payments
    const paymentsRes = await query(
      `SELECT id, amount, payment_method, provider, status, merchant_txn_id, created_at
       FROM payments WHERE order_id = $1 ORDER BY created_at`,
      [orderId]
    )

    // Adjustments (fees, tax, coupon)
    const adjustmentsRes = await query(
      `SELECT id, kind, amount, note, created_at
       FROM order_adjustments WHERE order_id = $1 ORDER BY created_at`,
      [orderId]
    )

    // Status history
    const historyRes = await query(
      `SELECT osh.status, osh.notes, osh.created_at,
              u.full_name AS changed_by_name
       FROM order_status_history osh
       LEFT JOIN users u ON u.id = osh.updated_by
       WHERE osh.order_id = $1
       ORDER BY osh.created_at ASC`,
      [orderId]
    )

    // Applied coupons
    const couponsRes = await query(
      `SELECT coupon_code, amount_discounted FROM order_coupons WHERE order_id = $1`,
      [orderId]
    )

    // Item-protection claims already filed on this order, plus the policy
    // (cap/window) so the UI can show the right deadline without a second call.
    const claimsRes = await query(
      `SELECT id, order_item_id, claim_type, description, status,
              cleaning_charge_snapshot, cap_amount, compensation_amount,
              decision_note, created_at
       FROM garment_claims WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId]
    )
    const policy = await queryOne<{
      multiplier: string; max_cap_amount: string; claim_window_hours: number; is_active: boolean
    }>(`SELECT multiplier, max_cap_amount, claim_window_hours, is_active FROM item_protection_policy ORDER BY id LIMIT 1`)

    // Can the order be rescheduled / cancelled?
    const canReschedule = RESCHEDULABLE_STATUSES.has(order.status)
    const canCancel     = CANCELLABLE_STATUSES.has(order.status)

    return successResponse({
      order: {
        id:                 order.id,
        order_number:       order.order_number,
        status:             order.status,
        assignment_status:  order.assignment_status,
        pickup_address:     tryParseJson(order.pickup_address),
        delivery_address:   tryParseJson(order.delivery_address),
        pickup_date:        order.pickup_date,
        pickup_time_slot:   order.pickup_time_slot,
        delivery_date:      order.delivery_date,
        delivery_time_slot: order.delivery_time_slot,
        estimated_delivery_date: order.estimated_delivery_date,
        delivered_at:       order.delivered_at,
        special_instructions: order.special_instructions,
        is_express:         order.is_express,
        subtotal:           parseFloat(order.subtotal),
        tax_amount:         parseFloat(order.tax_amount),
        discount_amount:    parseFloat(order.discount_amount),
        total_amount:       parseFloat(order.total_amount),
        payment_status:     order.payment_status,
        payment_method:     order.payment_method,
        created_at:         order.created_at,
        updated_at:         order.updated_at,
        can_reschedule:     canReschedule,
        can_cancel:         canCancel,
        provider: order.provider_id ? {
          id:      order.provider_id,
          name:    order.provider_name,
          address: order.provider_address,
          city:    order.provider_city,
          phone:   order.provider_phone,
        } : null,
        delivery_partner: order.delivery_partner_name ? {
          name:  order.delivery_partner_name,
          phone: order.delivery_partner_phone,
        } : null,
      },
      items:       itemsRes.rows.map(r => ({
        ...r,
        unit_price:         parseFloat(r.unit_price),
        line_total:         parseFloat(r.line_total),
        weight_kg:          r.weight_kg ? parseFloat(r.weight_kg) : null,
      })),
      payments:    paymentsRes.rows.map(r => ({
        ...r, amount: parseFloat(r.amount),
      })),
      adjustments: adjustmentsRes.rows.map(r => ({
        ...r, amount: parseFloat(r.amount),
      })),
      status_history: historyRes.rows,
      coupons:        couponsRes.rows.map(r => ({
        ...r, amount_discounted: parseFloat(r.amount_discounted),
      })),
      claims: claimsRes.rows.map(r => ({
        ...r,
        cleaning_charge_snapshot: parseFloat(r.cleaning_charge_snapshot),
        cap_amount:               parseFloat(r.cap_amount),
        compensation_amount:      r.compensation_amount != null ? parseFloat(r.compensation_amount) : null,
      })),
      item_protection_policy: policy ? {
        multiplier:         parseFloat(policy.multiplier),
        max_cap_amount:     parseFloat(policy.max_cap_amount),
        claim_window_hours: policy.claim_window_hours,
        is_active:          policy.is_active,
      } : null,
    })
  } catch (error) {
    console.error('[GET /api/customer/orders/:id]', error)
    return serverErrorResponse('Failed to fetch order')
  }
}

// PATCH — reschedule
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId  = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { id } = await params
  const orderId = parseInt(id, 10)
  if (isNaN(orderId)) return notFoundResponse('Order not found')

  let body: { pickup_date: string; pickup_time_slot: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.pickup_date)       return errorResponse('pickup_date is required', 400)
  if (!body.pickup_time_slot)  return errorResponse('pickup_time_slot is required', 400)

  // Validate date format and not in the past
  const newDate = new Date(body.pickup_date + 'T00:00:00')
  const today   = new Date(); today.setHours(0, 0, 0, 0)
  if (isNaN(newDate.getTime())) return errorResponse('Invalid pickup_date format', 400)
  if (newDate <= today)         return errorResponse('Pickup date must be in the future', 400)

  try {
    const result = await transaction(async (client) => {
      // Set user context for triggers
      await client.query(`SELECT set_config('app.current_user_id', $1, TRUE)`, [userId])

      // Verify order belongs to user and is reschedulable
      const check = await client.query(
        `SELECT status, laundry_profile_id FROM orders WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
        [orderId, userId]
      )
      if (check.rowCount === 0) throw new Error('NOT_FOUND')
      if (!RESCHEDULABLE_STATUSES.has(check.rows[0].status)) throw new Error('NOT_RESCHEDULABLE')

      // Recompute the estimated delivery date against the new pickup date.
      const itemsRes = await client.query(
        `SELECT ois.service_id, ois.is_express
         FROM order_items oi
         JOIN order_item_services ois ON ois.order_item_id = oi.id
         WHERE oi.order_id = $1`,
        [orderId]
      )
      const estimatedDeliveryDate = await calculateEstimatedDeliveryDate(
        (text, params) => client.query(text, params),
        {
          providerId: check.rows[0].laundry_profile_id,
          pickupDate: body.pickup_date,
          items: itemsRes.rows.map(r => ({ serviceId: r.service_id, isExpress: r.is_express })),
        }
      )

      await client.query(
        `UPDATE orders
         SET pickup_date = $1, pickup_time_slot = $2, estimated_delivery_date = $3, updated_at = NOW()
         WHERE id = $4`,
        [body.pickup_date, body.pickup_time_slot, estimatedDeliveryDate, orderId]
      )

      return {
        pickup_date: body.pickup_date,
        pickup_time_slot: body.pickup_time_slot,
        estimated_delivery_date: estimatedDeliveryDate,
      }
    })

    return successResponse(result)
  } catch (error: any) {
    if (error.message === 'NOT_FOUND')         return notFoundResponse('Order not found')
    if (error.message === 'NOT_RESCHEDULABLE') return errorResponse(
      'This order cannot be rescheduled — it has already been picked up or cancelled', 400
    )
    console.error('[PATCH /api/customer/orders/:id]', error)
    return serverErrorResponse('Failed to reschedule order')
  }
}

function tryParseJson(val: any) {
  if (!val) return val
  try { return typeof val === 'string' ? JSON.parse(val) : val } catch { return val }
}
