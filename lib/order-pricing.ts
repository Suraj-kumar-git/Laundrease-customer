// lib/order-pricing.ts
//
// What a line actually costs, decided by the server.
//
// This is the single place a garment/service line gets a price. It was
// previously inline in /api/customer/orders/create, which did it correctly —
// and nowhere in /api/customer/cart, which took `unit_price` and `line_total`
// straight from the request body and stored them. So the order total was safe
// while the cart would happily record a ₹149 item at ₹10, and every screen
// reading the cart repeated that number back to the customer.
//
// Both callers use this now. A price the client sends is never read; it is
// re-derived from the provider's own catalogue, with provider override taking
// precedence over the platform default, and the GST-inclusive overlay applied
// when the provider prices that way.
//
// The client still chooses `is_express` — that is a customer decision, not a
// price — but it is gated by whether the service actually offers express, and
// the multiplier comes from the catalogue rather than the request.
//
// Three pricing models: per_unit (quantity), per_kg (weight) and per_sqft
// (measured area, for carpets and anything else charged by size). per_sqft
// lines are worth nothing until the delivery partner measures them at pickup,
// which is why the model itself is verified against the catalogue below rather
// than taken from the request.

import { getGstRate, applyGst } from '@/lib/gst'

/** Minimal query shape, so this works inside a transaction or standalone. */
export type Exec = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>

export interface LineRequest {
  type:             'per_kg' | 'per_unit' | 'per_sqft'
  service_id:       number
  product_type_id?: number | null
  quantity?:        number | null
  weight_kg?:       number | null
  /**
   * Measured area, in square feet.
   *
   * Deliberately absent at order time — a carpet has no area until the
   * delivery partner measures it at pickup, so callers leave this null and the
   * line is worth 0. It exists on the request type only so the same function
   * can reprice the line once the measurement arrives.
   */
  area_sqft?:       number | null
  is_express?:      boolean
}

export interface PricedLine {
  type:               'per_kg' | 'per_unit' | 'per_sqft'
  service_id:         number
  product_type_id:    number | null
  quantity:           number | null
  weight_kg:          number | null
  area_sqft:          number | null
  unit_price:         number
  line_total:         number
  is_express:         boolean
  express_multiplier: number
}

export interface PricingContext {
  providerId:   number
  gstInclusive: boolean
  gstRate:      number
}

export class PricingError extends Error {
  constructor(public code: 'INVALID_PROVIDER' | 'SERVICE_UNAVAILABLE', message?: string) {
    super(message ?? code)
    this.name = 'PricingError'
  }
}

/**
 * Resolve the provider and its GST posture once, then reuse for every line.
 * Doing this per line would re-read the provider and re-fetch the GST rate for
 * each garment in the basket.
 */
export async function getPricingContext(exec: Exec, providerId: number): Promise<PricingContext> {
  const res = await exec(
    `SELECT lp.id, lp.has_gst, lp.gst_inclusive_pricing
     FROM laundry_profiles lp
     WHERE lp.id = $1 AND lp.status = 'active' AND lp.is_verified = TRUE`,
    [providerId]
  )
  if (res.rowCount === 0) throw new PricingError('INVALID_PROVIDER')

  const provider = res.rows[0]
  const gstInclusive = provider.has_gst && provider.gst_inclusive_pricing
  return {
    providerId,
    gstInclusive,
    gstRate: gstInclusive ? await getGstRate() : 0,
  }
}

/**
 * Price one line from the catalogue.
 *
 * Throws SERVICE_UNAVAILABLE when the provider does not offer that
 * service/garment combination — which is also what stops a caller pricing
 * against a provider who never sold the thing.
 */
