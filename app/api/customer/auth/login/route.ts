// app/api/customer/auth/login/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { query, queryOne } from '@/lib/db'
import {
  verifyPassword,
  generateSessionId,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  checkRateLimit,
  getClientIP,
  generateOTP,
} from '@/lib/auth'
import {
  successResponse,
  errorResponse,
  validationError,
} from '@/lib/api-response'
import { sendOtpSms } from '@/lib/notifications/sms'
import { sendOtpEmail } from '@/lib/notifications/email'
 
// Validation schema
const loginSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().min(1, 'Phone is required').optional(),
  password: z.string().min(1, 'Password is required'),
  remember_me: z.boolean().optional().default(false),
  role: z
    .enum(['customer'])
    .optional(),
}).refine(
  data => !!data.email || !!data.phone,
  {
    message: 'Email or phone is required',
    path: ['email'],
  }
)
 
export async function POST(req: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 10, // Max 10 login attempts
      windowMs: 15 * 60 * 1000, // Per 15 minutes
      sessionDurationMs: 60 * 60 * 1000, // 1 hour session
    })
 
    if (!rateLimit.allowed) {
      if (!rateLimit.sessionValid) {
        return errorResponse(
          'Session expired. Please refresh the page and try again.',
          429,
          'SESSION_EXPIRED'
        )
      }
      return errorResponse(
        'Too many login attempts. Please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED',
        {
          resetAt: new Date(rateLimit.resetAt).toISOString(),
          remaining: rateLimit.remaining,
        }
      )
    }
 
    // Parse and validate request body
    const body = await req.json()
    const validation = loginSchema.safeParse(body)
 
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return validationError(errors as any)
    }
 
    const { email, phone, password, remember_me, role } = validation.data;
 
    // Get user from database with role
    const user = await queryOne<{
      id: string
      email: string
      password_hash: string
      full_name: string
      phone: string | null
      role_id: number
      role_name: string
      status: string
      email_verified: boolean
      phone_verified: boolean
      profile_image: string | null
    }>(
      `
      SELECT
        u.id,
        u.email,
        u.password_hash,
        u.full_name,
        u.phone,
        u.role_id,
        r.name as role_name,
        u.status,
        u.email_verified,
        u.phone_verified,
        u.profile_image
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE (
        ($1::text IS NOT NULL AND LOWER(u.email) = $1)
        OR
        ($2::text IS NOT NULL AND u.phone = $2)
      )
        AND u.deleted_at IS NULL
      LIMIT 1
    `,
      [email ?? null, phone ?? null]
    )
 
    // Check if user exists
    if (!user) {
      // Don't reveal if email exists or not (security)
      return errorResponse(
        'Invalid email/phone or password',
        401,
        'INVALID_CREDENTIALS'
      )
    }
 
    // Check if role matches (if provided)
    if (role && user.role_name !== role) {
      return errorResponse(
        'Invalid credentials for this role',
        401,
        'INVALID_ROLE'
      )
    }
 
    // Check user status
    if (user.status === 'suspended') {
      return errorResponse(
        'Your account has been suspended. Please contact support.',
        403,
        'ACCOUNT_SUSPENDED'
      )
    }
 
    if (user.status === 'inactive') {
      return errorResponse(
        'Your account is inactive. Please contact support.',
        403,
        'ACCOUNT_INACTIVE'
      )
    }
 
    // Verify password
    const isPasswordValid = await verifyPassword(password, user.password_hash)
 
    if (!isPasswordValid) {
      // Track failed login attempt
      await query(
        `UPDATE users
         SET metadata = jsonb_set(
           COALESCE(metadata, '{}'::jsonb),
           '{failed_login_attempts}',
           to_jsonb(COALESCE((metadata->>'failed_login_attempts')::int, 0) + 1)
         )
         WHERE id = $1`,
        [user.id]
      ).catch(() => {})
 
      return errorResponse(
        'Invalid email or password',
        401,
        'INVALID_CREDENTIALS'
      )
    }
    // If email or phone not verified, send new OTPs and redirect to verify page
    const phoneVerificationRequired = user.phone && !user.phone_verified;
    const emailVerificationRequired = user.email && !user.email_verified;
    if (phoneVerificationRequired || emailVerificationRequired) {
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000)
      let emailOTP: string | null = null
      let phoneOTP: string | null = null
      const metadataUpdates: Record<string, string> = {}
      if(phoneVerificationRequired) {
        phoneOTP = generateOTP(6);
        metadataUpdates.phone_otp = phoneOTP
        metadataUpdates.phone_otp_expires_at = otpExpiresAt.toISOString()
        if (user.phone) await sendOtpSms(user.phone, phoneOTP, 'signin').catch(() => {})
      }
      if(emailVerificationRequired){
        emailOTP = generateOTP(6);
        metadataUpdates.email_otp = emailOTP
        metadataUpdates.email_otp_expires_at = otpExpiresAt.toISOString()
        await sendOtpEmail(user.email, emailOTP).catch(() => {})
      }
      if (Object.keys(metadataUpdates).length > 0) {
        await query(
          `UPDATE users
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
          WHERE id = $2`,
          [JSON.stringify(metadataUpdates), user.id]
        )
      }
      return successResponse(
        {
          requiresVerification: phoneVerificationRequired || emailVerificationRequired,
          email: user.email,
          phone: user.phone,
          message: 'We need both email & phone verified...',
        },
        200
      )
    }
 
    // Reset failed login attempts on successful login
    await query(
      `UPDATE users
       SET metadata = jsonb_set(
         COALESCE(metadata, '{}'::jsonb),
         '{failed_login_attempts}',
         '0'
       )
       WHERE id = $1`,
      [user.id]
    ).catch(() => {})
 
    // Update last login timestamp
    await query('UPDATE users SET last_logged_in = NOW() WHERE id = $1', [
      user.id,
    ])
 
    // Generate session and tokens
    const sessionId = generateSessionId()
    const accessToken = await generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role_name,
      sessionId,
      emailVerified: user.email_verified,
      phoneVerified: user.phone_verified
    })
    
    // Longer expiry for remember me
    const refreshTokenExpiry = remember_me ? '30d' : '7d'
    const refreshToken = await generateRefreshToken(user.id, sessionId, refreshTokenExpiry)
 
    // Set cookies
    await setAuthCookies(accessToken, refreshToken)
 
    // Store session in database
    await query(
      `INSERT INTO user_sessions (user_id, session_id, refresh_token, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE SET
         last_activity = NOW(),
         ip_address = $5,
         user_agent = $6`,
      [
        user.id,
        sessionId,
        refreshToken,
        new Date(Date.now() + (remember_me ? 30 : 7) * 24 * 60 * 60 * 1000),
        clientIP,
        req.headers.get('user-agent') || 'unknown',
      ]
    ).catch(() => {
      // Session table might not exist yet, ignore error
    })
 
    // Get role-specific profile data
    let profileData = null
 
    if (user.role_name === 'customer') {
      profileData = await queryOne(
        `SELECT
          loyalty_points,
          total_orders,
          last_order_at
        FROM customer_profiles
        WHERE user_id = $1`,
        [user.id]
      )
    }
 
    // Return success response
    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role_name,
        status: user.status,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        profile_image: user.profile_image,
        ...profileData,
      },
      message: 'Login successful',
    })
  } catch (error) {
    console.error('Login error:', error)
    return errorResponse('Login failed. Please try again.', 500)
  }
}