// lib/provider-pricing.ts
//
// The provider pricing matrix — product type × service — and the single write
// path into it.
//
// Three personas edit the same grid now:
//   • the provider,           /api/laundry/services/pricing
//   • an admin,               /api/admin/providers/[id]/pricing
//   • a support Lead,         /api/support/providers/[id]/pricing
//
// They must agree on what a valid price is, what clearing a cell means, and
// what a row records about who touched it. Duplicating that per route is how
// the three drift, so all three call the two functions below and differ only
// in how they authenticate and which provider they resolve.
//
// Three price layers exist and are easy to confuse:
//
//   product_service_prices           platform grid, one per (product, service)
//                                    — admin's Service Catalog -> Pricing matrix.
//                                    Shared by EVERY provider.
//   provider_product_service_prices  this provider's override of a cell, plus
//                                    an optional struck-through mrp.
//   provider_services.price_override the coarser per-service override, edited
//                                    on the admin provider page's Services tab.
//                                    Not touched here.
//
// Assisted editing writes ONLY the middle layer. Setting a price for one
// provider must never move another provider's price, which is exactly what
// writing to product_service_prices would do.

import { query, queryOne } from '@/lib/db'
import { getGstRate } from '@/lib/gst'

/** Who is making the edit. Mirrors the CHECK on updated_by_role. */
export type PricingActorRole = 'laundry' | 'admin' | 'support'

export interface PricingMatrix {
  services:      { id: number; name: string; category: string; price_per_kg: string | null }[]
  product_types: {
    id: number; name: string; description: string | null
    pricing_model: string; display_category: string; icon: string | null; sort_order: number
  }[]
  /** "productTypeId:serviceId" → platform default price. */
  base_prices: Record<string, string>
  /** "productTypeId:serviceId" → this provider's override. */
  overrides:   Record<string, string>
  /** "productTypeId:serviceId" → optional struck-through MRP. */
  mrp:         Record<string, string>
  /** "productTypeId:serviceId" → who last set the override, and when. */
  attribution: Record<string, { role: PricingActorRole | null; name: string | null; at: string }>
  has_gst:               boolean
  gst_inclusive_pricing: boolean
  gst_rate:              number
}

const key = (productTypeId: number | string, serviceId: number | string) =>
  `${productTypeId}:${serviceId}`

/**
 * The whole grid for one provider, as the provider themselves would see it.
 *
 * Deliberately identical in shape for all three personas: the assisted view is
 * not a different view of pricing, it is the provider's own screen operated by
 * someone else. A support agent seeing a different number from the provider is
 * the failure mode this shape exists to prevent.
 */
export async function loadProviderPricingMatrix(providerId: number | string): Promise<PricingMatrix | null> {
  const provider = await queryOne<{ id: number; has_gst: boolean; gst_inclusive_pricing: boolean }>(
    `SELECT id, has_gst, gst_inclusive_pricing FROM laundry_profiles WHERE id = $1::BIGINT`,
    [providerId]
  )
  if (!provider) return null
  const pid = provider.id

  const [enabledServices, productTypes, basePrices, overrides, gstRate] = await Promise.all([
    // Only services this provider actually offers become columns — pricing a
    // service they don't run is meaningless, and setProviderPrice refuses it.
    query<{ id: number; name: string; category: string; price_per_kg: string | null }>(
      `SELECT s.id, s.name, s.category, s.price_per_kg::TEXT
       FROM services s
       INNER JOIN provider_services ps ON ps.service_id = s.id AND ps.provider_id = $1
       WHERE s.is_active = TRUE
       ORDER BY s.id ASC`,
      [pid]
    ),

    query<any>(`
      SELECT pt.id, pt.name, pt.description, pt.pricing_model,
             pt.display_category, pt.icon, pt.sort_order
      FROM product_types pt
      WHERE pt.is_active = TRUE
      ORDER BY pt.display_category ASC, pt.sort_order ASC
    `),

    query<any>(`
      SELECT psp.product_type_id, psp.service_id, psp.unit_price::TEXT
      FROM product_service_prices psp
      INNER JOIN provider_services ps
        ON ps.service_id = psp.service_id AND ps.provider_id = $1
    `, [pid]),

    query<any>(`
      SELECT ppsp.product_type_id,
             ppsp.service_id,
             ppsp.unit_price::TEXT,
             ppsp.mrp::TEXT,
             ppsp.updated_by_role,
             ppsp.updated_at::TEXT AS updated_at,
             u.full_name AS updated_by_name
      FROM provider_product_service_prices ppsp
      LEFT JOIN users u ON u.id = ppsp.updated_by_user_id
      WHERE ppsp.provider_id = $1
    `, [pid]),

    getGstRate(),
  ])

  const base_prices:  Record<string, string> = {}
  const overrideMap:  Record<string, string> = {}
  const mrpMap:       Record<string, string> = {}
  const attribution:  PricingMatrix['attribution'] = {}

  basePrices.rows.forEach((r: any) => {
    base_prices[key(r.product_type_id, r.service_id)] = r.unit_price
  })

  overrides.rows.forEach((r: any) => {
    const k = key(r.product_type_id, r.service_id)
    overrideMap[k] = r.unit_price
    if (r.mrp) mrpMap[k] = r.mrp
    attribution[k] = {
      role: r.updated_by_role ?? null,
      // NULL for rows backfilled by migration 57 — we know the role but not
      // the individual, and the UI says "the provider" rather than inventing one.
      name: r.updated_by_name ?? null,
      at:   r.updated_at,
    }
  })

  return {
    services:      enabledServices.rows,
    product_types: productTypes.rows,
    base_prices,
    overrides:     overrideMap,
    mrp:           mrpMap,
    attribution,
    has_gst:               provider.has_gst,
    gst_inclusive_pricing: provider.gst_inclusive_pricing,
    gst_rate:              gstRate,
  }
}

