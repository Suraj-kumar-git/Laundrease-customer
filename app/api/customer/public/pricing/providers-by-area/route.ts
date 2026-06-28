import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from '@/lib/api-response'
import { PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL } from '@/lib/subscription'

// GET /api/customer/public/pricing/providers-by-area
// Public — no auth required
//
// Query params (one required):
//   ?pincode=411045
//   ?city=Pune
//
// Returns providers in that area with contact details visible to public.
// We only expose: business_name, city, postal_code, rating,
//   services_offered, contact_person_name, contact_person_phone,
//   address_line1, landmark
// We deliberately do NOT expose: bank details, documents, exact coordinates.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const pincode = searchParams.get('pincode')?.trim()
  const city = searchParams.get('city')?.trim()

  if (!pincode && !city) {
    return errorResponse('Provide pincode or city query parameter', 400)
  }

  try {
    const result = await query<{
      id: number
      business_name: string
      city: string | null
      postal_code: string | null
      rating: number
      services_offered: string[] | null
      contact_person_name: string | null
      contact_person_phone: string | null
      address_line1: string | null
      landmark: string | null
    }>(
      pincode
        ? `SELECT DISTINCT
             lp.id,
             lp.business_name,
             lp.city,
             lp.postal_code,
             lp.rating,
             lp.services_offered,
             lp.contact_person_name,
             lp.contact_person_phone,
             lp.address_line1,
             lp.landmark
           FROM laundry_profiles lp
           JOIN provider_service_areas psa ON psa.provider_id = lp.id
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND ${PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL}
             AND psa.is_active = TRUE
             AND psa.postal_code = $1
           ORDER BY lp.rating DESC, lp.business_name ASC`
        : `SELECT
             lp.id, lp.business_name, lp.city, lp.postal_code, lp.rating,
             lp.services_offered, lp.contact_person_name, lp.contact_person_phone,
             lp.address_line1, lp.landmark
           FROM laundry_profiles lp
           WHERE lp.status = 'active'
             AND lp.is_verified = TRUE
             AND ${PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL}
             AND lp.city ILIKE $1
           ORDER BY lp.rating DESC, lp.business_name ASC`,
      [pincode ?? `%${city}%`]
    )

    const cityName =
      result.rows[0]?.city ??
      (pincode ? null : city) ??
      null

    return successResponse({
      covered: result.rows.length > 0,
      pincode: pincode ?? '',
      city: cityName,
      providers: result.rows.map((r) => ({
        ...r,
        rating: Number(r.rating),
      })),
    })
  } catch (error) {
    console.error('[GET /api/customer/public/pricing/providers-by-area]', error)
    return serverErrorResponse('Failed to fetch providers')
  }
}
