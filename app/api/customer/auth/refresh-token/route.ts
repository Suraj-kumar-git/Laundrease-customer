// app/api/customer/auth/refresh-token/route.ts
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { query, queryOne } from '@/lib/db'
import {
  verifyRefreshToken,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  getClientIP,
} from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const refreshToken = (await cookieStore).get('refresh_token')?.value

    if (!refreshToken) {
      return errorResponse('No refresh token provided', 401, 'NO_REFRESH_TOKEN')
    }

    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken)

    if (!decoded || !decoded.userId || !decoded.sessionId) {
      return errorResponse('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN')
    }

    // Check if session exists and is valid
    const session = await queryOne(
      `SELECT 
        s.id,
        s.user_id,
        s.session_id,
        s.refresh_token,
        s.expires_at,
        u.email,
        u.status,
        u.deleted_at,
        u.email_verified,
        u.phone_verified,
        r.name as role_name
       FROM user_sessions s
       INNER JOIN users u ON u.id = s.user_id
       INNER JOIN roles r ON r.id = u.role_id
       WHERE s.session_id = $1
         AND s.expires_at > NOW()
         AND u.deleted_at IS NULL`,
      [decoded.sessionId]
    )

    if (!session) {
      return errorResponse('Session not found or expired', 401, 'SESSION_EXPIRED')
    }

    // Check if user account is active
    if (session.status !== 'active') {
      return errorResponse('Account is not active', 403, 'ACCOUNT_INACTIVE')
    }

    // Verify the refresh token matches what's stored in database
    if (session.refresh_token !== refreshToken) {
      // Possible token theft - invalidate all sessions
      await query(
        `DELETE FROM user_sessions WHERE user_id = $1`,
        [session.user_id]
      )
      return errorResponse('Invalid refresh token', 401, 'TOKEN_MISMATCH')
    }

    // Generate new tokens (token rotation)
    const newAccessToken = await generateAccessToken({
      userId: session.user_id,
      email: session.email,
      role: session.role_name,
      sessionId: session.session_id,
      emailVerified: session.email_verified,
      phoneVerified: session.phone_verified
    })

    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
    const newRefreshToken = await generateRefreshToken(
      session.user_id,
      session.session_id,
      refreshTokenExpiry
    )

    // Update session with new refresh token and activity time
    const clientIP = getClientIP(req)
    await query(
      `UPDATE user_sessions 
       SET refresh_token = $1,
           last_activity = NOW(),
           ip_address = $2
       WHERE session_id = $3`,
      [newRefreshToken, clientIP, session.session_id]
    )

    // Set new cookies
    await setAuthCookies(newAccessToken, newRefreshToken)

    return successResponse({
      message: 'Token refreshed successfully',
      user: {
        id: session.user_id,
        email: session.email,
        role: session.role_name,
      },
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    return errorResponse('Failed to refresh token', 500)
  }
}
