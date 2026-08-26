// app/api/customer/laundry-providers/[id]/services/route.ts
import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'
import { getProviderCatalog } from '@/lib/provider-catalog'

// GET /api/customer/laundry-providers/[id]/services
// Returns:
//   per_kg_services: KgService[]   — services priced per kg (wash_fold, wash_iron)
//   per_unit_products: UnitProduct[] — product types priced per unit (dry_clean, steam_iron per garment)
//   per_sqft_products: SqftProduct[] — product types priced by measured area
//     (carpets). These carry a RATE, not a price: the amount is calculated
//     once the delivery partner measures the item at pickup.
// Pricing resolution (see lib/provider-catalog.ts): provider override > platform base price

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const providerId = parseInt(id, 10)
  if (isNaN(providerId)) return notFoundResponse('Provider not found')

  try {
    // Verify provider exists and is active — this route is the public
    // customer-facing catalog, so this eligibility gate stays here rather
    // than inside the shared helper (other callers, e.g. delivery order
    // modification, don't need it — the order already implies a valid
    // provider).
    const providerCheck = await queryOne<{ id: number }>(
      `SELECT id FROM laundry_profiles WHERE id = $1 AND status = 'active' AND is_verified = TRUE`,
      [providerId]
    )
    if (!providerCheck) return notFoundResponse('Provider not found or not active')

    const catalog = await getProviderCatalog(providerId)
    if (!catalog) return notFoundResponse('Provider not found')

    return successResponse(catalog)
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/:id/services]', error)
    return serverErrorResponse('Failed to fetch services')
  }
}
