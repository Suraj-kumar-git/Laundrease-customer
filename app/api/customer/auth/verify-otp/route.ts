import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { checkRateLimit, generateAccessToken, generateRefreshToken, generateSessionId, getClientIP, setAuthCookies } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'
 
export async function POST(req: NextRequest) {
  try {
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 10,
      windowMs: 15 * 60 * 1000,
      sessionDurationMs: 60 * 60 * 1000,
    })
 
    if (!rateLimit.allowed) {
      return errorResponse('Too many verification attempts', 429, 'RATE_LIMIT_EXCEEDED')
    }
 
    const { email, phone, emailOtp, phoneOtp } = await req.json()

    // Validate required fields — at least one OTP must be submitted, so
    // email and phone can each be verified independently via their own button.
    if (!email || !phone || (!emailOtp && !phoneOtp)) {
      return errorResponse(
        'At least one OTP code is required',
        400,
        'MISSING_FIELDS'
      )
    }

    // Get user by email and phone
    const user = await queryOne(
      `SELECT id, email, phone, metadata, email_verified, phone_verified, status, role_id
       FROM users
       WHERE email = $1 AND phone = $2 AND deleted_at IS NULL`,
      [email.toLowerCase(), phone]
    )

    if (!user) {
      return errorResponse('User not found', 404, 'USER_NOT_FOUND')
    }

    // Check if already verified
    if (user.email_verified && user.phone_verified) {
      return successResponse({
        message: 'Email and phone already verified',
        verified: true,
        bothVerified: true,
        emailVerified: true,
        phoneVerified: true,
      })
    }

    const metadata = user.metadata || {}
    const storedEmailOtp = metadata.email_otp
    const storedPhoneOtp = metadata.phone_otp
    const emailExpiresAt = metadata.email_otp_expires_at
    const phoneExpiresAt = metadata.phone_otp_expires_at

    // Validation errors — only check the field(s) actually submitted, so
    // verifying email doesn't require (or fail because of) the phone code.
    const errors: any = {}

    if (emailOtp && !user.email_verified) {
      if (!storedEmailOtp || !emailExpiresAt) {
        errors.email = 'No email verification code found. Please request a new one.'
      } else if (new Date() > new Date(emailExpiresAt)) {
        errors.email = 'Email verification code expired. Please request a new one.'
      } else if (storedEmailOtp !== emailOtp) {
        errors.email = 'Invalid email verification code'
      }
    }

    if (phoneOtp && !user.phone_verified) {
      if (!storedPhoneOtp || !phoneExpiresAt) {
        errors.phone = 'No phone verification code found. Please request a new one.'
      } else if (new Date() > new Date(phoneExpiresAt)) {
        errors.phone = 'Phone verification code expired. Please request a new one.'
      } else if (storedPhoneOtp !== phoneOtp) {
        errors.phone = 'Invalid phone verification code'
      }
    }

    // If any validation errors, return them
    if (Object.keys(errors).length > 0) {
      return errorResponse('Verification failed', 400, 'INVALID_OTP', { errors })
    }

    // Apply only the field(s) that were submitted and passed validation
    const verifyEmailNow = !!emailOtp && !user.email_verified
    const verifyPhoneNow = !!phoneOtp && !user.phone_verified

    const sets: string[] = []
    const metadataKeysToStrip: string[] = []
    if (verifyEmailNow) {
      sets.push('email_verified = true', 'email_verified_at = NOW()')
      metadataKeysToStrip.push("'email_otp'", "'email_otp_expires_at'")
    }
    if (verifyPhoneNow) {
      sets.push('phone_verified = true', 'phone_verified_at = NOW()')
      metadataKeysToStrip.push("'phone_otp'", "'phone_otp_expires_at'")
    }

    if (sets.length > 0) {
      await query(
        `UPDATE users
         SET ${sets.join(', ')},
             metadata = metadata - ${metadataKeysToStrip.join(' - ')}
         WHERE id = $1`,
        [user.id]
      )
    }

    const emailVerifiedNow = user.email_verified || verifyEmailNow
    const phoneVerifiedNow = user.phone_verified || verifyPhoneNow
    const bothVerified = emailVerifiedNow && phoneVerifiedNow

    const roleResult = await queryOne(
      'SELECT name FROM roles WHERE id = $1',
      [user.role_id]
    )
    const roleName = roleResult?.name || 'customer'
    const requiresApproval = user.status === 'pending_approval'
    // Create session and set cookies only once BOTH email and phone are
    // verified (across one or two separate calls), and only for non-pending users.
    if (bothVerified && !requiresApproval) {
      const sessionId   = generateSessionId()
      const accessToken = await generateAccessToken({
        userId:        String(user.id),
        email:         user.email,
        role:          roleName,
        sessionId,
        emailVerified: true,
        phoneVerified: true,
      })
      const refreshToken = await generateRefreshToken(
        String(user.id),
        sessionId,
        process.env.REFRESH_TOKEN_EXPIRY || '7d'
      )
      await setAuthCookies(accessToken, refreshToken)
      await query(
        `INSERT INTO user_sessions (user_id, session_id, refresh_token, expires_at, ip_address, user_agent)
        VALUES ($1, $2, $3, NOW() + INTERVAL '7 days', $4, $5)
        ON CONFLICT (session_id) DO NOTHING`,
        [user.id, sessionId, refreshToken, getClientIP(req), req.headers.get('user-agent') ?? 'unknown']
      ).catch(() => {}) // non-fatal
    }
    return successResponse({
      message: bothVerified ? 'Email and phone verified successfully' : 'Code verified',
      verified: true,
      bothVerified,
      emailVerified: emailVerifiedNow,
      phoneVerified: phoneVerifiedNow,
      requiresApproval: bothVerified ? requiresApproval : undefined,
      role: roleName,
      userId: user.id,
    })
  } catch (error) {
    console.error('Verification error:', error)
    return errorResponse('Verification failed', 500)
  }
}