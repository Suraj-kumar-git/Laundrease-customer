// app/api/customer/cart/items/[id]/route.ts
// PATCH  — update a single cart item's quantity (per-unit) or weight_kg
//          (per-kg). Fee/subtotal recompute is handled entirely by existing
//          DB triggers (trg_ci_recompute_services -> trg_cis_compute_line_
//          total_upd -> trg_cis_recalc_totals), so this route is just a
//          plain, ownership-scoped UPDATE — no app-side math needed.
// DELETE — remove a single cart item. cart_item_services cascades (ON DELETE
//          CASCADE), and the same trigger chain recalculates the cart total
//          minus this item.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params
  const itemId = parseInt(id, 10)
  if (isNaN(itemId)) return errorResponse('Invalid item id', 400)

  let body: { quantity?: number; weight_kg?: number }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (body.quantity == null && body.weight_kg == null)
    return errorResponse('quantity or weight_kg is required', 400)
  if (body.quantity != null && (!Number.isInteger(body.quantity) || body.quantity < 1))
    return errorResponse('quantity must be a whole number >= 1', 400)
  if (body.weight_kg != null && !(body.weight_kg >= 0.5))
    return errorResponse('weight_kg must be >= 0.5', 400)

  try {
    const result = body.weight_kg != null
      ? await query(
          `UPDATE cart_items SET weight_kg = $1
           WHERE id = $2 AND cart_id IN (SELECT id FROM shopping_carts WHERE user_id = $3)`,
          [body.weight_kg, itemId, userId]
        )
      : await query(
          `UPDATE cart_items SET quantity = $1
           WHERE id = $2 AND cart_id IN (SELECT id FROM shopping_carts WHERE user_id = $3)`,
          [body.quantity, itemId, userId]
        )

    if (result.rowCount === 0) return notFoundResponse('Cart item not found')
    return successResponse({ updated: true })
  } catch (err) {
    console.error('[PATCH /api/customer/cart/items/[id]]', err)
    return serverErrorResponse('Failed to update item')
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id } = await params
  const itemId = parseInt(id, 10)
  if (isNaN(itemId)) return errorResponse('Invalid item id', 400)

  try {
    const result = await query(
      `DELETE FROM cart_items
       WHERE id = $1 AND cart_id IN (SELECT id FROM shopping_carts WHERE user_id = $2)`,
      [itemId, userId]
    )
    if (result.rowCount === 0) return notFoundResponse('Cart item not found')
    return successResponse({ removed: true })
  } catch (err) {
    console.error('[DELETE /api/customer/cart/items/[id]]', err)
    return serverErrorResponse('Failed to remove item')
  }
}
