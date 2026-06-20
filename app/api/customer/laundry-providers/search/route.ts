// app/api/customer/laundry-providers/search/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/laundry-providers/search
// Query params: ?location=411045 (pincode or city)
// Returns providers serving that area with rating_count

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const location = searchParams.get('location')?.trim()

  if (!location) return errorResponse('location query param required', 400)

  try {
    const isPincode = /^\d{5,6}$/.test(location)

    const result = await query(
      isPincode
        ? `SELECT DISTINCT
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
             lp.is_verified
           FROM laundry_profiles lp
           JOIN provider_service_areas psa ON psa.provider_id = lp.id
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND psa.is_active = TRUE
             AND psa.postal_code = $1
           ORDER BY lp.rating DESC, lp.business_name ASC`
        : `SELECT
             id, business_name, business_address, city, postal_code,
             service_area, rating, rating_count, capacity,
             certifications, services_offered, operating_hours, is_verified
           FROM laundry_profiles
           WHERE status = 'active'
             AND is_verified = TRUE
             AND city ILIKE $1
           ORDER BY rating DESC, business_name ASC`,
      [isPincode ? location : `%${location}%`]
    )

    return successResponse({
      providers: result.rows.map(r => ({
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
        operating_hours: r.operating_hours ?? {},
        is_verified: r.is_verified,
      })),
    })
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