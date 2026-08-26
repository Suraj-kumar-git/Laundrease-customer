// app/api/customer/dashboard/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { customerVisibleOrderSql } from '@/lib/customer-order-visibility'
import { successResponse, errorResponse } from '@/lib/api-response'
import { resolveProfileImageUrl } from '@/lib/s3'
import { dedupedStatusHistory } from '@/lib/order-status-timeline'

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
        latitude,
        longitude,
        is_default,
        contact_name,
        contact_phone,
        instructions
      FROM customer_addresses
      WHERE customer_profile_id = $1
        AND deleted_at IS NULL
      ORDER BY is_default DESC, position ASC
    `, [customerProfileId])

    // ---- 3. Active orders (every non-terminal order, most recent first) ----
    const activeOrdersResult = await query(`
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
        AND ${customerVisibleOrderSql('o')}
      ORDER BY o.created_at DESC
    `, [userId])
    const activeOrderRows = activeOrdersResult.rows

    // ---- 4. Status history for every active order, batched ----------
    let historyByOrderId = new Map<number, any[]>()
    if (activeOrderRows.length > 0) {
      const historyResult = await query(`
        SELECT
          osh.order_id,
          osh.status,
          osh.notes,
          osh.location,
          osh.created_at AS timestamp
        FROM ${dedupedStatusHistory('osh.order_id = ANY($1)')} osh
        WHERE osh.order_id = ANY($1)
        ORDER BY osh.created_at ASC
      `, [activeOrderRows.map(o => o.id)])
      for (const row of historyResult.rows) {
        const list = historyByOrderId.get(row.order_id) ?? []
        list.push(row)
        historyByOrderId.set(row.order_id, list)
      }
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

    // ---- 7. Statistics ----------------------------------------------
    // (Coupons used to be computed here too, but that duplicated — and had
    // drifted from — the pincode-scoped eligibility logic in
    // /api/customer/coupons/available. The dashboard's "Your Offers" card
    // now calls that endpoint directly instead of getting a second,
    // separately-maintained copy of the same query from here.)
    const statsResult = await query(`
      SELECT
        COUNT(*) FILTER (
          WHERE status IN ('delivered', 'completed')
        )::int                                              AS completed_orders,
        COUNT(*) FILTER (
          WHERE status NOT IN ('delivered', 'completed', 'cancelled', 'returned', 'failed')
            AND ${customerVisibleOrderSql('orders')}
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
        latitude:     a.latitude  ?? null,
        longitude:    a.longitude ?? null,
        isDefault:    a.is_default,
        contactName:  a.contact_name ?? null,
        contactPhone: a.contact_phone ?? null,
        instructions: a.instructions ?? null,
      })),

      activeOrders: activeOrderRows.map(row => ({
        id:               row.public_id,
        orderNumber:      row.order_number,
        status:           row.status,
        pickupAddress:    row.pickup_address,
        deliveryAddress:  row.delivery_address,
        pickupDate:       row.pickup_date,
        pickupTimeSlot:   row.pickup_time_slot,
        deliveryDate:     row.delivery_date,
        deliveryTimeSlot: row.delivery_time_slot,
        totalAmount:      parseFloat(row.total_amount),
        isExpress:        row.is_express,
        laundryName:      row.laundry_name,
        createdAt:        row.created_at,
        updatedAt:        row.updated_at,
        statusHistory:    historyByOrderId.get(row.id) ?? [],
      })),

      // recentOrders intentionally removed per requirements

      wallet: {
        balance:  parseFloat(wallet.balance) || 0,
        currency: wallet.currency,
      },

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