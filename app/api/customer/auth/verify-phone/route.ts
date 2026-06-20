import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { checkRateLimit, getClientIP } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      sessionDurationMs: 60 * 60 * 1000,
    })

    if (!rateLimit.allowed) {
      return errorResponse('Too many verification attempts', 429, 'RATE_LIMIT_EXCEEDED')
    }

    const { phone, otp } = await req.json()

    if (!phone || !otp) {
      return errorResponse('Phone and OTP are required', 400, 'MISSING_FIELDS')
    }

    const user = await queryOne(
      `SELECT id, metadata, phone_verified FROM users WHERE phone = $1 AND deleted_at IS NULL`,
      [phone]
    )

    if (!user) {
      return errorResponse('User not found', 404, 'USER_NOT_FOUND')
    }

    if (user.phone_verified) {
      return successResponse({ message: 'Phone already verified', verified: true })
    }

    const metadata = user.metadata || {}
    const storedOtp = metadata.phone_otp
    const expiresAt = metadata.phone_otp_expires_at

    if (!storedOtp || !expiresAt) {
      return errorResponse('No verification code found. Please request a new one.', 400, 'NO_OTP')
    }

    if (new Date() > new Date(expiresAt)) {
      return errorResponse('Verification code expired. Please request a new one.', 400, 'OTP_EXPIRED')
    }

    if (storedOtp !== otp) {
      return errorResponse('Invalid verification code', 400, 'INVALID_OTP')
    }

    await query(
      `UPDATE users 
       SET phone_verified = true, 
           phone_verified_at = NOW(),
           metadata = metadata - 'phone_otp' - 'phone_otp_expires_at'
       WHERE id = $1`,
      [user.id]
    )

    return successResponse({
      message: 'Phone verified successfully',
      verified: true,
    })
  } catch (error) {
    console.error('Phone verification error:', error)
    return errorResponse('Verification failed', 500)
  }
}