export type SetPriceResult =
  | { ok: true;  cleared: boolean; message: string }
  | { ok: false; status: number; message: string }

/**
 * Set or clear one cell of a provider's grid.
 *
 * `unitPrice === null` clears the override so the cell falls back to the
 * platform default — that is the undo for an assisted edit, and the reason
 * clearing is a null price rather than a separate endpoint.
 */
export async function setProviderPrice(params: {
  providerId:    number | string
  productTypeId: number
  serviceId:     number
  unitPrice:     number | null
  mrp?:          number | null
  actorUserId:   string | number
  actorRole:     PricingActorRole
}): Promise<SetPriceResult> {
  const { providerId, productTypeId, serviceId, unitPrice, actorUserId, actorRole } = params

  if (!productTypeId || !serviceId) {
    return { ok: false, status: 400, message: 'product_type_id and service_id are required' }
  }

  // A provider can only be priced for services they actually offer. Checked
  // here rather than in each route so the assisted paths cannot skip it.
  const offered = await queryOne(
    `SELECT 1 FROM provider_services WHERE provider_id = $1::BIGINT AND service_id = $2`,
    [providerId, serviceId]
  )
  if (!offered) {
    return {
      ok: false, status: 400,
      message: 'This provider does not offer that service yet — enable it on the Services tab first',
    }
  }

  if (unitPrice === null || unitPrice === undefined) {
    await query(
      `DELETE FROM provider_product_service_prices
       WHERE provider_id = $1::BIGINT AND product_type_id = $2 AND service_id = $3`,
      [providerId, productTypeId, serviceId]
    )
    return { ok: true, cleared: true, message: 'Price override removed — using platform default' }
  }

  if (unitPrice < 0) {
    return { ok: false, status: 400, message: 'Price cannot be negative' }
  }

  const mrp = params.mrp ?? null
  if (mrp !== null && mrp < unitPrice) {
    return { ok: false, status: 400, message: 'MRP cannot be lower than the selling price' }
  }

  await query(`
    INSERT INTO provider_product_service_prices
      (provider_id, product_type_id, service_id, unit_price, mrp, updated_by_user_id, updated_by_role, updated_at)
    VALUES ($1::BIGINT, $2, $3, $4, $5, $6::BIGINT, $7, NOW())
    ON CONFLICT (provider_id, product_type_id, service_id)
    DO UPDATE SET
      unit_price         = EXCLUDED.unit_price,
      mrp                = EXCLUDED.mrp,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_by_role    = EXCLUDED.updated_by_role,
      updated_at         = NOW()
  `, [providerId, productTypeId, serviceId, unitPrice, mrp, actorUserId, actorRole])

  return { ok: true, cleared: false, message: 'Price saved' }
}

/**
 * Human names for one cell, for the notification body.
 *
 * Looked up after the write rather than passed in from the client, so the
 * provider's notification says what actually changed rather than whatever
 * labels the operator's browser happened to be holding.
 */
export async function describePricingCell(
  productTypeId: number,
  serviceId: number
): Promise<{ productName: string; serviceName: string }> {
  const row = await queryOne<{ product_name: string; service_name: string }>(
    `SELECT pt.name AS product_name, s.name AS service_name
     FROM product_types pt, services s
     WHERE pt.id = $1 AND s.id = $2`,
    [productTypeId, serviceId]
  )
  return {
    productName: row?.product_name ?? 'an item',
    serviceName: row?.service_name ?? 'a service',
  }
}

/**
 * Tell the provider that Laundrease changed a price for them.
 *
 * Best-effort and never thrown from the caller: failing to post a notification
 * must not roll back a price the operator has already been told was saved.
 * Skipped for actorRole 'laundry' — nobody needs telling what they just did.
 */
export async function notifyProviderOfAssistedPricing(params: {
  providerId:  number | string
  actorRole:   PricingActorRole
  productName: string
  serviceName: string
  cleared:     boolean
}): Promise<void> {
  if (params.actorRole === 'laundry') return

  const what = params.cleared
    ? `The ${params.serviceName} price for ${params.productName} was reset to the Laundrease default.`
    : `The ${params.serviceName} price for ${params.productName} was updated.`

  try {
    await query(
      `INSERT INTO laundry_notifications (provider_id, type, title, body)
       VALUES ($1::BIGINT, 'pricing_updated', 'Pricing updated by Laundrease', $2)`,
      [params.providerId, `${what} You can review or change it any time under Services → Pricing.`]
    )
  } catch (err) {
    console.error('[provider-pricing] notification failed:', (err as Error).message)
  }
}
