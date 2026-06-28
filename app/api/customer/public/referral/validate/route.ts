// app/api/customer/public/referral/validate/route.ts
// GET ?code=LDR-XXXXXXX — public, unauthenticated lookup used by the
// registration form to show "You've been referred by <name>" (or a
// rejection reason) before the account even exists, so the referral_code
// field can be validated as the user types instead of only failing
// silently after sign-up.

import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase()
    if (!code) return errorResponse('code is required', 400)

    const config = await queryOne<{ is_active: boolean }>(
      `SELECT is_active FROM referral_program_config WHERE id = 1`
    )
    if (!config?.is_active) {
      return successResponse({ valid: false, reason: 'referral_program_inactive' })
    }

    const referrer = await queryOne<{ full_name: string }>(
      `SELECT u.full_name
       FROM customer_referral_codes crc
       JOIN users u ON u.id = crc.user_id
       WHERE crc.code = $1 AND crc.is_active = TRUE AND u.deleted_at IS NULL`,
      [code]
    )

    if (!referrer) {
      return successResponse({ valid: false, reason: 'invalid_code' })
    }

    return successResponse({ valid: true, referrer_name: referrer.full_name })
  } catch (error) {
    console.error('[GET /api/customer/public/referral/validate]', error)
    return errorResponse('Failed to validate referral code', 500)
  }
}
