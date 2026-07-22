// app/api/customer/public/services/route.ts
// GET — public service catalog (admin-set default pricing), no auth required.
// Used by the marketing "Our Services" grid on app/customer/services/page.tsx.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const isActive = searchParams.get('active') !== 'false' // default true

    const conditions: string[] = []
    const params: any[] = []

    if (category) {
      params.push(category)
      conditions.push(`s.category = $${params.length}`)
    }
    if (isActive) conditions.push(`s.is_active = TRUE`)

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const result = await query<any>(`
      SELECT s.id, s.name, s.description, s.category, s.base_price, s.price_per_kg,
             s.turnaround_hours, s.is_express_available, s.express_multiplier,
             s.icon, s.sort_order,
             -- A real, representative product_type for this service (lowest sort_order),
             -- so "Add to Cart" from this catalog card always references a valid product.
             dpt.id          AS default_product_type_id,
             dpt.name        AS default_product_type_name,
             dpt.icon        AS default_product_type_icon,
             dpt.pricing_model AS default_product_type_pricing_model,
             dpsp.unit_price AS default_product_type_unit_price
      FROM services s
      LEFT JOIN LATERAL (
        SELECT psp.product_type_id, psp.unit_price, pt.id, pt.name, pt.icon, pt.pricing_model
        FROM product_service_prices psp
        JOIN product_types pt ON pt.id = psp.product_type_id
        WHERE psp.service_id = s.id
        ORDER BY pt.sort_order ASC
        LIMIT 1
      ) dpsp ON TRUE
      LEFT JOIN product_types dpt ON dpt.id = dpsp.product_type_id
      ${where}
      ORDER BY s.sort_order ASC, s.name ASC
    `, params)

    const services = result.rows.map(s => {
      const pricePerKg = s.price_per_kg !== null ? parseFloat(s.price_per_kg) : null
      return {
        id:               s.id,
        name:             s.name,
        description:      s.description,
        category:         s.category,
        pricingModel:     pricePerKg !== null ? 'per_kg' : 'per_unit',
        startingPrice:    pricePerKg ?? parseFloat(s.base_price),
        turnaroundHours:  s.turnaround_hours,
        isExpressAvailable: s.is_express_available,
        expressMultiplier:  s.express_multiplier !== null ? parseFloat(s.express_multiplier) : null,
        icon:             s.icon,
        defaultProductType: s.default_product_type_id ? {
          id:           s.default_product_type_id,
          name:         s.default_product_type_name,
          icon:         s.default_product_type_icon,
          pricingModel: s.default_product_type_pricing_model,
          unitPrice:    parseFloat(s.default_product_type_unit_price),
        } : null,
      }
    })

    return successResponse({ services, total: services.length })
  } catch (error) {
    console.error('[GET /api/customer/public/services]', error)
    return serverErrorResponse('Failed to fetch services')
  }
}
