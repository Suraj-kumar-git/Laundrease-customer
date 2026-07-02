import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { 
  generateOTP, 
  checkRateLimit, 
  getClientIP 
} from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
import { sendOtpEmail } from '@/lib/notifications/email'
import { sendOtpSms } from '@/lib/notifications/sms'
import { sendSMSOtpOnEmail } from '@/lib/notifications/temp-sms-otp-on-email'

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000,
      sessionDurationMs: 60 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return errorResponse('Too many resend attempts', 429, 'RATE_LIMIT_EXCEEDED')
    }

    const { type, email, phone } = await req.json()

    if (!type || (type === 'email' && !email) || (type === 'phone' && !phone)) {
      return errorResponse('Invalid request', 400, 'INVALID_REQUEST')
    }

    const identifier = type === 'email' ? email.toLowerCase() : phone
    const column = type === 'email' ? 'email' : 'phone'

    const user = await queryOne(
      `SELECT id, email, ${column}, ${column}_verified FROM users WHERE ${column} = $1 AND deleted_at IS NULL`,
      [identifier]
    )

    if (!user) {
      return errorResponse('User not found', 404, 'USER_NOT_FOUND')
    }

    if (user[`${column}_verified`]) {
      return successResponse({ message: `${type} already verified`, verified: true })
    }

    const newOtp = generateOTP(6)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    const metadataKey = type === 'email' ? 'email_otp' : 'phone_otp'
    const expiryKey = type === 'email' ? 'email_otp_expires_at' : 'phone_otp_expires_at'

    await query(
      `UPDATE users
      SET metadata = jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          ARRAY[$2]::text[],
          to_jsonb($3::text),
          true
        ),
        ARRAY[$4]::text[],
        to_jsonb($5::text),
        true
      )
      WHERE id = $1`,
      [user.id, metadataKey, newOtp, expiryKey, expiresAt.toISOString()]
    )

    if (type === 'email') {
      await sendOtpEmail(identifier, newOtp)
    } else {
      // Phone OTP routed to the user's registered email temporarily (SMS DLT templates pending)
      await sendSMSOtpOnEmail((user as any).email || '', newOtp)
    }

    return successResponse({
      message: `Verification code sent to your ${type}`,
      sent: true,
    })
  } catch (error) {
    console.error('Resend OTP error:', error)
    return errorResponse('Failed to resend code', 500)
  }
}