import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { coupon_code: string; order_amount: number }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const code   = body.coupon_code?.trim().toUpperCase()
  const amount = Number(body.order_amount ?? 0)
  if (!code)             return errorResponse('coupon_code is required', 400)
  if (isNaN(amount))     return errorResponse('order_amount must be a number', 400)

  try {
    // Fetch coupon
    const couponRes = await query(
      `SELECT code, name, description, discount_type, discount_value,
              max_discount, min_order_amount, usage_limit_per_user,
              usage_limit_global, first_order_only, stackable
       FROM coupons
       WHERE UPPER(code) = $1
         AND is_active = TRUE
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at   IS NULL OR ends_at   >= NOW())`,
      [code]
    )

    if (couponRes.rowCount === 0) {
      return successResponse({ valid: false, message: 'Coupon not found or expired' })
    }

    const c = couponRes.rows[0]

    // MOV check
    const minAmt = c.min_order_amount ? parseFloat(c.min_order_amount) : 0
    if (amount < minAmt) {
      const needed = Math.ceil(minAmt - amount)
      return successResponse({
        valid:   false,
        message: `Minimum order value ₹${minAmt} required. Add ₹${needed} more to use this coupon.`,
      })
    }

    // Per-user usage check — a redemption tied to a failed/cancelled order
    // never actually consumed the coupon, so it shouldn't count.
    if (c.usage_limit_per_user) {
      const usedRes = await query(
        `SELECT COUNT(*)::int AS n FROM coupon_redemptions cr
         LEFT JOIN orders o ON o.id = cr.order_id
         WHERE cr.coupon_code = $1 AND cr.user_id = $2
           AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))`,
        [c.code, userId]
      )
      if (usedRes.rows[0].n >= parseInt(c.usage_limit_per_user)) {
        return successResponse({ valid: false, message: 'You have already used this coupon' })
      }
    }

    // BUG 2 FIX: first_order_only — check against actual order history.
    // Orders still awaiting online-payment confirmation (status='pending',
    // payment_status not yet 'paid') aren't "placed" yet — same definition
    // used by the dashboard and orders-list routes — so they don't count.
    if (c.first_order_only) {
      const historyRes = await query(
        `SELECT COUNT(*)::int AS n
         FROM orders
         WHERE customer_id = $1
           AND status NOT IN ('cancelled', 'failed', 'rejected')
           AND (payment_method LIKE '%cod%' OR payment_status = 'paid')`,
        [userId]
      )
      if (historyRes.rows[0].n > 0) {
        return successResponse({
          valid:   false,
          message: 'This coupon is only valid for your first order',
        })
      }
    }

    // Global usage limit
    if (c.usage_limit_global) {
      const globalRes = await query(
        `SELECT COUNT(*)::int AS n FROM coupon_redemptions cr
         LEFT JOIN orders o ON o.id = cr.order_id
         WHERE cr.coupon_code = $1
           AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))`,
        [c.code]
      )
      if (globalRes.rows[0].n >= parseInt(c.usage_limit_global)) {
        return successResponse({ valid: false, message: 'This coupon has reached its usage limit' })
      }
    }

    return successResponse({
      valid:  true,
      coupon: {
        code:           c.code,
        name:           c.name,
        discount_type:  c.discount_type,
        discount_value: parseFloat(c.discount_value),
        max_discount:   c.max_discount ? parseFloat(c.max_discount) : null,
      },
    })
  } catch (err) {
    console.error('[POST /api/customer/coupons/validate]', err)
    return serverErrorResponse('Failed to validate coupon')
  }
}