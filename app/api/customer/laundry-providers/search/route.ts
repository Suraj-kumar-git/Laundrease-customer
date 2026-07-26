// app/api/customer/laundry-providers/search/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'
import { PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL } from '@/lib/subscription'
import { resolveProfileImageUrl } from '@/lib/s3'

// GET /api/customer/laundry-providers/search
// Query params: ?location=411045 (pincode or city)
// Returns providers serving that area with rating_count

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

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const location = searchParams.get('location')?.trim()

  if (!location) return errorResponse('location query param required', 400)

  try {
    const isPincode = /^\d{5,6}$/.test(location)

    const minPriceKgExpr = `(
      SELECT MIN(COALESCE(ps.price_per_kg_override, ps.price_override, s.price_per_kg, s.base_price))
      FROM provider_services ps
      JOIN services s ON s.id = ps.service_id
      WHERE ps.provider_id = lp.id
        AND s.price_per_kg IS NOT NULL
    )`

    const result = await query(
      isPincode
        ? `SELECT
             lp.id,
             lp.business_name,
             lp.business_address,
             lp.city,
             lp.postal_code,
             lp.service_area,
             lp.rating,
             lp.rating_count,
             lp.capacity,
             lp.certifications,
             lp.services_offered,
             lp.operating_hours,
             lp.is_verified,
             lp.logo_url,
             ${minPriceKgExpr} AS min_price_kg,
             ${NORMALIZED_HOURS_SUBQUERY}
           FROM laundry_profiles lp
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
             lp.id, lp.business_name, lp.business_address, lp.city, lp.postal_code,
             lp.service_area, lp.rating, lp.rating_count, lp.capacity,
             lp.certifications, lp.services_offered, lp.operating_hours, lp.is_verified,
             lp.logo_url,
             ${minPriceKgExpr} AS min_price_kg,
             ${NORMALIZED_HOURS_SUBQUERY}
           FROM laundry_profiles lp
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND ${PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL}
             AND lp.city ILIKE $1
           ORDER BY lp.rating DESC, lp.business_name ASC`,
      [isPincode ? location : `%${location}%`]
    )

    const providers = await Promise.all(result.rows.map(async r => ({
      id: r.id,
      business_name: r.business_name,
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
      min_price_kg: r.min_price_kg ? parseFloat(r.min_price_kg) : null,
      logo_url: await resolveProfileImageUrl(r.logo_url),
    })))

    return successResponse({ providers })
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/search]', error)
    return serverErrorResponse('Failed to fetch providers')
  }
}

// Determine if this is a postal code search (numeric) or location search (text)
// const isPostalCodeSearch = /^\d+$/.test(searchTerm)

// let sql: string
// let params: any[]

// if (isPostalCodeSearch && postal_code) {
//   // Optimized query for postal code search (used in Create Order flow)
//   // This is more specific and faster for exact postal code matching
//   sql = `
//     SELECT DISTINCT
//       lp.id,
//       lp.user_id,
//       lp.business_name,
//       lp.business_address,
//       lp.service_area,
//       lp.capacity,
//       lp.operating_hours,
//       lp.certifications,
//       lp.services_offered,
//       lp.rating,
//       lp.created_at,
//       u.email as contact_email,
//       u.phone as contact_phone,
//       u.status as provider_status
//     FROM laundry_profiles lp
//     INNER JOIN provider_service_areas psa
//       ON psa.provider_id = lp.id
//     INNER JOIN users u
//       ON u.id = lp.user_id
//     WHERE psa.postal_code = $1
//       AND u.status = 'active'
//       AND u.deleted_at IS NULL
//     ORDER BY lp.rating DESC, lp.business_name ASC
//     LIMIT 50
//   `
//   params = [searchTerm]
// } else {
//   // Flexible search query (existing functionality)
//   // Searches by postal code, city, area name, or any location text
//   sql = `
//     SELECT
//       lp.id,
//       lp.user_id,
//       lp.business_name,
//       lp.business_address,
//       lp.service_area,
//       lp.capacity,
//       lp.operating_hours,
//       lp.certifications,
//       lp.services_offered,
//       lp.rating,
//       lp.created_at,
//       u.email as contact_email,
//       u.phone as contact_phone,
//       u.status as provider_status
//     FROM laundry_profiles lp
//     INNER JOIN users u ON lp.user_id = u.id
//     WHERE
//       u.status = 'active'
//       AND u.deleted_at IS NULL
//       AND (
//         -- Search in business address
//         lp.business_address ILIKE '%' || $1 || '%'
//         -- Search in service area
//         OR lp.service_area ILIKE '%' || $1 || '%'
//         -- Search in business name
//         OR lp.business_name ILIKE '%' || $1 || '%'
//         -- Search in provider service areas table
//         OR EXISTS (
//           SELECT 1 FROM provider_service_areas psa
//           WHERE psa.provider_id = lp.id
//           AND (
//             psa.postal_code = $1
//             OR psa.city ILIKE '%' || $1 || '%'
//             OR psa.state ILIKE '%' || $1 || '%'
//           )
//         )
//       )
//     ORDER BY lp.rating DESC, lp.created_at DESC
//     LIMIT 50
//   `
//   params = [searchTerm]
// }