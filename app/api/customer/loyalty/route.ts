// app/api/customer/loyalty/route.ts
// GET — loyalty points balance + full ledger history

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const [profileRes, ledgerRes] = await Promise.all([
      query(
        `SELECT loyalty_points FROM customer_profiles WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT
           l.id, l.kind, l.points, l.balance_after, l.reason,
           l.created_at, l.metadata,
           o.order_number
         FROM loyalty_points_ledger l
         LEFT JOIN orders o ON o.id = l.order_id
         WHERE l.user_id = $1
         ORDER BY l.created_at DESC
         LIMIT 50`,
        [userId]
      ),
    ])

    const currentPoints = parseInt(profileRes.rows[0]?.loyalty_points ?? '0')
    const canRedeem     = currentPoints >= 100

    return successResponse({
      points:      currentPoints,
      can_redeem:  canRedeem,
      min_redeem:  100,
      rupee_value: currentPoints, // 1 point = ₹1
      ledger: ledgerRes.rows.map(r => ({
        id:           r.id,
        kind:         r.kind,
        points:       r.points,
        balance_after:r.balance_after,
        reason:       r.reason,
        order_number: r.order_number ?? null,
        metadata:     r.metadata,
        created_at:   r.created_at,
      })),
    })
  } catch (err) {
    console.error('[GET /api/customer/loyalty]', err)
    return serverErrorResponse('Failed to fetch loyalty data')
  }
}
