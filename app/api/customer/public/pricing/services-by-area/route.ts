import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
} from '@/lib/api-response'

// GET /api/customer/public/pricing/services-by-area
// Public — no auth required
//
// Query params (one required):
//   ?pincode=411045
//   ?city=Pune
//
// Returns:
//   - covered: boolean — whether we have active providers in this area
//   - provider_count: number
//   - services: ServiceWithProducts[] — only services offered by providers in that area
//     Each service includes product_types with base pricing
//
// Pricing resolution order (cheapest wins for display):
//   1. provider_product_service_prices (provider override for this product+service)
//   2. product_service_prices (platform base price)
// We show the platform base price — provider-specific overrides are shown
// only after a provider is selected in the actual order flow.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const pincode = searchParams.get('pincode')?.trim()
  const city = searchParams.get('city')?.trim()

  if (!pincode && !city) {
    return errorResponse('Provide pincode or city query parameter', 400)
  }

  try {
    // ---- Step 1: Find active providers in this area ---------
    const providerQuery = pincode
      ? `SELECT DISTINCT lp.id, lp.city
         FROM laundry_profiles lp
         JOIN provider_service_areas psa ON psa.provider_id = lp.id
         WHERE lp.status = 'active'
           AND lp.is_verified = TRUE
           AND psa.is_active = TRUE
           AND psa.postal_code = $1`
      : `SELECT DISTINCT lp.id, lp.city
         FROM laundry_profiles lp
         WHERE lp.status = 'active'
           AND lp.is_verified = TRUE
           AND lp.city ILIKE $1`

    const providerResult = await query<{ id: number; city: string }>(
      providerQuery,
      [pincode ?? `%${city}%`]
    )

    const providerIds = providerResult.rows.map((r) => r.id)
    const cityName = providerResult.rows[0]?.city ?? city ?? null

    if (providerIds.length === 0) {
      // Area not covered — return empty but valid structure
      return successResponse({
        covered: false,
        pincode: pincode ?? '',
        city: cityName,
        provider_count: 0,
        services: [],
      })
    }

    // ---- Step 2: Which services are offered in this area ----
    // A service is "available in area" if at least one provider in that area
    // has it listed in their provider_services table OR services_offered array.
    // We use provider_services as the authoritative source (array is legacy).
    const servicesResult = await query<{
      service_id: number
      service_name: string
      service_description: string
      category: string
      turnaround_hours: number
      is_express_available: boolean
      express_multiplier: number
    }>(
      `SELECT DISTINCT
         s.id                  AS service_id,
         s.name                AS service_name,
         s.description         AS service_description,
         s.category,
         s.turnaround_hours,
         s.is_express_available,
         s.express_multiplier
       FROM provider_services ps
       JOIN services s ON s.id = ps.service_id
       WHERE ps.provider_id = ANY($1::bigint[])
       ORDER BY s.id`,
      [providerIds]
    )

    if (servicesResult.rowCount === 0) {
      // Providers exist but haven't configured their services yet — show all platform services
      // This is a graceful fallback during early platform growth
      const allServices = await query(
        `SELECT id AS service_id, name AS service_name, description AS service_description,
                category, turnaround_hours, is_express_available, express_multiplier
         FROM services ORDER BY id`
      )
      servicesResult.rows.push(...allServices.rows)
    }

    if (servicesResult.rows.length === 0) {
      return successResponse({
        covered: true,
        pincode: pincode ?? '',
        city: cityName,
        provider_count: providerIds.length,
        services: [],
      })
    }

    const serviceIds = servicesResult.rows.map((r) => r.service_id)

    // ---- Step 3: Product types + platform pricing -----------
    const pricingResult = await query<{
      service_id: number
      product_type_id: number
      product_type_name: string
      product_description: string | null
      pricing_model: string
      display_category: string
      icon: string
      sort_order: number
      unit_price: number
    }>(
      `SELECT
         psp.service_id,
         pt.id             AS product_type_id,
         pt.name           AS product_type_name,
         pt.description    AS product_description,
         pt.pricing_model,
         pt.display_category,
         pt.icon,
         pt.sort_order,
         psp.unit_price
       FROM product_service_prices psp
       JOIN product_types pt ON pt.id = psp.product_type_id
       WHERE psp.service_id = ANY($1::int[])
         AND pt.is_active = TRUE
       ORDER BY pt.display_category, pt.sort_order, pt.name`,
      [serviceIds]
    )

    // ---- Step 4: Group product types by service -------------
    const productsByService = new Map<number, typeof pricingResult.rows>()
    for (const row of pricingResult.rows) {
      if (!productsByService.has(row.service_id)) {
        productsByService.set(row.service_id, [])
      }
      productsByService.get(row.service_id)!.push(row)
    }

    const services = servicesResult.rows
      .map((svc) => ({
        service: {
          id: svc.service_id,
          name: svc.service_name,
          description: svc.service_description,
          category: svc.category,
          turnaround_hours: svc.turnaround_hours,
          is_express_available: svc.is_express_available,
          express_multiplier: Number(svc.express_multiplier),
        },
        product_types: (productsByService.get(svc.service_id) ?? []).map((p) => ({
          id: p.product_type_id,
          name: p.product_type_name,
          description: p.product_description,
          pricing_model: p.pricing_model,
          display_category: p.display_category,
          icon: p.icon,
          sort_order: p.sort_order,
          unit_price: Number(p.unit_price),
        })),
      }))
      // Only return services that have at least one priced product type
      .filter((s) => s.product_types.length > 0)

    return successResponse({
      covered: true,
      pincode: pincode ?? '',
      city: cityName,
      provider_count: providerIds.length,
      services,
    })
  } catch (error) {
    console.error('[GET /api/customer/public/pricing/services-by-area]', error)
    return serverErrorResponse('Failed to fetch pricing data')
  }
}
