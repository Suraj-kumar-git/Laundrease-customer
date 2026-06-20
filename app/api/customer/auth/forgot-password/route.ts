// app/api/customer/auth/forgot-password/route.ts
import { NextRequest } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { query, queryOne } from '@/lib/db'
import { checkRateLimit, getClientIP } from '@/lib/auth'
import { successResponse, errorResponse, validationError } from '@/lib/api-response'
import { sendPasswordResetEmail } from '@/lib/notifications/email'

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limiting check
    const clientIP = getClientIP(req)
    const rateLimit = checkRateLimit(clientIP, {
      maxRequests: 3, // Max 3 password reset requests
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
        'Too many password reset attempts. Please try again later.',
        429,
        'RATE_LIMIT_EXCEEDED',
        {
          resetAt: new Date(rateLimit.resetAt).toISOString(),
        }
      )
    }

    // Parse and validate request body
    const body = await req.json()
    const validation = forgotPasswordSchema.safeParse(body)

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors
      return validationError(errors as any)
    }

    const { email } = validation.data

    // Check if user exists
    const user = await queryOne(
      `SELECT id, email, full_name, status FROM users 
       WHERE email = $1 AND deleted_at IS NULL`,
      [email.toLowerCase()]
    )

    // Don't reveal if user exists or not (security best practice)
    // Always return success even if user doesn't exist
    if (!user) {
      return successResponse({
        message: 'If an account exists with this email, a password reset link has been sent.',
      })
    }

    // Check if account is active
    if (user.status !== 'active') {
      return successResponse({
        message: 'If an account exists with this email, a password reset link has been sent.',
      })
    }

    // Generate reset token (cryptographically secure)
    const resetToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    // Store reset token in database
    await query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         token_hash = $2,
         expires_at = $3,
         used_at = NULL,
         created_at = NOW()`,
      [user.id, tokenHash, expiresAt]
    )

    // Create reset link
    const baseUrl = process.env.NEXT_PUBLIC_CUSTOMER_URL || 'http://localhost:3000'
    const resetLink = `${baseUrl}/customer/auth/reset-password/${resetToken}`

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, user.full_name, resetLink)
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError)
    }

    return successResponse({
      message: 'If an account exists with this email, a password reset link has been sent.',
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return errorResponse('Failed to process password reset request', 500)
  }
}
