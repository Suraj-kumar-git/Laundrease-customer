// app/api/customer/orders/express-toggle/route.ts
// POST /api/customer/orders/express-toggle
// Auth required.
// Toggles express on/off for all services in the current cart.
// Returns updated services array with recomputed line_totals and new fee breakdown.
// Called from the checkout page when user taps the express toggle.

import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

interface ServiceItem {
  type: 'per_kg' | 'per_unit'
  service_id: number
  service_name: string
  weight_kg?: number
  product_type_id?: number
  product_type_name?: string
  icon?: string
  quantity?: number
  unit_price: number        // base price WITHOUT express multiplier
  is_express: boolean
  express_multiplier: number
  line_total: number
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { is_express: boolean; services: ServiceItem[] }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (typeof body.is_express !== 'boolean') return errorResponse('is_express (boolean) required', 400)
  if (!body.services || body.services.length === 0) return errorResponse('services required', 400)

  try {
    // Recompute each service line_total with the new express flag
    const updatedServices = body.services.map((svc): ServiceItem => {
      // unit_price is always the BASE price (without multiplier).
      // The line_total is recomputed here so the DB is the source of truth for fee config
      // but the express multiplier comes from the service itself.
      const multiplier = body.is_express && svc.express_multiplier > 1 ? svc.express_multiplier : 1
      const qty = svc.type === 'per_kg' ? (svc.weight_kg ?? 1) : (svc.quantity ?? 1)
      const lineTotal = Math.round(svc.unit_price * qty * multiplier * 100) / 100

      return {
        ...svc,
        is_express: body.is_express && svc.express_multiplier > 1, // only express if service supports it
        line_total: lineTotal,
      }
    })

    const newSubtotal = updatedServices.reduce((s, i) => s + i.line_total, 0)

    // Resolve the cart's provider so provider-specific delivery fee/MOV overrides apply
    const cartRow = await query<{ id: number; provider_id: number | null }>(
      `SELECT id, provider_id FROM shopping_carts WHERE user_id = $1`, [userId]
    )
    const providerId = cartRow.rows[0]?.provider_id ?? null

    // Fetch updated fee breakdown from DB function.
    //
    // Live config (no snapshot) is correct here — this is a CART preview, not
    // a committed order, so there's nothing frozen yet; the snapshot is taken
    // at checkout.
    //
    // KNOWN GAP: distance is NULL because this route works off the cart and
    // has no selected delivery address yet, so the free-radius / per-km branch
    // can't run and the delivery fee shown here may differ from the one on the
    // checkout page (/api/customer/orders/fees passes the real distance). This
    // only affects the previewed number — the amount actually charged is
    // computed at order creation, which does pass the real distance.
    const feesResult = await query(
      `SELECT calculate_order_fees($1, $2, NULL, $3) AS fees`,
      [newSubtotal, body.is_express, providerId]
    )
    const feeRows: any[] = feesResult.rows[0].fees ?? []
    const feesTotal  = feeRows.reduce((s: number, f: any) => s + parseFloat(String(f.amount)), 0)
    const grandTotal = Math.max(0, newSubtotal + feesTotal)

    // Persist the updated services back to cart (background — non-fatal)
    try {
      await transaction(async (client) => {
        if (cartRow.rowCount === 0) return

        const cartId = cartRow.rows[0].id

        // Update cart is_express flag
        await client.query(
          `UPDATE shopping_carts SET is_express = $1, updated_at = NOW() WHERE id = $2`,
          [body.is_express, cartId]
        )

        // Clear existing items and rewrite with new line totals
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId])

        for (const svc of updatedServices) {
          const cartItem = await client.query(
            `INSERT INTO cart_items (cart_id, product_type_id, quantity, weight_kg)
             VALUES ($1,$2,$3,$4) RETURNING id`,
            [
              cartId,
              svc.type === 'per_unit' ? svc.product_type_id : 1,
              svc.type === 'per_unit' ? svc.quantity : 1,
              svc.type === 'per_kg' ? svc.weight_kg : null,
            ]
          )
          await client.query(
            `INSERT INTO cart_item_services
               (cart_item_id, service_id, unit_price, line_total, is_express, express_multiplier)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [cartItem.rows[0].id, svc.service_id, svc.unit_price,
             svc.line_total, svc.is_express, svc.express_multiplier]
          )
        }

        // Update cart adjustments
        await client.query(
          `DELETE FROM cart_adjustments WHERE cart_id = $1 AND kind <> 'coupon'`, [cartId]
        )
        for (const fee of feeRows) {
          await client.query(
            `INSERT INTO cart_adjustments (cart_id, kind, amount, note, metadata)
             VALUES ($1,$2,$3,$4,$5)`,
            [
              cartId,
              ['delivery_fee','express_fee','surcharge'].includes(fee.code) ? fee.code : 'other',
              fee.amount, fee.display_name,
              JSON.stringify({ fee_code: fee.code, is_free: fee.is_free }),
            ]
          )
        }
      })
    } catch (cartErr) {
      console.warn('[express-toggle] Cart update error (non-fatal):', cartErr)
    }

    return successResponse({
      is_express:       body.is_express,
      services:         updatedServices,
      subtotal:         newSubtotal,
      fees:             feeRows,
      grand_total:      grandTotal,
    })
  } catch (error) {
    console.error('[POST /api/customer/orders/express-toggle]', error)
    return serverErrorResponse('Failed to update express preference')
  }
}