export async function priceLine(
  exec: Exec,
  ctx: PricingContext,
  line: LineRequest
): Promise<PricedLine> {
  // `line.type` arrives from the request body — both callers pass the client's
  // word for it straight through. That was tolerable while every model priced
  // from a real catalogue row and a mismatched claim simply failed the lookup.
  //
  // per_sqft breaks that safety, because an unmeasured per-sqft line is worth
  // ZERO. A client that could get a shirt routed down this branch would get it
  // free. So the per_sqft branch is decided by the DATABASE, never the caller:
  // a product type is per-area or it is not, and the request does not get a
  // vote either way.
  if (line.product_type_id != null) {
    const modelRes = await exec(
      `SELECT pricing_model FROM product_types WHERE id = $1`,
      [line.product_type_id]
    )
    const dbModel = modelRes.rows[0]?.pricing_model as string | undefined
    if (!dbModel) throw new PricingError('SERVICE_UNAVAILABLE')

    // Claiming per_sqft for something that isn't, or claiming something else
    // for a product that is, are both rejected rather than quietly re-routed:
    // a caller and the catalogue disagreeing about how a thing is priced is a
    // bug or an attempt, and neither deserves a price.
    if ((dbModel === 'per_sqft') !== (line.type === 'per_sqft')) {
      throw new PricingError('SERVICE_UNAVAILABLE')
    }
  } else if (line.type === 'per_sqft') {
    // A per-area line without a product type has nothing to check against.
    throw new PricingError('SERVICE_UNAVAILABLE')
  }

  if (line.type === 'per_kg') {
    const res = await exec(
      `SELECT
         COALESCE(ps.price_per_kg_override, ps.price_override, s.price_per_kg, s.base_price) AS price,
         COALESCE(ps.is_express_available_override, s.is_express_available) AS effective_express,
         COALESCE(ps.express_multiplier_override, s.express_multiplier) AS effective_multiplier
       FROM provider_services ps
       JOIN services s ON s.id = ps.service_id
       WHERE ps.provider_id = $1 AND ps.service_id = $2
         AND s.pricing_model = 'per_kg'
         AND s.is_active = TRUE`,
      [ctx.providerId, line.service_id]
    )
    if (res.rowCount === 0) throw new PricingError('SERVICE_UNAVAILABLE')

    const row        = res.rows[0]
    const unitPrice  = ctx.gstInclusive
      ? applyGst(parseFloat(row.price), ctx.gstRate)!
      : parseFloat(row.price)
    const multiplier = parseFloat(row.effective_multiplier)
    const isExpress  = !!line.is_express && !!row.effective_express
    const weightKg   = Number(line.weight_kg ?? 0)

    return {
      type: 'per_kg',
      service_id:      line.service_id,
      product_type_id: line.product_type_id ?? null,
      quantity:        null,
      weight_kg:       weightKg,
      area_sqft:       null,
      unit_price:      unitPrice,
      line_total:      round2(unitPrice * (isExpress ? multiplier : 1) * weightKg),
      is_express:      isExpress,
      express_multiplier: multiplier,
    }
  }

  if (line.type === 'per_sqft') {
    // Dimension-priced goods (carpets). Unlike per_kg and per_unit, the rate is
    // resolved from the PRODUCT TYPE's pricing model rather than the service
    // category: "Carpet Cleaning" is an ordinary service, and what makes the
    // line per-area is the thing being cleaned.
    //
    // The rate must already exist. A provider who offers carpet cleaning but
    // has not set a per-sq-ft price is SERVICE_UNAVAILABLE rather than free —
    // silently pricing at zero would let a customer order a carpet that never
    // becomes billable, and nobody would notice until the partner measured it.
    const res = await exec(
      `SELECT
         COALESCE(ps.price_per_sqft_override, s.price_per_sqft) AS price,
         COALESCE(ps.is_express_available_override, s.is_express_available) AS effective_express,
         COALESCE(ps.express_multiplier_override, s.express_multiplier) AS effective_multiplier
       FROM provider_services ps
       JOIN services s ON s.id = ps.service_id
       JOIN product_types pt ON pt.id = $3
       WHERE ps.provider_id = $1 AND ps.service_id = $2
         AND pt.is_active = TRUE
         AND pt.pricing_model = 'per_sqft'
         AND COALESCE(ps.price_per_sqft_override, s.price_per_sqft) IS NOT NULL`,
      [ctx.providerId, line.service_id, line.product_type_id]
    )
    if (res.rowCount === 0) throw new PricingError('SERVICE_UNAVAILABLE')

    const row        = res.rows[0]
    const unitPrice  = ctx.gstInclusive
      ? applyGst(parseFloat(row.price), ctx.gstRate)!
      : parseFloat(row.price)
    const multiplier = parseFloat(row.effective_multiplier)
    const isExpress  = !!line.is_express && !!row.effective_express
    // Null area (not yet measured) prices to zero, which is the whole point:
    // the customer is shown the rate and charged nothing until pickup.
    const areaSqft   = line.area_sqft == null ? null : Number(line.area_sqft)

    return {
      type: 'per_sqft',
      service_id:      line.service_id,
      product_type_id: line.product_type_id ?? null,
      // One carpet is one item. Quantity stays 1 so the DB's line-total
      // trigger, which falls back to quantity for other models, can never
      // multiply an area by anything.
      quantity:        1,
      weight_kg:       null,
      area_sqft:       areaSqft,
      unit_price:      unitPrice,
      line_total:      round2(unitPrice * (isExpress ? multiplier : 1) * (areaSqft ?? 0)),
      is_express:      isExpress,
      express_multiplier: multiplier,
    }
  }

  const res = await exec(
    `SELECT
       COALESCE(ppsp.unit_price, psp.unit_price) AS price,
       s.is_express_available, s.express_multiplier
     FROM product_service_prices psp
     JOIN product_types pt ON pt.id = psp.product_type_id
     JOIN services s ON s.id = psp.service_id
     LEFT JOIN provider_product_service_prices ppsp
       ON ppsp.provider_id = $1 AND ppsp.product_type_id = psp.product_type_id
          AND ppsp.service_id = psp.service_id
     INNER JOIN provider_services ps ON ps.provider_id = $1 AND ps.service_id = psp.service_id
     WHERE pt.id = $2 AND s.id = $3 AND pt.is_active = TRUE
       AND s.is_active = TRUE
       AND s.pricing_model = 'per_unit'
       AND (ppsp.unit_price IS NOT NULL OR psp.unit_price IS NOT NULL)`,
    [ctx.providerId, line.product_type_id, line.service_id]
  )
  if (res.rowCount === 0) throw new PricingError('SERVICE_UNAVAILABLE')

  const row        = res.rows[0]
  const unitPrice  = ctx.gstInclusive
    ? applyGst(parseFloat(row.price), ctx.gstRate)!
    : parseFloat(row.price)
  const multiplier = parseFloat(row.express_multiplier)
  const isExpress  = !!line.is_express && !!row.is_express_available
  const quantity   = Number(line.quantity ?? 0)

  return {
    type: 'per_unit',
    service_id:      line.service_id,
    product_type_id: line.product_type_id ?? null,
    quantity,
    weight_kg:       null,
    area_sqft:       null,
    unit_price:      unitPrice,
    line_total:      round2(unitPrice * (isExpress ? multiplier : 1) * quantity),
    is_express:      isExpress,
    express_multiplier: multiplier,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
