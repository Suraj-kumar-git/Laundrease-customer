// app/api/customer/laundry-providers/search/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { providerServiceNamesSql } from '@/lib/provider-service-names'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'
import { PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL } from '@/lib/subscription'
import { resolveProfileImageUrl } from '@/lib/s3'
import { getGstRate, applyGst } from '@/lib/gst'
import { DeliveryFeePreview } from '@/types/order-types'

// GET /api/customer/laundry-providers/search
// Query params: ?location=411045 (pincode or city), optional &lat=&lng=
// Returns providers serving that area with rating_count. When lat/lng are
// given (the customer's selected pickup address, or their live geolocation),
// each provider also gets distance_km and a delivery_fee_preview — see
// deriveFeePreview() below for how that's derived without a real subtotal.

const SHORT_TO_FULL: Record<string, string> = {
  sun: 'sunday', mon: 'monday', tue: 'tuesday', wed: 'wednesday',
  thu: 'thursday', fri: 'friday', sat: 'saturday',
}

// Normalise operating hours to { monday: { open, close } | 'closed', ... }.
// Accepts either the normalized form (already full names from provider_operating_hours
// subquery) or the legacy registration form (3-letter keys with a `closed` boolean).
function normalizeOperatingHours(hours: any): Record<string, { open: string; close: string } | 'closed'> {
  if (!hours || typeof hours !== 'object') return {}
  const result: Record<string, { open: string; close: string } | 'closed'> = {}
  for (const [key, val] of Object.entries(hours)) {
    const fullName = SHORT_TO_FULL[key.toLowerCase()] ?? key
    if (val === 'closed') {
      result[fullName] = 'closed'
    } else if (typeof val === 'object' && val !== null) {
      const v = val as any
      if (v.closed === true) {
        result[fullName] = 'closed'
      } else {
        result[fullName] = { open: v.open ?? v.open_time ?? '09:00', close: v.close ?? v.close_time ?? '18:00' }
      }
    }
  }
  return result
}

// Subquery: build normalized hours from provider_operating_hours table.
// Returns null if no rows exist for that provider (falls back to legacy column).
const NORMALIZED_HOURS_SUBQUERY = `(
  SELECT json_object_agg(
    CASE day_of_week
      WHEN 0 THEN 'sunday'  WHEN 1 THEN 'monday' WHEN 2 THEN 'tuesday'
      WHEN 3 THEN 'wednesday' WHEN 4 THEN 'thursday'
      WHEN 5 THEN 'friday'  WHEN 6 THEN 'saturday'
    END,
    CASE WHEN is_closed THEN to_json('closed'::text)
         ELSE json_build_object('open', open_time::text, 'close', close_time::text)
    END
  )
  FROM provider_operating_hours
  WHERE provider_id = lp.id
) AS normalized_hours`

