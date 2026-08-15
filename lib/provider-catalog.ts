// lib/provider-catalog.ts
// Single source of truth for "what does this provider sell, and at what
// price" — per-kg services (flat, provider-wide) and per-unit products (a
// real product_type x service pricing matrix). Originally inline in
// app/api/customer/laundry-providers/[id]/services/route.ts; extracted so
// every other consumer (e.g. the delivery pickup item-modification flow)
// reads pricing through the exact same resolution instead of a second,
// drifted copy of this logic.
//
// Pricing resolution, identical for both shapes: provider override >
// platform base. GST-inclusive pricing is a display/compute-time overlay
// only — it never touches the stored override/base values.

import { query, queryOne } from '@/lib/db'
import { getGstRate, applyGst } from '@/lib/gst'

export interface KgService {
  service_id: number
  service_name: string
  category: string
  description: string | null
  price_per_kg: number
  mrp_per_kg: number | null
  is_express_available: boolean
  express_multiplier: number
  turnaround_hours: number
}

export interface UnitProduct {
  product_type_id: number
  product_type_name: string
  display_category: string | null
  icon: string | null
  service_id: number
  service_name: string
  unit_price: number
  mrp: number | null
  is_express_available: boolean
  express_multiplier: number
}

export interface ProviderCatalog {
  per_kg_services: KgService[]
  per_unit_products: UnitProduct[]
}

// Returns null only if the provider row itself doesn't exist. Callers that
// need an additional eligibility gate (e.g. the public customer catalog
// requiring status='active' AND is_verified=TRUE) should check that
// separately before calling — this function only resolves pricing.
export async function getProviderCatalog(providerId: number): Promise<ProviderCatalog | null> {
  const provider = await queryOne<{ has_gst: boolean; gst_inclusive_pricing: boolean }>(
    `SELECT has_gst, gst_inclusive_pricing FROM laundry_profiles WHERE id = $1`,
    [providerId]
  )
  if (!provider) return null
  const gstInclusive = provider.has_gst && provider.gst_inclusive_pricing
  const gstRate = gstInclusive ? await getGstRate() : 0

  // ---- Per-kg services ----------------------------------------
  // Services priced per kg (wash_fold, wash_iron categories) — flat across
  // all product types. Provider can override base_price/price_per_kg via
  // provider_services.
  const kgServicesResult = await query(
    `SELECT
       s.id                    AS service_id,
       s.name                  AS service_name,
       s.category,
       s.description,
       s.turnaround_hours,
       s.is_express_available,
       s.express_multiplier,
       COALESCE(
         ps.price_per_kg_override,
         ps.price_override,
         s.price_per_kg,
         s.base_price
       )                       AS price_per_kg,
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

  // ---- Per-unit products ----------------------------------------
  // Product types with their service prices — a real (product_type x
  // service) matrix, not a flat per-service price. Provider override >
  // platform base; only combos the provider actually offers AND has a
  // resolvable price for are included.
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
       COALESCE(
         ppsp.unit_price,
         psp.unit_price
       )                       AS unit_price,
       ppsp.mrp                AS mrp
     FROM product_service_prices psp
     JOIN product_types pt ON pt.id = psp.product_type_id
     JOIN services s ON s.id = psp.service_id
     LEFT JOIN provider_product_service_prices ppsp
       ON ppsp.provider_id = $1
       AND ppsp.product_type_id = psp.product_type_id
       AND ppsp.service_id = psp.service_id
     INNER JOIN provider_services ps
       ON ps.provider_id = $1 AND ps.service_id = psp.service_id
     WHERE pt.is_active = TRUE
       AND s.category NOT IN ('wash_fold', 'wash_iron')
       AND (ppsp.unit_price IS NOT NULL OR psp.unit_price IS NOT NULL)
     ORDER BY pt.display_category, pt.sort_order, pt.name, s.name`,
    [providerId]
  )

  return {
    per_kg_services: kgServicesResult.rows.map(r => ({
      service_id: r.service_id,
      service_name: r.service_name,
      category: r.category,
      description: r.description,
      price_per_kg: gstInclusive ? applyGst(parseFloat(r.price_per_kg), gstRate)! : parseFloat(r.price_per_kg),
      mrp_per_kg: r.mrp_per_kg
        ? (gstInclusive ? applyGst(parseFloat(r.mrp_per_kg), gstRate) : parseFloat(r.mrp_per_kg))
        : null,
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
      unit_price: gstInclusive ? applyGst(parseFloat(r.unit_price), gstRate)! : parseFloat(r.unit_price),
      mrp: r.mrp
        ? (gstInclusive ? applyGst(parseFloat(r.mrp), gstRate) : parseFloat(r.mrp))
        : null,
      is_express_available: r.is_express_available,
      express_multiplier: parseFloat(r.express_multiplier),
    })),
  }
}
