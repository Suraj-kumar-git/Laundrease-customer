import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { resolveProfileImageUrl } from '@/lib/s3'
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
         cp.marketing_opt_in, cp.gstin,
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
      profile_image: await resolveProfileImageUrl(row.profile_image),
      email_verified: row.email_verified,
      phone_verified: row.phone_verified,
      created_at: row.created_at,
      loyalty_points: row.loyalty_points,
      total_orders: row.total_orders,
      last_order_at: row.last_order_at,
      marketing_opt_in: row.marketing_opt_in,
      gstin: row.gstin,
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

  let body: { full_name?: string; phone?: string; gstin?: string | null }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const full_name = body.full_name?.trim()
  const phone = body.phone?.trim()
  const gstin = body.gstin?.trim().toUpperCase()
  const errors: Record<string, string> = {}

  if (!full_name || full_name.length < 2) errors.full_name = 'Name must be at least 2 characters'
  if (full_name && full_name.length > 255) errors.full_name = 'Name is too long'
  if (phone && !/^\+?[1-9]\d{1,14}$/.test(phone)) errors.phone = 'Invalid phone number format'
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin))
    errors.gstin = 'Enter a valid GST number (e.g. 22AAAAA0000A1Z5)'

  if (Object.keys(errors).length > 0) return validationError(errors)

  try {
    const current = await query(
      `SELECT phone, phone_verified FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (current.rowCount === 0) return errorResponse('User not found', 404)
    const { phone: currentPhone, phone_verified: phoneVerified } = current.rows[0]

    // A verified phone number can't be changed in-place (mirrors the old
    // email-lock behaviour, swapped onto phone now that email changes go
    // through their own OTP-verified flow).
    if (phone && phoneVerified && phone !== currentPhone) {
      return errorResponse('Your phone number is verified and cannot be changed here. Contact support if you need to update it.', 400)
    }

    // Check phone uniqueness if being changed
    if (phone && phone !== currentPhone) {
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

    // gstin lives on customer_profiles, not users — only touched when the
    // request actually includes the key (so other profile edits that don't
    // mention it never accidentally clear a saved GSTIN).
    if (body.gstin !== undefined) {
      await query(
        `UPDATE customer_profiles SET gstin = $1, updated_at = NOW() WHERE user_id = $2`,
        [gstin || null, userId]
      )
    }

    return successResponse({ updated: true, full_name, phone: phone || currentPhone, gstin: gstin || null })
  } catch (error) {
    console.error('[PUT /api/customer/profile]', error)
    return serverErrorResponse('Failed to update profile')
  }
}
