import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { generateOTP } from '@/lib/auth'
import { sendOtpEmail } from '@/lib/notifications/email'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// POST /api/customer/profile/email/request-otp
// Auth required — step 1 of changing the account email. Sends a 6-digit OTP
// to the NEW address (proves the customer actually owns it) and stashes the
// pending change in users.metadata until it's confirmed.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_TTL_MS = 10 * 60 * 1000

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { new_email?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const newEmail = body.new_email?.trim().toLowerCase()
  if (!newEmail || !EMAIL_RE.test(newEmail)) {
    return validationError({ new_email: 'Enter a valid email address' })
  }

  try {
    const current = await queryOne<{ email: string }>(
      `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (!current) return errorResponse('User not found', 404)

    if (current.email.toLowerCase() === newEmail) {
      return validationError({ new_email: 'This is already your current email address' })
    }

    // Uniqueness — DB also enforces this (users.email is UNIQUE), this is
    // just to surface a friendly error before sending an OTP for nothing.
    const taken = await queryOne<{ id: number }>(
      `SELECT id FROM users WHERE email = $1 AND id != $2 AND deleted_at IS NULL`,
      [newEmail, userId]
    )
    if (taken) return validationError({ new_email: 'This email address is already in use' })

    const otp = generateOTP(6)
    const expiresAt = new Date(Date.now() + OTP_TTL_MS)

    await query(
      `UPDATE users
       SET metadata = COALESCE(metadata, '{}'::jsonb)
             || jsonb_build_object(
                  'pending_email', $1::text,
                  'pending_email_otp', $2::text,
                  'pending_email_otp_expires_at', $3::text
                ),
           updated_at = NOW()
       WHERE id = $4`,
      [newEmail, otp, expiresAt.toISOString(), userId]
    )

    await sendOtpEmail(newEmail, otp)

    return successResponse({ sent: true, new_email: newEmail, expires_in_seconds: OTP_TTL_MS / 1000 })
  } catch (error) {
    console.error('[POST /api/customer/profile/email/request-otp]', error)
    return serverErrorResponse('Failed to send verification code')
  }
}
