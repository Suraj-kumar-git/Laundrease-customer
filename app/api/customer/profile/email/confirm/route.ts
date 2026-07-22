import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// POST /api/customer/profile/email/confirm
// Auth required — step 2 of changing the account email. Verifies the OTP
// sent to the pending new address, then swaps it in. users.email is UNIQUE
// (citext) at the DB level, so a race with another account claiming the
// same address concurrently is still caught — just as a 409 instead of a
// validation error.

interface UserRow {
  email: string
  metadata: Record<string, string> | null
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { otp?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const otp = body.otp?.trim()
  if (!otp) return validationError({ otp: 'Enter the 6-digit code' })

  try {
    const user = await queryOne<UserRow>(
      `SELECT email, metadata FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (!user) return errorResponse('User not found', 404)

    const metadata = user.metadata || {}
    const pendingEmail = metadata.pending_email
    const storedOtp     = metadata.pending_email_otp
    const expiresAt      = metadata.pending_email_otp_expires_at

    if (!pendingEmail || !storedOtp || !expiresAt) {
      return errorResponse('No pending email change found. Please start again.', 400)
    }
    if (new Date() > new Date(expiresAt)) {
      return errorResponse('Verification code expired. Please request a new one.', 400)
    }
    if (storedOtp !== otp) {
      return validationError({ otp: 'Invalid verification code' })
    }

    try {
      await query(
        `UPDATE users
         SET email = $1,
             email_verified = true,
             email_verified_at = NOW(),
             metadata = metadata - 'pending_email' - 'pending_email_otp' - 'pending_email_otp_expires_at',
             updated_at = NOW()
         WHERE id = $2`,
        [pendingEmail, userId]
      )
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') { // unique_violation on users.email
        return validationError({ otp: 'This email address was just taken by another account' })
      }
      throw err
    }

    return successResponse({ email: pendingEmail, email_verified: true })
  } catch (error) {
    console.error('[POST /api/customer/profile/email/confirm]', error)
    return serverErrorResponse('Failed to confirm email change')
  }
}
