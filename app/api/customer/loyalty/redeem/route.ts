// app/api/customer/loyalty/redeem/route.ts
// POST — convert all redeemable loyalty points into wallet balance

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, serverErrorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    // Read current points
    const profileRes = await query(
      `SELECT loyalty_points FROM customer_profiles WHERE user_id = $1`,
      [userId]
    )
    if (profileRes.rowCount === 0) return errorResponse('Profile not found', 404)

    const currentPoints = parseInt(profileRes.rows[0].loyalty_points ?? '0')
    if (currentPoints < 100)
      return errorResponse(`Minimum 100 points required to redeem. You have ${currentPoints} points.`, 400)

    // Call DB function — handles atomicity
    const result = await query(
      `SELECT redeem_loyalty_points($1, $2) AS result`,
      [userId, currentPoints]
    )
    const res = result.rows[0].result

    if (!res.success) {
      const reasons: Record<string, string> = {
        minimum_100_points_required: 'Minimum 100 points required to redeem',
        profile_not_found:           'Profile not found',
        insufficient_points:         'Insufficient points',
      }
      return errorResponse(reasons[res.reason] ?? 'Redemption failed', 400)
    }

    return successResponse({
      redeemed_points: res.redeemed_points,
      wallet_credited: parseFloat(res.wallet_credited),
      new_balance:     res.new_balance,
    })
  } catch (err) {
    console.error('[POST /api/customer/loyalty/redeem]', err)
    return serverErrorResponse('Failed to redeem loyalty points')
  }
}
