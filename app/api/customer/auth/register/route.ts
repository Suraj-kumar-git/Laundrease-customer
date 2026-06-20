import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { query, queryOne, transaction } from '@/lib/db'
import {
  hashPassword,
  generateOTP,
  generateSessionId,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  checkRateLimit,
  getClientIP,
  validatePassword,
} from '@/lib/auth'
import {
  successResponse,
  errorResponse,
  validationError,
} from '@/lib/api-response'
import { sendOtpSms } from '@/lib/notifications/sms'
import { sendOtpEmail } from '@/lib/notifications/email'
 
// Validation schema - MODIFIED: phone is now required
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  phone: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'), // REMOVED .optional()
  role: z.string().includes('customer'),
})
 
export async function POST(req: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      sessionDurationMs: 60 * 60 * 1000,
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
        'Too many registration attempts. Please try again later.',
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

    // Extract referral_code before Zod validation — it's optional and not in the schema
    // We handle it separately so a bad/missing code never fails registration
    const referral_code: string | undefined =
      typeof body.referral_code === 'string' && body.referral_code.trim()
        ? body.referral_code.trim().toUpperCase()
        : undefined

    const validation = registerSchema.safeParse(body)
 
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return validationError(errors as any)
    }
 
    const { email, password, full_name, phone, role } = validation.data
 
    // Additional password validation
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.valid) {
      return errorResponse(
        'Password does not meet requirements',
        400,
        'WEAK_PASSWORD',
        { errors: passwordValidation.errors }
      )
    }
 
    // Use transaction for atomicity
    const result = await transaction(async (client) => {
      // Check if email already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1',
        [email.toLowerCase()]
      )
 
      if (existingUser.rows.length > 0) {
        throw new Error('EMAIL_EXISTS')
      }
 
      // Check if phone already exists - REMOVED condition, phone is required now
      const existingPhone = await client.query(
        'SELECT id FROM users WHERE phone = $1',
        [phone]
      )
 
      if (existingPhone.rows.length > 0) {
        throw new Error('PHONE_EXISTS')
      }
 
      // Get role_id from roles table
      const roleResult = await client.query(
        'SELECT id FROM roles WHERE name = $1',
        [role]
      )
 
      if (roleResult.rows.length === 0) {
        throw new Error('INVALID_ROLE')
      }
 
      // Hash password
      const passwordHash = await hashPassword(password)
      console.log('Generated Hash Password for Password@123:, ',passwordHash)
 
      // Generate OTPs for BOTH email and phone
      const emailOTP = generateOTP(6)
      const phoneOTP = generateOTP(6) // Always generate phone OTP now
      const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
 
      // NEW: Determine initial status based on role
      const initialStatus = role === 'customer' ? 'active' : 'pending_approval'
 
      // Insert user
      const userResult = await client.query(
        `
        INSERT INTO users (
          email,
          password_hash,
          full_name,
          phone,
          role_id,
          status,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, email, full_name, role_id
        `,
        [
          email.toLowerCase(),
          passwordHash,
          full_name,
          phone, // Phone is always provided now
          roleResult.rows[0].id,
          initialStatus, // CHANGED: Set based on role
          JSON.stringify({
            email_otp: emailOTP,
            phone_otp: phoneOTP, // Always included now
            email_otp_expires_at: otpExpiresAt.toISOString(),
            phone_otp_expires_at: otpExpiresAt.toISOString(), // Always included now
          }),
        ]
      )
 
      const user = userResult.rows[0]
 
      // NEW: Only create customer_profile if role is customer
      if (role === 'customer') {
        await client.query(
          `INSERT INTO customer_profiles (user_id, preferences) VALUES ($1, $2)`,
          [user.id, JSON.stringify({})]
        )
      }
      // For other roles, profiles will be created after admin approval + profile completion
 
      return { user, emailOTP, phoneOTP, role, initialStatus }
    })
 
    // ---- Referral code processing (customer only) -------------------------
    // Runs AFTER transaction so customer_profiles row is guaranteed to exist.
    // Both operations are non-fatal — a bad referral code never blocks registration.

    if (result.role === 'customer') {
      // 1. Apply referral code if provided
      if (referral_code) {
        try {
          const referralResult = await query<{ result: any }>(
            `SELECT apply_referral_code($1, $2) AS result`,
            [result.user.id, referral_code]
          )
          const outcome = referralResult.rows[0]?.result
          const parsed = typeof outcome === 'string' ? JSON.parse(outcome) : outcome
          if (!parsed?.success) {
            // Log the reason but don't fail — the register page will surface this
            // via the toast if the code was clearly invalid, but registration still succeeds
            console.warn('[register] Referral code not applied:', parsed?.reason, referral_code)
          }
        } catch (referralError) {
          // Never fail registration due to referral processing errors
          console.error('[register] Referral apply error (non-fatal):', referralError)
        }
      }

      // 2. Always generate a referral code for the new customer
      try {
        await query(`SELECT generate_referral_code($1)`, [result.user.id])
      } catch (codeGenError) {
        // Non-fatal — code will be lazily generated on first visit to refer & earn page
        console.error('[register] Referral code generation error (non-fatal):', codeGenError)
      }
    }

    // Send verification emails/SMS outside transaction
    try {
      await sendOtpEmail(result.user.email, result.emailOTP);
      await sendOtpSms(phone, result.phoneOTP, 'registration');
    } catch (error) {
      console.error('Failed to send verification:', error)
      // Don't fail registration if sending fails
    }
 
    // NEW: Different responses based on role
    if (result.role === 'customer') {
      // Customer flow: Generate session immediately
      const sessionId = generateSessionId()
      const accessToken = await generateAccessToken({
        userId: result.user.id,
        email: result.user.email,
        role: result.role,
        sessionId,
        emailVerified: false,
        phoneVerified: false
      })
      const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
      const refreshToken = await generateRefreshToken(result.user.id, sessionId, refreshTokenExpiry)
 
      // Set cookies
      await setAuthCookies(accessToken, refreshToken)
 
      // Store session in database
      await query(
        `INSERT INTO user_sessions (user_id, session_id, refresh_token, expires_at, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          result.user.id,
          sessionId,
          refreshToken,
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          clientIP,
          req.headers.get('user-agent') || 'unknown',
        ]
      ).catch(() => {
        // Session table might not exist yet, ignore error
      })
 
      return successResponse(
        {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            role: result.role,
            phone: phone,
            email_verified: false,
            phone_verified: false,
          },
          message: 'Registration successful! Please verify your email and phone to continue.',
          verification_required: true,
        },
        201
      )
    } else {
      // Non-customer flow: No session, wait for admin approval
      return successResponse(
        {
          user: {
            id: result.user.id,
            email: result.user.email,
            full_name: result.user.full_name,
            role: result.role,
            phone: phone,
            status: 'pending_approval',
          },
          message: 'Registration successful! Please verify your email and phone. Your account will be reviewed by our team.',
          verification_required: true,
          requires_admin_approval: true,
        },
        201
      )
    }
  } catch (error: any) {
    console.error('Registration error:', error)
 
    if (error.message === 'EMAIL_EXISTS') {
      return errorResponse('Email already registered', 409, 'EMAIL_EXISTS')
    }
 
    if (error.message === 'PHONE_EXISTS') {
      return errorResponse(
        'Phone number already registered',
        409,
        'PHONE_EXISTS'
      )
    }
 
    if (error.message === 'INVALID_ROLE') {
      return errorResponse('Invalid role', 400, 'INVALID_ROLE')
    }
 
    return errorResponse('Registration failed. Please try again.', 500)
  }
}