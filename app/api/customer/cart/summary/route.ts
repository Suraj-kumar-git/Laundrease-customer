// app/api/customer/cart/summary/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

// GET /api/customer/cart/summary
// Lightweight — used by header cart icon badge

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const result = await query(
      `SELECT
         COUNT(ci.id)::int AS item_count,
         COALESCE(sc.subtotal, 0) AS subtotal
       FROM shopping_carts sc
       LEFT JOIN cart_items ci ON ci.cart_id = sc.id
       WHERE sc.user_id = $1
       GROUP BY sc.subtotal`,
      [userId]
    )

    if (result.rowCount === 0) {
      return successResponse({ item_count: 0, subtotal: 0, has_active_cart: false })
    }

    return successResponse({
      item_count: result.rows[0].item_count,
      subtotal: parseFloat(result.rows[0].subtotal),
      has_active_cart: result.rows[0].item_count > 0,
    })
  } catch (error) {
    console.error('[GET /api/customer/cart/summary]', error)
    return successResponse({ item_count: 0, subtotal: 0, has_active_cart: false })
  }
}
