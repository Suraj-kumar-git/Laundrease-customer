// app/api/customer/cart/coupon/route.ts
import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

// POST /api/customer/cart/coupon — apply coupon to cart
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { coupon_code: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }
  if (!body.coupon_code?.trim()) return errorResponse('coupon_code required', 400)

  try {
    await transaction(async (client) => {
      // Get or create cart
      let cartId: number
      const existing = await client.query(
        `SELECT id FROM shopping_carts WHERE user_id = $1`, [userId]
      )
      if (existing.rowCount === 0) {
        const created = await client.query(
          `INSERT INTO shopping_carts (user_id) VALUES ($1) RETURNING id`, [userId]
        )
        cartId = created.rows[0].id
      } else {
        cartId = existing.rows[0].id
      }

      // Upsert coupon (remove existing first — one coupon at a time)
      await client.query(`DELETE FROM cart_coupons WHERE cart_id = $1`, [cartId])
      await client.query(
        `INSERT INTO cart_coupons (cart_id, coupon_code) VALUES ($1, $2)
         ON CONFLICT (cart_id, coupon_code) DO NOTHING`,
        [cartId, body.coupon_code.toUpperCase()]
      )

      // Record discount in cart_adjustments
      // First remove any existing coupon adjustment
      await client.query(
        `DELETE FROM cart_adjustments WHERE cart_id = $1 AND kind = 'coupon'`, [cartId]
      )
      // We can't compute the exact amount here without knowing the cart subtotal
      // The amount will be set properly when the order is created
      // Just record the code reference
      await client.query(
        `INSERT INTO cart_adjustments (cart_id, kind, amount, note, metadata)
         VALUES ($1, 'coupon', 0, $2, $3)`,
        [cartId, `Coupon: ${body.coupon_code.toUpperCase()}`,
         JSON.stringify({ coupon_code: body.coupon_code.toUpperCase() })]
      )
    })
    return successResponse({ saved: true })
  } catch (error) {
    console.error('[POST /api/customer/cart/coupon]', error)
    return serverErrorResponse('Failed to save coupon')
  }
}

// DELETE /api/customer/cart/coupon — remove applied coupon from cart
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const cartRes = await query(
      `SELECT id FROM shopping_carts WHERE user_id = $1`, [userId]
    )
    if (cartRes.rowCount === 0) return successResponse({ removed: true })

    const cartId = cartRes.rows[0].id
    await query(`DELETE FROM cart_coupons WHERE cart_id = $1`, [cartId])
    await query(`DELETE FROM cart_adjustments WHERE cart_id = $1 AND kind = 'coupon'`, [cartId])
    return successResponse({ removed: true })
  } catch (error) {
    console.error('[DELETE /api/customer/cart/coupon]', error)
    return serverErrorResponse('Failed to remove coupon')
  }
}
