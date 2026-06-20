import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// GET /api/customer/profile
// Auth required — returns full profile data

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const result = await query(
      `SELECT
         u.id, u.full_name, u.email, u.phone,
         u.profile_image, u.email_verified, u.phone_verified,
         u.created_at,
         cp.loyalty_points, cp.total_orders, cp.last_order_at,
         cp.marketing_opt_in,
         COALESCE(wa.balance, 0) AS wallet_balance
       FROM users u
       JOIN customer_profiles cp ON cp.user_id = u.id
       LEFT JOIN wallet_accounts wa ON wa.user_id = u.id AND wa.currency = 'INR'
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    )

    if (result.rowCount === 0) return errorResponse('Profile not found', 404)

    const row = result.rows[0]
    return successResponse({
      id: row.id.toString(),
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      profile_image: row.profile_image,
      email_verified: row.email_verified,
      phone_verified: row.phone_verified,
      created_at: row.created_at,
      loyalty_points: row.loyalty_points,
      total_orders: row.total_orders,
      last_order_at: row.last_order_at,
      marketing_opt_in: row.marketing_opt_in,
      wallet_balance: Number(row.wallet_balance),
    })
  } catch (error) {
    console.error('[GET /api/customer/profile]', error)
    return serverErrorResponse('Failed to fetch profile')
  }
}

// PUT /api/customer/profile
// Auth required — update name and phone

export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { full_name?: string; phone?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const full_name = body.full_name?.trim()
  const phone = body.phone?.trim()
  const errors: Record<string, string> = {}

  if (!full_name || full_name.length < 2) errors.full_name = 'Name must be at least 2 characters'
  if (full_name && full_name.length > 255) errors.full_name = 'Name is too long'
  if (phone && !/^\+?[1-9]\d{1,14}$/.test(phone)) errors.phone = 'Invalid phone number format'

  if (Object.keys(errors).length > 0) return validationError(errors)

  try {
    // Check phone uniqueness if being changed
    if (phone) {
      const existing = await query(
        `SELECT id FROM users WHERE phone = $1 AND id != $2 AND deleted_at IS NULL`,
        [phone, userId]
      )
      if (existing.rowCount! > 0) return errorResponse('Phone number already in use', 409)
    }

    await query(
      `UPDATE users SET full_name = $1, phone = COALESCE($2, phone), updated_at = NOW()
       WHERE id = $3`,
      [full_name, phone || null, userId]
    )

    return successResponse({ updated: true, full_name, phone })
  } catch (error) {
    console.error('[PUT /api/customer/profile]', error)
    return serverErrorResponse('Failed to update profile')
  }
}
