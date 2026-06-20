import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// GET /api/customer/referral
// Auth required — returns own referral code, stats, and referees list

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    // Get or auto-generate referral code
    let codeResult = await query(
      `SELECT id, code, total_referrals, total_earnings, is_active, created_at
       FROM customer_referral_codes WHERE user_id = $1`,
      [userId]
    )

    // Auto-generate if not exists (lazy generation)
    if (codeResult.rowCount === 0) {
      await query(`SELECT generate_referral_code($1)`, [userId])
      codeResult = await query(
        `SELECT id, code, total_referrals, total_earnings, is_active, created_at
         FROM customer_referral_codes WHERE user_id = $1`,
        [userId]
      )
    }

    const codeRow = codeResult.rows[0]

    // Get referees with their reward transactions
    const refereesResult = await query(
      `SELECT
         ru.id,
         -- Mask referee name: "Rahul S."
         CONCAT(
           SPLIT_PART(u.full_name, ' ', 1), ' ',
           LEFT(COALESCE(SPLIT_PART(u.full_name, ' ', 2), '?'), 1), '.'
         ) AS referee_name,
         ru.orders_counted,
         ru.total_earned_by_referrer,
         ru.status,
         ru.referee_discount_applied,
         ru.created_at
       FROM referral_uses ru
       JOIN users u ON u.id = ru.referee_user_id
       WHERE ru.referrer_user_id = $1
       ORDER BY ru.created_at DESC`,
      [userId]
    )

    // Get reward transactions per referee
    const refereeIds = refereesResult.rows.map((r: any) => r.id)
    const txnsByUse: Record<number, any[]> = {}

    if (refereeIds.length > 0) {
      const txnsResult = await query(
        `SELECT
           referral_use_id, order_id,
           order_amount, reward_percent, reward_amount, created_at
         FROM referral_reward_transactions
         WHERE referral_use_id = ANY($1::int[])
         ORDER BY created_at DESC`,
        [refereeIds]
      )
      txnsResult.rows.forEach((t: any) => {
        txnsByUse[t.referral_use_id] = txnsByUse[t.referral_use_id] ?? []
        txnsByUse[t.referral_use_id].push({
          order_id: t.order_id,
          order_amount: Number(t.order_amount),
          reward_percent: Number(t.reward_percent),
          reward_amount: Number(t.reward_amount),
          created_at: t.created_at,
        })
      })
    }

    // Check if this user was referred
    const wasReferredResult = await query(
      `SELECT ru.status, ru.referee_coupon_code, ru.referee_discount_applied,
              cp.referred_by_code
       FROM customer_profiles cp
       LEFT JOIN referral_uses ru ON ru.referee_user_id = $1
       WHERE cp.user_id = $1`,
      [userId]
    )
    const referralStatus = wasReferredResult.rows[0]

    return successResponse({
      code: codeRow.code,
      total_referrals: codeRow.total_referrals,
      total_earnings: Number(codeRow.total_earnings),
      is_active: codeRow.is_active,
      created_at: codeRow.created_at,
      referees: refereesResult.rows.map((r: any) => ({
        referee_name: r.referee_name,
        orders_counted: r.orders_counted,
        total_earned_by_referrer: Number(r.total_earned_by_referrer),
        status: r.status,
        created_at: r.created_at,
        reward_transactions: txnsByUse[r.id] ?? [],
      })),
      was_referred: !!referralStatus?.referred_by_code,
      referred_by_code: referralStatus?.referred_by_code ?? null,
      own_coupon_code: referralStatus?.referee_coupon_code ?? null,
      own_discount_applied: referralStatus?.referee_discount_applied ?? false,
    })
  } catch (error) {
    console.error('[GET /api/customer/referral]', error)
    return serverErrorResponse('Failed to fetch referral data')
  }
}

// POST /api/customer/referral/apply
// Auth required — apply a referral code to the logged-in user's account
// Body: { code: string }

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { code?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const code = body.code?.trim().toUpperCase()
  if (!code) return errorResponse('Referral code is required', 400)

  // Basic format check
  if (!/^[A-Z]{2,10}-[A-Z0-9]{4,12}$/.test(code)) {
    return errorResponse('Invalid referral code format', 400)
  }

  try {
    const result = await query<{ result: any }>(
      `SELECT apply_referral_code($1, $2) AS result`,
      [userId, code]
    )

    const outcome = result.rows[0].result;
    const parsed = typeof outcome === 'string' ? JSON.parse(outcome) : outcome

    if (!parsed.success) {
      const messages: Record<string, string> = {
        referral_program_inactive: 'The referral program is not currently active.',
        invalid_code: 'This referral code is invalid or has been deactivated.',
        self_referral: 'You cannot use your own referral code.',
        already_referred: 'You have already used a referral code.',
      }
      return errorResponse(messages[parsed.reason] ?? 'Could not apply referral code.', 400)
    }

    return successResponse({
      applied: true,
      coupon_code: parsed.coupon_code,
      discount_type: parsed.discount_type,
      discount_value: parsed.discount_value,
      expires_in_days: parsed.expires_in_days,
    })
  } catch (error) {
    console.error('[POST /api/customer/referral/apply]', error)
    return serverErrorResponse('Failed to apply referral code')
  }
}
