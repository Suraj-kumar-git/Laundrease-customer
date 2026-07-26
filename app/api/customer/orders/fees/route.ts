// app/api/customer/orders/fees/route.ts
// GET /api/customer/orders/fees?subtotal=500&is_express=false&provider_id=123&address_id=456
// Returns all active fee rows calculated for the given subtotal.
// Called by the checkout page to show a live breakdown before placing the order.

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const subtotalStr  = searchParams.get('subtotal')
  const isExpressStr = searchParams.get('is_express')
  const providerIdStr = searchParams.get('provider_id')
  const addressIdStr  = searchParams.get('address_id')

  if (!subtotalStr) return errorResponse('subtotal is required', 400)

  const subtotal        = parseFloat(subtotalStr)
  const isExpress       = isExpressStr === 'true'
  const parsedProviderId = providerIdStr ? parseInt(providerIdStr) : NaN
  const providerId       = isNaN(parsedProviderId) ? null : parsedProviderId
  const parsedAddressId  = addressIdStr ? parseInt(addressIdStr) : NaN
  const addressId        = isNaN(parsedAddressId) ? null : parsedAddressId

  if (isNaN(subtotal) || subtotal < 0) return errorResponse('Invalid subtotal', 400)

  try {
    // Best-effort distance — this route has no hard auth requirement (it's a
    // pre-checkout preview), so ownership is only checked when a userId is
    // present; missing/ungeocoded data just means no distance-based fee
    // adjustment shows in the preview, same as today's behavior.
    let distanceKm: number | null = null
    if (addressId && providerId) {
      const userId = req.headers.get('x-user-id')
      const row = await queryOne<{ distance_km: string | null }>(
        `SELECT haversine_km(ca.latitude, ca.longitude, lp.latitude, lp.longitude)::TEXT AS distance_km
         FROM customer_addresses ca, laundry_profiles lp
         WHERE ca.id = $1 AND lp.id = $2
           AND ($3::BIGINT IS NULL OR ca.customer_profile_id = (
             SELECT id FROM customer_profiles WHERE user_id = $3
           ))`,
        [addressId, providerId, userId]
      )
      distanceKm = row?.distance_km != null ? parseFloat(row.distance_km) : null
    }

    const result = await query(
      `SELECT calculate_order_fees($1, $2, $3, $4) AS fees`,
      [subtotal, isExpress, distanceKm, providerId]
    )

    const fees: Array<{
      code: string
      display_name: string
      charge_type: string
      amount: number
      is_free: boolean
    }> = result.rows[0].fees

    const feesTotal = fees.reduce((s, f) => s + parseFloat(String(f.amount)), 0)
    const total     = Math.max(0, subtotal + feesTotal)

    return successResponse({
      subtotal,
      fees,
      fees_total:  feesTotal,
      grand_total: total,
    })
  } catch (error) {
    console.error('[GET /api/customer/orders/fees]', error)
    return serverErrorResponse('Failed to calculate fees')
  }
}
