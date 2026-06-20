import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const orderAmount = parseFloat(req.nextUrl.searchParams.get('order_amount') ?? '0')

  try {
    // Count user's completed non-cancelled orders (for first_order_only check)
    const orderCountRes = await query(
      `SELECT COUNT(*)::int AS completed_count
       FROM orders o
       JOIN order_statuses s ON s.code = o.status
       WHERE o.customer_id = $1
         AND s.is_terminal = TRUE
         AND s.code <> 'cancelled'`,
      [userId]
    )
    const completedOrderCount: number = orderCountRes.rows[0].completed_count

    // Also count active (non-terminal, non-cancelled) orders — FIRST50 locked while any order is in progress
    const activeOrderCountRes = await query(
      `SELECT COUNT(*)::int AS active_count
       FROM orders o
       WHERE o.customer_id = $1
         AND o.status NOT IN ('cancelled', 'completed', 'delivered', 'returned')`,
      [userId]
    )
    const activeOrderCount: number = activeOrderCountRes.rows[0].active_count

    // Total orders ever placed (completed + active, excludes cancelled)
    const anyNonCancelledOrders = completedOrderCount > 0 || activeOrderCount > 0

    // Fetch all active coupons not yet expired
    const couponsRes = await query(
      `SELECT
         c.code, c.name, c.description,
         c.discount_type, c.discount_value, c.max_discount,
         c.min_order_amount, c.usage_limit_per_user, c.first_order_only,
         COALESCE((
           SELECT COUNT(*) FROM coupon_redemptions cr
           WHERE cr.coupon_code = c.code AND cr.user_id = $1
         ), 0)::int AS times_used
       FROM coupons c
       WHERE c.is_active = TRUE
         AND (c.applicable_to_user IS NULL OR c.applicable_to_user = $1)
         AND (c.starts_at IS NULL OR c.starts_at <= NOW())
         AND (c.ends_at   IS NULL OR c.ends_at   >= NOW())
       ORDER BY c.min_order_amount ASC NULLS FIRST`,
      [userId]
    )

    const result = couponsRes.rows.map(c => {
      const minAmt      = c.min_order_amount ? parseFloat(c.min_order_amount) : 0
      const meetsAmount = orderAmount >= minAmt
      const withinLimit = !c.usage_limit_per_user || c.times_used < parseInt(c.usage_limit_per_user)
      const alreadyUsed = c.usage_limit_per_user && c.times_used >= parseInt(c.usage_limit_per_user)

      // BUG 2 FIX: first_order_only coupons are only eligible when:
      // - User has zero completed orders AND zero active orders
      // i.e. this will literally be their first order ever
      const firstOrderEligible = !c.first_order_only || !anyNonCancelledOrders

      const eligible = meetsAmount && withinLimit && firstOrderEligible

      // Compute display discount
      let discountDisplay: string
      if (c.discount_type === 'percent') {
        discountDisplay = `${c.discount_value}% OFF`
        if (c.max_discount) discountDisplay += ` (up to ₹${c.max_discount})`
      } else {
        discountDisplay = `₹${c.discount_value} OFF`
      }

      // Human-readable ineligibility reason (for grayed-out display)
      let ineligible_reason: string | null = null
      if (alreadyUsed) {
        ineligible_reason = 'Already used'
      } else if (c.first_order_only && anyNonCancelledOrders) {
        ineligible_reason = 'First order only'
      } else if (!meetsAmount) {
        const needed = minAmt - orderAmount
        ineligible_reason = `Add ₹${Math.ceil(needed)} more to unlock`
      }

      return {
        code:             c.code,
        name:             c.name,
        description:      c.description,
        discount_type:    c.discount_type,
        discount_value:   parseFloat(c.discount_value),
        max_discount:     c.max_discount ? parseFloat(c.max_discount) : null,
        min_order_amount: minAmt,
        discount_display: discountDisplay,
        eligible,
        ineligible_reason,
      }
    })

    return successResponse({ coupons: result })
  } catch (err) {
    console.error('[GET /api/coupons/available]', err)
    return serverErrorResponse('Failed to fetch coupons')
  }
}