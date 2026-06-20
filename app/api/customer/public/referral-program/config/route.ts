import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/public/referral-program/config
// Public — shows program config for display on the Refer & Earn page
// Never exposes admin fields like updated_by

export async function GET(_req: NextRequest) {
  try {
    const result = await query(
      `SELECT
         is_active, program_name, program_description,
         referrer_reward_percent, referrer_max_reward_per_order,
         referrer_max_orders_per_referee,
         referee_discount_type, referee_discount_value,
         referee_discount_max_amount,
         min_order_amount_for_reward,
         referral_code_prefix
       FROM referral_program_config
       WHERE id = 1`
    )
    if (result.rowCount === 0) {
      return successResponse({ is_active: false })
    }
    return successResponse(result.rows[0])
  } catch (error) {
    console.error('[GET /api/customer/public/referral-program/config]', error)
    return serverErrorResponse('Failed to fetch program config')
  }
}
