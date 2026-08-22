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

import { getGstRate, applyGst } from '@/lib/gst'

/** Minimal query shape, so this works inside a transaction or standalone. */
export type Exec = (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number | null }>

export interface LineRequest {
  type:             'per_kg' | 'per_unit'
  service_id:       number
  product_type_id?: number | null
  quantity?:        number | null
  weight_kg?:       number | null
  is_express?:      boolean
}

export interface PricedLine {
  type:               'per_kg' | 'per_unit'
  service_id:         number
  product_type_id:    number | null
  quantity:           number | null
  weight_kg:          number | null
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
  if (line.type === 'per_kg') {
    const res = await exec(
      `SELECT
         COALESCE(ps.price_per_kg_override, ps.price_override, s.price_per_kg, s.base_price) AS price,
         COALESCE(ps.is_express_available_override, s.is_express_available) AS effective_express,
         COALESCE(ps.express_multiplier_override, s.express_multiplier) AS effective_multiplier
       FROM provider_services ps
       JOIN services s ON s.id = ps.service_id
       WHERE ps.provider_id = $1 AND ps.service_id = $2
         AND s.category IN ('wash_fold', 'wash_iron')`,
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
      unit_price:      unitPrice,
      line_total:      round2(unitPrice * (isExpress ? multiplier : 1) * weightKg),
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
       AND s.category NOT IN ('wash_fold', 'wash_iron')
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
    unit_price:      unitPrice,
    line_total:      round2(unitPrice * (isExpress ? multiplier : 1) * quantity),
    is_express:      isExpress,
    express_multiplier: multiplier,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
