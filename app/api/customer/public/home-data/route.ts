// app/api/customer/public/home-data/route.ts
// Public API — no auth required.
// Returns: providers (location-aware), platform stats, testimonials
// Query params:
//   lat, lng  — user location (optional). If provided, returns providers
//               sorted by distance using haversine approximation in SQL.
//               If absent, returns top-rated active providers.
//   limit     — max providers to return (default 8, max 12)

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

// Haversine distance in km (SQL approximation — good enough for city-level sorting)
const HAVERSINE_EXPR = (latParam: number, lngParam: number) => `
  6371 * acos(
    LEAST(1, cos(radians($${latParam})) * cos(radians(lp.latitude))
    * cos(radians(lp.longitude) - radians($${lngParam}))
    + sin(radians($${latParam})) * sin(radians(lp.latitude)))
  )
`

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const latStr = searchParams.get('lat')
  const lngStr = searchParams.get('lng')
  const limit  = Math.min(12, Math.max(1, parseInt(searchParams.get('limit') ?? '8')))

  const lat = latStr ? parseFloat(latStr) : null
  const lng = lngStr ? parseFloat(lngStr) : null
  const hasLocation = lat !== null && lng !== null
    && !isNaN(lat) && !isNaN(lng)
    && lat >= -90 && lat <= 90
    && lng >= -180 && lng <= 180

  try {
    // ---- 1. Providers --------------------------------------------------
    let providersRes
    if (hasLocation) {
      // Location-aware: sort by distance, within ~15km radius
      const distExpr = HAVERSINE_EXPR(1, 2)
      providersRes = await query(
        `SELECT
           lp.id,
           lp.business_name,
           lp.city,
           lp.rating,
           lp.rating_count,
           lp.latitude,
           lp.longitude,
           lp.postal_code,
           -- Profile image if set (S3 key or URL)
           u.profile_image  AS provider_image,
           -- Cheapest per-kg service price as a quick display value
           (
             SELECT MIN(COALESCE(ps.price_override, s.base_price))
             FROM provider_services ps
             JOIN services s ON s.id = ps.service_id
             WHERE ps.provider_id = lp.id
               AND s.price_per_kg IS NOT NULL
           )                AS min_price_kg,
           ROUND(${distExpr}::numeric, 1) AS distance_km
         FROM laundry_profiles lp
         JOIN users u ON u.id = lp.user_id
         WHERE lp.status = 'active'
           AND lp.is_verified = TRUE
           AND lp.latitude IS NOT NULL
           AND lp.longitude IS NOT NULL
           AND ${distExpr} <= 15
         ORDER BY distance_km ASC, lp.rating DESC
         LIMIT $3`,
        [lat, lng, limit]
      )
    } else {
      // No location: top-rated active providers
      providersRes = await query(
        `SELECT
           lp.id,
           lp.business_name,
           lp.city,
           lp.rating,
           lp.rating_count,
           lp.latitude,
           lp.longitude,
           lp.postal_code,
           u.profile_image  AS provider_image,
           (
             SELECT MIN(COALESCE(ps.price_override, s.base_price))
             FROM provider_services ps
             JOIN services s ON s.id = ps.service_id
             WHERE ps.provider_id = lp.id
               AND s.price_per_kg IS NOT NULL
           )                AS min_price_kg,
           NULL::numeric    AS distance_km
         FROM laundry_profiles lp
         JOIN users u ON u.id = lp.user_id
         WHERE lp.status = 'active'
           AND lp.is_verified = TRUE
         ORDER BY lp.rating DESC, lp.rating_count DESC
         LIMIT $1`,
        [limit]
      )
    }

    // ---- 2. Stats (from view) ------------------------------------------
    const statsRow = await queryOne<{
      total_users:    string
      monthly_orders: string
      success_rate:   string
      partner_count:  string
    }>(`SELECT * FROM home_platform_stats`)

    // ---- 3. Testimonials (active, ordered) ----------------------------
    const testimonialsRes = await query(
      `SELECT id, display_name, role, avatar_url, content, rating, is_featured
       FROM platform_testimonials
       WHERE is_active = TRUE
       ORDER BY is_featured DESC, sort_order ASC
       LIMIT 7`
    )

    return successResponse({
      providers: providersRes.rows.map(r => ({
        id:           r.id,
        name:         r.business_name,
        city:         r.city,
        rating:       parseFloat(r.rating) || 0,
        rating_count: r.rating_count || 0,
        image:        r.provider_image ?? null,
        min_price_kg: r.min_price_kg ? parseFloat(r.min_price_kg) : null,
        distance_km:  r.distance_km  ? parseFloat(r.distance_km)  : null,
        postal_code:  r.postal_code,
      })),
      location_used: hasLocation,
      stats: {
        total_users:    parseInt(statsRow?.total_users    ?? '0'),
        monthly_orders: parseInt(statsRow?.monthly_orders ?? '0'),
        success_rate:   parseFloat(statsRow?.success_rate  ?? '100'),
        partner_count:  parseInt(statsRow?.partner_count  ?? '0'),
      },
      testimonials: testimonialsRes.rows,
    })
  } catch (error) {
    console.error('[GET /api/customer/public/home-data]', error)
    return serverErrorResponse('Failed to load home data')
  }
}
