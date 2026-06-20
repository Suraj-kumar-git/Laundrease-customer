// app/api/customer/cart/route.ts
// GET    — full cart with resume data (step, provider, address, items, schedule)
// POST   — upsert cart step data (stores provider_id, address_id, step, pickup info)
// DELETE — clear cart after successful order placement

import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

// ---- GET --------------------------------------------------------------------
// Returns everything needed to resume the flow from where the customer left off.
// CartSheet uses item_count for the badge.
// Create page uses current_step + provider + address + items + schedule for resume.

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const cartRes = await query(
      `SELECT
         sc.id, sc.subtotal, sc.tax_amount, sc.discount_amount,
         sc.adjustments_total, sc.total_amount, sc.is_express,
         sc.current_step, sc.pickup_date, sc.pickup_time_slot,
         sc.draft_order_number, sc.updated_at,
         -- Provider info
         sc.provider_id,
         lp.business_name  AS provider_name,
         lp.city           AS provider_city,
         lp.rating         AS provider_rating,
         lp.rating_count   AS provider_rating_count,
         -- Address info
         sc.address_id,
         ca.label          AS address_label,
         ca.address_line1,
         ca.address_line2,
         ca.city           AS address_city,
         ca.state          AS address_state,
         ca.postal_code,
         ca.country_code,
         ca.landmark,
         ca.instructions   AS address_instructions,
         ca.contact_name,
         ca.contact_phone,
         ca.is_default     AS address_is_default
       FROM shopping_carts sc
       LEFT JOIN laundry_profiles lp ON lp.id = sc.provider_id
       LEFT JOIN customer_addresses ca ON ca.id = sc.address_id
       WHERE sc.user_id = $1`,
      [userId]
    )

    if (cartRes.rowCount === 0) {
      return successResponse({ cart: null, items: [], item_count: 0 })
    }

    const c = cartRes.rows[0]

    // Cart items with services (for CartSheet display and step-2 resume)
    const itemsRes = await query(
      `SELECT
         ci.id             AS cart_item_id,
         ci.product_type_id,
         ci.garment_label,
         ci.quantity,
         ci.weight_kg,
         pt.name           AS product_type_name,
         pt.pricing_model,
         pt.icon,
         cis.id            AS service_item_id,
         cis.service_id,
         s.name            AS service_name,
         s.category        AS service_category,
         cis.unit_price,
         cis.line_total,
         cis.is_express,
         cis.express_multiplier
       FROM cart_items ci
       JOIN cart_item_services cis ON cis.cart_item_id = ci.id
       JOIN product_types pt ON pt.id = ci.product_type_id
       JOIN services s ON s.id = cis.service_id
       WHERE ci.cart_id = $1
       ORDER BY ci.id, s.name`,
      [c.id]
    )

    const hasItems = itemsRes.rowCount! > 0

    return successResponse({
      cart: {
        id:                  c.id,
        subtotal:            parseFloat(c.subtotal),
        tax_amount:          parseFloat(c.tax_amount),
        discount_amount:     parseFloat(c.discount_amount),
        total_amount:        parseFloat(c.total_amount),
        is_express:          c.is_express,
        current_step:        c.current_step ?? 1,
        pickup_date:         c.pickup_date,
        pickup_time_slot:    c.pickup_time_slot,
        draft_order_number:  c.draft_order_number,
        updated_at:          c.updated_at,
        // Provider
        provider: c.provider_id ? {
          id:           c.provider_id,
          business_name: c.provider_name,
          city:         c.provider_city,
          rating:       c.provider_rating ? parseFloat(c.provider_rating) : null,
          rating_count: c.provider_rating_count ?? 0,
        } : null,
        // Address
        address: c.address_id ? {
          id:           c.address_id,
          label:        c.address_label,
          address_line1: c.address_line1,
          address_line2: c.address_line2,
          city:         c.address_city,
          state:        c.address_state,
          postal_code:  c.postal_code,
          country_code: c.country_code,
          landmark:     c.landmark,
          instructions: c.address_instructions,
          contact_name: c.contact_name,
          contact_phone:c.contact_phone,
          is_default:   c.address_is_default,
        } : null,
      },
      items:      itemsRes.rows.map(r => ({
        ...r,
        unit_price: parseFloat(r.unit_price),
        line_total: parseFloat(r.line_total),
        weight_kg:  r.weight_kg ? parseFloat(r.weight_kg) : null,
      })),
      item_count: itemsRes.rowCount,
      has_items:  hasItems,
    })
  } catch (err) {
    console.error('[GET /api/customer/cart]', err)
    return serverErrorResponse('Failed to fetch cart')
  }
}

