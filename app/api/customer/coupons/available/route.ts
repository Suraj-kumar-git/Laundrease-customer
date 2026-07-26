import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const orderAmount = parseFloat(req.nextUrl.searchParams.get('order_amount') ?? '0')
  const providerIdStr = req.nextUrl.searchParams.get('provider_id')
  const providerId = providerIdStr ? parseInt(providerIdStr) : null

  try {
    // Fetch all active coupons not yet expired — both platform-wide
    // (laundry_profile_id IS NULL) and provider-owned ones. Provider-owned
    // coupons are always included here (never filtered out by provider
    // selection) — the frontend shows them with an eligible/ineligible_reason
    // so the customer sees "only valid with Provider B" rather than the
    // coupon silently vanishing when a different provider is selected.
    const couponsRes = await query(
      `SELECT
         c.code, c.name, c.description,
         c.discount_type, c.discount_value, c.max_discount,
         c.min_order_amount, c.usage_limit_per_user, c.first_order_only,
         c.laundry_profile_id, lp.business_name AS provider_name,
         COALESCE((
           SELECT COUNT(*) FROM coupon_redemptions cr
           LEFT JOIN orders o ON o.id = cr.order_id
           WHERE cr.coupon_code = c.code AND cr.user_id = $1
             AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))
         ), 0)::int AS times_used,
         -- "Has this customer already placed an order" scoped to the
         -- coupon's own provider (NULL laundry_profile_id => platform-wide).
         EXISTS (
           SELECT 1 FROM orders o
           WHERE o.customer_id = $1
             AND o.status NOT IN ('cancelled', 'failed', 'rejected')
             AND (o.payment_method LIKE '%cod%' OR o.payment_status = 'paid')
             AND (c.laundry_profile_id IS NULL OR o.laundry_profile_id = c.laundry_profile_id)
         ) AS has_placed_order_scoped
       FROM coupons c
       LEFT JOIN laundry_profiles lp ON lp.id = c.laundry_profile_id
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

      // BUG 2 FIX: first_order_only coupons are only eligible when the
      // customer has never placed an order with this coupon's own provider
      // (or anywhere, for a platform-wide coupon).
      const firstOrderEligible = !c.first_order_only || !c.has_placed_order_scoped

      // Provider-scoped coupon: eligible only once that exact provider is
      // selected. A platform-wide coupon (laundry_profile_id null) always matches.
      const providerMatches = c.laundry_profile_id == null
        || (providerId != null && Number(c.laundry_profile_id) === providerId)

      const eligible = meetsAmount && withinLimit && firstOrderEligible && providerMatches

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
      } else if (!providerMatches) {
        ineligible_reason = `Only valid for orders with ${c.provider_name ?? 'this provider'}`
      } else if (c.first_order_only && c.has_placed_order_scoped) {
        ineligible_reason = c.laundry_profile_id
          ? `First order with ${c.provider_name ?? 'this provider'} only`
          : 'First order only'
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
        provider_id:      c.laundry_profile_id ?? null,
        provider_name:    c.provider_name ?? null,
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