// app/api/customer/dashboard/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { resolveProfileImageUrl } from '@/lib/s3'

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')

    if (!userId) {
      return errorResponse('Unauthorized', 401)
    }

    // ---- 1. Customer profile ----------------------------------------
    const profileResult = await query(`
      SELECT
        cp.id            AS customer_profile_id,
        cp.loyalty_points,
        cp.total_orders,
        cp.last_order_at,
        u.full_name,
        u.email,
        u.phone,
        u.profile_image
      FROM customer_profiles cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.user_id = $1
        AND u.deleted_at IS NULL
    `, [userId])

    if (profileResult.rowCount === 0) {
      return errorResponse('Customer profile not found', 404)
    }

    const profile = profileResult.rows[0]
    const customerProfileId = profile.customer_profile_id

    // ---- 2. All addresses (not just default) -------------------------
    // Returned ordered: default first, then by position
    const addressesResult = await query(`
      SELECT
        id,
        label,
        address_line1,
        address_line2,
        landmark,
        city,
        state,
        postal_code,
        is_default,
        contact_name,
        contact_phone,
        instructions
      FROM customer_addresses
      WHERE customer_profile_id = $1
        AND deleted_at IS NULL
      ORDER BY is_default DESC, position ASC
    `, [customerProfileId])

    // ---- 3. Active order (most recent non-terminal) ------------------
    const activeOrderResult = await query(`
      SELECT
        o.id,
        o.public_id,
        o.order_number,
        o.status,
        o.pickup_address,
        o.delivery_address,
        o.pickup_date,
        o.pickup_time_slot,
        o.delivery_date,
        o.delivery_time_slot,
        o.total_amount,
        o.is_express,
        o.created_at,
        o.updated_at,
        lp.business_name AS laundry_name
      FROM orders o
      LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
      WHERE o.customer_id = $1
        AND o.status NOT IN ('delivered', 'completed', 'cancelled', 'returned', 'failed')
        -- Hide orders still awaiting online payment confirmation — see
        -- app/api/customer/orders/route.ts for why.
        AND (o.payment_method LIKE '%cod%' OR o.payment_status = 'paid')
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [userId])

    const activeOrderRow = activeOrderResult.rowCount! > 0
      ? activeOrderResult.rows[0]
      : null

    // ---- 4. Status history for active order -------------------------
    let orderStatusHistory: any[] = []
    if (activeOrderRow) {
      const historyResult = await query(`
        SELECT
          osh.status,
          osh.notes,
          osh.location,
          osh.created_at AS timestamp
        FROM order_status_history osh
        WHERE osh.order_id = $1
        ORDER BY osh.created_at ASC
      `, [activeOrderRow.id])
      orderStatusHistory = historyResult.rows
    }

    // ---- 5. Wallet --------------------------------------------------
    const walletResult = await query(`
      SELECT balance, currency
      FROM wallet_accounts
      WHERE user_id = $1 AND currency = 'INR'
      LIMIT 1
    `, [userId])

    const wallet = walletResult.rowCount! > 0
      ? walletResult.rows[0]
      : { balance: 0, currency: 'INR' }

    // ---- 6. Coupons (global active + user-specific) -----------------
    // Only returns coupons that are currently usable by this customer:
    //   - Active and within date range
    //   - first_order_only: only when user has no non-cancelled paid/COD orders
    //   - usage_limit_per_user: user has not yet reached the per-user cap
    //     (cancelled-order redemptions don't count against the limit)
    const couponsResult = await query(`
      WITH user_order_status AS (
        SELECT EXISTS (
          SELECT 1
          FROM orders o
          WHERE o.customer_id = $1
            AND o.status NOT IN ('cancelled', 'failed', 'rejected')
            AND (o.payment_method LIKE '%cod%' OR o.payment_status = 'paid')
        ) AS has_placed_order
      )
      SELECT
        c.code,
        c.name,
        c.description,
        c.discount_type,
        c.discount_value,
        c.max_discount,
        c.min_order_amount,
        c.usage_limit_per_user,
        c.first_order_only,
        c.ends_at
      FROM coupons c
      CROSS JOIN user_order_status uos
      WHERE c.is_active = TRUE
        AND (c.applicable_to_user IS NULL OR c.applicable_to_user = $1)
        AND (c.starts_at IS NULL OR c.starts_at <= NOW())
        AND (c.ends_at   IS NULL OR c.ends_at   >= NOW())
        -- first_order_only coupons are hidden once the user has a real order in progress
        AND (
          COALESCE(c.first_order_only, FALSE) = FALSE
          OR uos.has_placed_order = FALSE
        )
        -- Per-user usage cap: hide coupon if the user has already redeemed it
        -- (on a non-cancelled order). Cancelled-order redemptions don't count.
        AND (
          c.usage_limit_per_user IS NULL
          OR (
            SELECT COUNT(*)
            FROM coupon_redemptions cr
            LEFT JOIN orders o ON o.id = cr.order_id
            WHERE cr.coupon_code = c.code
              AND cr.user_id = $1
              AND (o.id IS NULL OR o.status NOT IN ('failed', 'cancelled'))
          ) < c.usage_limit_per_user
        )
      ORDER BY c.min_order_amount ASC NULLS FIRST
      LIMIT 10;
    `, [userId])

    // ---- 7. Statistics ----------------------------------------------
    const statsResult = await query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('delivered', 'completed')
        )::int                                              AS completed_orders,
        COUNT(*) FILTER (
          WHERE status NOT IN ('delivered', 'completed', 'cancelled', 'returned', 'failed')
            AND (payment_method LIKE '%cod%' OR payment_status = 'paid')
        )::int                                              AS active_orders,
        COALESCE(
          SUM(total_amount) FILTER (WHERE status IN ('delivered', 'completed')),
          0
        )::numeric                                          AS total_spent
      FROM orders
      WHERE customer_id = $1
    `, [userId])

    const stats = statsResult.rows[0]

    // ---- Build response --------------------------------------------
    return successResponse({
      profile: {
        fullName:     profile.full_name,
        email:        profile.email,
        phone:        profile.phone,
        profileImage: await resolveProfileImageUrl(profile.profile_image),
        loyaltyPoints: parseInt(profile.loyalty_points) || 0,
        totalOrders:   parseInt(profile.total_orders) || 0,
        lastOrderAt:   profile.last_order_at,
      },

      // Full address list — default is first (is_default DESC in query)
      addresses: addressesResult.rows.map(a => ({
        id:           a.id,
        label:        a.label,
        addressLine1: a.address_line1,
        addressLine2: a.address_line2 ?? null,
        landmark:     a.landmark ?? null,
        city:         a.city,
        state:        a.state,
        postalCode:   a.postal_code,
        isDefault:    a.is_default,
        contactName:  a.contact_name ?? null,
        contactPhone: a.contact_phone ?? null,
        instructions: a.instructions ?? null,
      })),

      activeOrder: activeOrderRow ? {
        id:               activeOrderRow.public_id,
        orderNumber:      activeOrderRow.order_number,
        status:           activeOrderRow.status,
        pickupAddress:    activeOrderRow.pickup_address,
        deliveryAddress:  activeOrderRow.delivery_address,
        pickupDate:       activeOrderRow.pickup_date,
        pickupTimeSlot:   activeOrderRow.pickup_time_slot,
        deliveryDate:     activeOrderRow.delivery_date,
        deliveryTimeSlot: activeOrderRow.delivery_time_slot,
        totalAmount:      parseFloat(activeOrderRow.total_amount),
        isExpress:        activeOrderRow.is_express,
        laundryName:      activeOrderRow.laundry_name,
        createdAt:        activeOrderRow.created_at,
        updatedAt:        activeOrderRow.updated_at,
        statusHistory:    orderStatusHistory,
      } : null,

      // recentOrders intentionally removed per requirements

      wallet: {
        balance:  parseFloat(wallet.balance) || 0,
        currency: wallet.currency,
      },

      coupons: couponsResult.rows.map(c => ({
        code:           c.code,
        name:           c.name,
        description:    c.description ?? null,
        discountType:   c.discount_type,
        discountValue:  parseFloat(c.discount_value),
        maxDiscount:    c.max_discount ? parseFloat(c.max_discount) : null,
        minOrderAmount: c.min_order_amount ? parseFloat(c.min_order_amount) : null,
        expiresAt:      c.ends_at ?? null,
        isPersonal:     c.applicable_to_user != null,  // personal = targeted to this user specifically
      })),

      statistics: {
        completedOrders: stats.completed_orders || 0,
        activeOrders:    stats.active_orders || 0,
        totalSpent:      parseFloat(stats.total_spent) || 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/customer/dashboard] Error:', error)
    return errorResponse('Failed to fetch dashboard data', 500)
  }
}