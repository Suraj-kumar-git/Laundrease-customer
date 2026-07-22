// app/api/customer/orders/fees/route.ts
// GET /api/customer/orders/fees?subtotal=500&is_express=false&provider_id=123
// Returns all active fee rows calculated for the given subtotal.
// Called by the checkout page to show a live breakdown before placing the order.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const subtotalStr  = searchParams.get('subtotal')
  const isExpressStr = searchParams.get('is_express')
  const providerIdStr = searchParams.get('provider_id')

  if (!subtotalStr) return errorResponse('subtotal is required', 400)

  const subtotal        = parseFloat(subtotalStr)
  const isExpress       = isExpressStr === 'true'
  const parsedProviderId = providerIdStr ? parseInt(providerIdStr) : NaN
  const providerId       = isNaN(parsedProviderId) ? null : parsedProviderId

  if (isNaN(subtotal) || subtotal < 0) return errorResponse('Invalid subtotal', 400)

  try {
    const result = await query(
      `SELECT calculate_order_fees($1, $2, NULL, $3) AS fees`,
      [subtotal, isExpress, providerId]
    )

    const fees: Array<{
      code: string
      display_name: string
      charge_type: string
      amount: number
      is_free: boolean
    }> = result.rows[0].fees

    const feesTotal = fees.reduce((s, f) => s + parseFloat(String(f.amount)), 0)
    const total     = Math.max(0, subtotal + feesTotal)

    return successResponse({
      subtotal,
      fees,
      fees_total:  feesTotal,
      grand_total: total,
    })
  } catch (error) {
    console.error('[GET /api/customer/orders/fees]', error)
    return serverErrorResponse('Failed to calculate fees')
  }
}
