// app/api/customer/laundry-providers/[id]/services/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/laundry-providers/[id]/services
// Returns:
//   per_kg_services: KgService[]   — services priced per kg (wash_fold, wash_iron)
//   per_unit_products: UnitProduct[] — product types priced per unit (dry_clean, steam_iron per garment)
// Pricing resolution: provider override > platform base price

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const providerId = parseInt(id, 10)
  if (isNaN(providerId)) return notFoundResponse('Provider not found')

  try {
    // Verify provider exists and is active
    const providerCheck = await query(
      `SELECT id FROM laundry_profiles WHERE id = $1 AND status = 'active' AND is_verified = TRUE`,
      [providerId]
    )
    if (providerCheck.rowCount === 0) return notFoundResponse('Provider not found or not active')

    // ---- Per-kg services ----------------------------------------
    // These are services where pricing is per kg (wash_fold, wash_iron categories)
    // Provider can override base_price and price_per_kg via provider_services
    const kgServicesResult = await query(
      `SELECT
         s.id                    AS service_id,
         s.name                  AS service_name,
         s.category,
         s.description,
         s.turnaround_hours,
         s.is_express_available,
         s.express_multiplier,
         -- Price: provider override > base price_per_kg > base_price
         COALESCE(
           ps.price_per_kg_override,
           ps.price_override,
           s.price_per_kg,
           s.base_price
         )                       AS price_per_kg,
         -- MRP is provider-only — only meaningful when the provider has set
         -- their own override price; never derived from the platform default.
         CASE WHEN ps.price_per_kg_override IS NOT NULL OR ps.price_override IS NOT NULL
              THEN ps.price_per_kg_mrp END AS mrp_per_kg,
         COALESCE(ps.turnaround_hours_override, s.turnaround_hours) AS effective_turnaround,
         COALESCE(ps.is_express_available_override, s.is_express_available) AS effective_express,
         COALESCE(ps.express_multiplier_override, s.express_multiplier) AS effective_multiplier
       FROM provider_services ps
       JOIN services s ON s.id = ps.service_id
       WHERE ps.provider_id = $1
         AND s.category IN ('wash_fold', 'wash_iron')
       ORDER BY s.category, s.name`,
      [providerId]
    )

    // ---- Per-unit products --------------------------------------
    // Product types with their service prices — provider override > base price
    const unitProductsResult = await query(
      `SELECT
         pt.id                   AS product_type_id,
         pt.name                 AS product_type_name,
         pt.display_category,
         pt.icon,
         s.id                    AS service_id,
         s.name                  AS service_name,
         s.category              AS service_category,
         s.is_express_available,
         s.express_multiplier,
         -- Price resolution: provider_product_service_prices > product_service_prices
         COALESCE(
           ppsp.unit_price,
           psp.unit_price
         )                       AS unit_price,
         -- MRP is provider-only — only present when the provider has their
         -- own override row, never derived from the platform base price.
         ppsp.mrp                AS mrp
       FROM product_service_prices psp
       JOIN product_types pt ON pt.id = psp.product_type_id
       JOIN services s ON s.id = psp.service_id
       -- Left join provider-specific override
       LEFT JOIN provider_product_service_prices ppsp
         ON ppsp.provider_id = $1
         AND ppsp.product_type_id = psp.product_type_id
         AND ppsp.service_id = psp.service_id
       -- Only include services this provider actually offers
       INNER JOIN provider_services ps
         ON ps.provider_id = $1 AND ps.service_id = psp.service_id
       WHERE pt.is_active = TRUE
         AND s.category NOT IN ('wash_fold', 'wash_iron')  -- per-unit only
         AND (ppsp.unit_price IS NOT NULL OR psp.unit_price IS NOT NULL)
       ORDER BY pt.display_category, pt.sort_order, pt.name, s.name`,
      [providerId]
    )

    return successResponse({
      per_kg_services: kgServicesResult.rows.map(r => ({
        service_id: r.service_id,
        service_name: r.service_name,
        category: r.category,
        description: r.description,
        price_per_kg: parseFloat(r.price_per_kg),
        mrp_per_kg: r.mrp_per_kg ? parseFloat(r.mrp_per_kg) : null,
        is_express_available: r.effective_express,
        express_multiplier: parseFloat(r.effective_multiplier),
        turnaround_hours: r.effective_turnaround,
      })),
      per_unit_products: unitProductsResult.rows.map(r => ({
        product_type_id: r.product_type_id,
        product_type_name: r.product_type_name,
        display_category: r.display_category,
        icon: r.icon,
        service_id: r.service_id,
        service_name: r.service_name,
        unit_price: parseFloat(r.unit_price),
        mrp: r.mrp ? parseFloat(r.mrp) : null,
        is_express_available: r.is_express_available,
        express_multiplier: parseFloat(r.express_multiplier),
      })),
    })
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/:id/services]', error)
    return serverErrorResponse('Failed to fetch services')
  }
}
