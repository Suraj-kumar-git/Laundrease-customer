// app/api/customer/orders/[id]/invoice/route.ts
// GET /api/customer/orders/:id/invoice
//
// Flow:
//  1. Authenticate customer (JWT)
//  2. Verify order belongs to this customer
//  3. Delegate to lib/order-invoice.ts (S3-cached PDF generation, shared
//     with the admin/support invoice routes)

import { NextRequest, NextResponse } from 'next/server'

import { getAuthUser } from '@/lib/auth'
import { queryOne }    from '@/lib/db'
import { serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'
import { getOrCreateOrderInvoiceUrl } from '@/lib/order-invoice'

export async function GET(
  req:     NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id: publicId } = await context.params

  const auth = await getAuthUser(req)
  if (!auth || auth.role !== 'customer') return unauthorizedResponse()
  const userId  = auth.id

  try {
    // Ownership check
    const order = await queryOne<{ id: number }>(
      `SELECT id FROM orders WHERE public_id = $1 AND customer_id = $2`,
      [publicId, userId]
    )
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 })
    }

    const result = await getOrCreateOrderInvoiceUrl(order.id)
    if (!result) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error('[GET /api/customer/orders/[id]/invoice]', error)
    return serverErrorResponse('Failed to generate invoice')
  }
}