// ---- POST -------------------------------------------------------------------
// Upserts cart state for the current step.
// Creates draft_order_number on first call — this becomes the final order_number.
// Body: { current_step, provider_id?, address_id?, selected_services?, pickup_date?,
//         pickup_time_slot?, is_express? }

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: {
    current_step?:     number
    provider_id?:      number | null
    address_id?:       number | null
    selected_services?: any[]
    pickup_date?:      string | null
    pickup_time_slot?: string | null
    is_express?:       boolean
  }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  try {
    const result = await transaction(async client => {
      // Get or create cart
      let cartId: number
      let draftOrderNumber: string

      const existingCart = await client.query(
        `SELECT id, draft_order_number FROM shopping_carts WHERE user_id = $1`, [userId]
      )

      if (existingCart.rowCount === 0) {
        // Create cart — draft_order_number generated by DB function after insert
        const newCart = await client.query(
          `INSERT INTO shopping_carts (user_id, is_express, current_step)
           VALUES ($1, $2, $3) RETURNING id`,
          [userId, body.is_express ?? false, body.current_step ?? 1]
        )
        cartId = newCart.rows[0].id
        // Generate and store draft order number
        const numRes = await client.query(
          `SELECT ensure_draft_order_number($1) AS num`, [cartId]
        )
        draftOrderNumber = numRes.rows[0].num
      } else {
        cartId = existingCart.rows[0].id
        draftOrderNumber = existingCart.rows[0].draft_order_number

        // Ensure draft number exists (backward compat for carts created before migration)
        if (!draftOrderNumber) {
          const numRes = await client.query(
            `SELECT ensure_draft_order_number($1) AS num`, [cartId]
          )
          draftOrderNumber = numRes.rows[0].num
        }
      }

      // Update step-level cart metadata
      const updates: string[] = ['updated_at = NOW()']
      const vals: any[]       = []
      let   pi                = 1

      if (body.current_step      != null) { updates.push(`current_step = $${pi++}`);     vals.push(body.current_step) }
      if (body.provider_id       != null) { updates.push(`provider_id = $${pi++}`);      vals.push(body.provider_id) }
      if (body.address_id        != null) { updates.push(`address_id = $${pi++}`);       vals.push(body.address_id) }
      if (body.pickup_date       != null) { updates.push(`pickup_date = $${pi++}`);      vals.push(body.pickup_date) }
      if (body.pickup_time_slot  != null) { updates.push(`pickup_time_slot = $${pi++}`); vals.push(body.pickup_time_slot) }
      if (body.is_express        != null) { updates.push(`is_express = $${pi++}`);       vals.push(body.is_express) }

      if (vals.length > 0) {
        vals.push(cartId)
        await client.query(
          `UPDATE shopping_carts SET ${updates.join(', ')} WHERE id = $${pi}`,
          vals
        )
      }

      // Replace items only when services are provided (step 2 save)
      if (body.selected_services && body.selected_services.length > 0) {
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId])

        for (const item of body.selected_services) {
          if (item.type === 'per_kg') {
            const ci = await client.query(
              `INSERT INTO cart_items (cart_id, product_type_id, quantity, weight_kg)
               VALUES ($1, 1, 1, $2) RETURNING id`,
              [cartId, item.weight_kg]
            )
            await client.query(
              `INSERT INTO cart_item_services
                 (cart_item_id, service_id, unit_price, line_total, is_express, express_multiplier)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [ci.rows[0].id, item.service_id, item.unit_price,
               item.line_total, item.is_express, item.express_multiplier]
            )
          } else if (item.type === 'per_unit') {
            const ci = await client.query(
              `INSERT INTO cart_items (cart_id, product_type_id, quantity, weight_kg)
               VALUES ($1, $2, $3, NULL) RETURNING id`,
              [cartId, item.product_type_id, item.quantity]
            )
            await client.query(
              `INSERT INTO cart_item_services
                 (cart_item_id, service_id, unit_price, line_total, is_express, express_multiplier)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [ci.rows[0].id, item.service_id, item.unit_price,
               item.line_total, item.is_express, item.express_multiplier]
            )
          }
        }
      }

      return { cart_id: cartId, draft_order_number: draftOrderNumber }
    })

    return successResponse({
      saved:              true,
      cart_id:            result.cart_id,
      draft_order_number: result.draft_order_number,
    })
  } catch (err) {
    console.error('[POST /api/customer/cart]', err)
    return serverErrorResponse('Failed to save cart')
  }
}

// ---- DELETE -----------------------------------------------------------------
// Clears the cart entirely after a successful order. Called by order create route.
// Also accessible directly for "clear cart" action.

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    await query(`DELETE FROM shopping_carts WHERE user_id = $1`, [userId])
    return successResponse({ cleared: true })
  } catch (err) {
    console.error('[DELETE /api/customer/cart]', err)
    return serverErrorResponse('Failed to clear cart')
  }
}