// Derives the 3-state delivery-fee badge from two calculate_order_fees()
// calls (never re-deriving the MOV/radius logic here) — see
// scripts/48-fix-delivery-fee-below-mov-surcharge.sql for what these
// amounts actually encode. `low` = fee at subtotal 0 (MOV definitely not
// met — the provider's flat below-MOV fee, beyond the free radius), `high`
// = fee at the smallest subtotal that guarantees the MOV is met (the
// distance-only surcharge, beyond the free radius). These are now two
// independent tiers, NOT a monotonic floor/ceiling — a provider's flat fee
// and per-km surcharge are set independently, so `high` can be either
// smaller or larger than `low`. For the 'fee' state we report
// max(low, high): a safe upper bound that never understates what the
// customer might actually be charged, whichever tier they end up in.
function deriveFeePreview(low: string | null, high: string | null, freeAbove: string | null): DeliveryFeePreview | null {
  if (low == null || high == null) return null // delivery_fee code inactive — nothing to show
  const lowN = parseFloat(low), highN = parseFloat(high)
  if (highN === 0 && lowN === 0) return { state: 'free', amount: 0, free_above_amount: null }
  if (highN === 0) return { state: 'free_above', amount: lowN, free_above_amount: freeAbove != null ? parseFloat(freeAbove) : null }
  return { state: 'fee', amount: Math.max(lowN, highN), free_above_amount: null }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const location = searchParams.get('location')?.trim()
  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')

  if (!location) return errorResponse('location query param required', 400)

  const lat = latStr ? parseFloat(latStr) : null
  const lng = lngStr ? parseFloat(lngStr) : null
  const hasLocation = lat !== null && lng !== null
    && !isNaN(lat) && !isNaN(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180

  try {
    const isPincode = /^\d{5,6}$/.test(location)

    const minPriceKgExpr = `(
      SELECT MIN(COALESCE(ps.price_per_kg_override, ps.price_override, s.price_per_kg, s.base_price))
      FROM provider_services ps
      JOIN services s ON s.id = ps.service_id
      WHERE ps.provider_id = lp.id
        AND s.price_per_kg IS NOT NULL
    )`

    // $2/$3 (lat/lng) only ever appear in the SQL text when hasLocation is
    // true, kept in exact sync with the params array built below.
    const distanceKmExpr = `ROUND(haversine_km($2, $3, lp.latitude, lp.longitude)::numeric, 1)`

    const distanceSelectCol = hasLocation ? `${distanceKmExpr} AS distance_km,` : `NULL::numeric AS distance_km,`

    const feeSelectCols = hasLocation ? `
             fee_low.amount  AS delivery_fee_low,
             fee_high.amount AS delivery_fee_high,
             COALESCE(lp.free_delivery_above_override, cfg.free_above_amount) AS free_above_amount,` : ''

    const feeJoinsSQL = hasLocation ? `
           LEFT JOIN order_fee_config cfg ON cfg.code = 'delivery_fee' AND cfg.is_active = TRUE
           LEFT JOIN LATERAL (
             SELECT (elem->>'amount')::numeric AS amount
             FROM jsonb_array_elements(calculate_order_fees(0, FALSE, ${distanceKmExpr}, lp.id)) elem
             WHERE elem->>'code' = 'delivery_fee'
           ) fee_low ON TRUE
           LEFT JOIN LATERAL (
             SELECT (elem->>'amount')::numeric AS amount
             FROM jsonb_array_elements(
               calculate_order_fees(COALESCE(lp.free_delivery_above_override, cfg.free_above_amount, 0) + 1, FALSE, ${distanceKmExpr}, lp.id)
             ) elem WHERE elem->>'code' = 'delivery_fee'
           ) fee_high ON TRUE` : ''

    const result = await query(
      isPincode
        ? `SELECT
             lp.id,
             lp.business_name,
             -- Which shop of this business. Two branches are two rows here,
             -- with their own pin, fee and rating; this is what tells them
             -- apart on screen.
             lp.branch_name,
             lp.business_address,
             lp.city,
             lp.postal_code,
             lp.service_area,
             lp.rating,
             lp.rating_count,
             lp.capacity,
             lp.certifications,
             ${providerServiceNamesSql()},
             lp.operating_hours,
             lp.is_verified,
             lp.logo_url,
             lp.has_gst,
             lp.gst_inclusive_pricing,
             ${minPriceKgExpr} AS min_price_kg,
             ${distanceSelectCol}${feeSelectCols}
             ${NORMALIZED_HOURS_SUBQUERY}
           FROM laundry_profiles lp
           ${feeJoinsSQL}
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND ${PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL}
             AND EXISTS (
               SELECT 1 FROM provider_service_areas psa
               WHERE psa.provider_id = lp.id
                 AND psa.is_active   = TRUE
                 AND psa.postal_code = $1
             )
           ORDER BY lp.rating DESC, lp.business_name ASC`
        : `SELECT
             lp.id, lp.business_name, lp.branch_name, lp.business_address, lp.city, lp.postal_code,
             lp.service_area, lp.rating, lp.rating_count, lp.capacity,
             lp.certifications, ${providerServiceNamesSql()},
             lp.operating_hours, lp.is_verified,
             lp.logo_url,
             ${minPriceKgExpr} AS min_price_kg,
             ${distanceSelectCol}${feeSelectCols}
             ${NORMALIZED_HOURS_SUBQUERY}
           FROM laundry_profiles lp
           ${feeJoinsSQL}
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND ${PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL}
             AND lp.city ILIKE $1
           ORDER BY lp.rating DESC, lp.business_name ASC`,
      hasLocation
        ? [isPincode ? location : `%${location}%`, lat, lng]
        : [isPincode ? location : `%${location}%`]
    )

    // Teaser price shown before a customer opens a provider — must match
    // what they'll actually see once they get to the shopping flow (see
    // app/api/customer/laundry-providers/[id]/services/route.ts).
    const anyGstInclusive = result.rows.some(r => r.has_gst && r.gst_inclusive_pricing)
    const gstRate = anyGstInclusive ? await getGstRate() : 0

    const providers = await Promise.all(result.rows.map(async r => {
      const gstInclusive = r.has_gst && r.gst_inclusive_pricing
      return {
      id: r.id,
      business_name: r.business_name,
      branch_name: r.branch_name ?? null,
      business_address: r.business_address,
      city: r.city,
      postal_code: r.postal_code,
      service_area: r.service_area,
      rating: parseFloat(r.rating),
      rating_count: parseInt(r.rating_count) || 0,
      capacity: r.capacity,
      certifications: r.certifications ?? [],
      services_offered: r.services_offered ?? [],
      operating_hours: normalizeOperatingHours(r.normalized_hours ?? r.operating_hours),
      is_verified: r.is_verified,
      min_price_kg: r.min_price_kg
        ? (gstInclusive ? applyGst(parseFloat(r.min_price_kg), gstRate) : parseFloat(r.min_price_kg))
        : null,
      logo_url: await resolveProfileImageUrl(r.logo_url),
      distance_km: r.distance_km != null ? parseFloat(r.distance_km) : null,
      delivery_fee_preview: hasLocation ? deriveFeePreview(r.delivery_fee_low, r.delivery_fee_high, r.free_above_amount) : null,
      }
    }))

    return successResponse({ providers })
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/search]', error)
    return serverErrorResponse('Failed to fetch providers')
  }
}
