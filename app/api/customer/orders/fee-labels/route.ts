// app/api/customer/orders/fee-labels/route.ts
// GET /api/customer/orders/fee-labels
// Returns a map of fee_code → display_name sourced from order_fee_config.
// Used by the order detail page to label each order_adjustments row.
// Tax ('surcharge' kind, fee_code='tax') is included as a hardcoded entry
// since it is not stored in order_fee_config.
// Public within app — no sensitive data, but still requires auth.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const res = await query(
      `SELECT code, display_name
       FROM order_fee_config
       ORDER BY sort_order`
    )

    // Build code → display_name map from DB
    const labels: Record<string, string> = {}
    for (const row of res.rows) {
      labels[row.code] = row.display_name
    }

    // Tax is not in order_fee_config — add it manually
    if (!labels['tax']) labels['tax'] = 'GST (18%)'

    // Add coupon as a fallback label (coupon adjustments use the coupon code in note)
    if (!labels['coupon']) labels['coupon'] = 'Coupon Discount'

    return successResponse({ labels })
  } catch (error) {
    console.error('[GET /api/customer/orders/fee-labels]', error)
    return serverErrorResponse('Failed to load fee labels')
  }
}
