// app/api/customer/auth/logout/route.ts
import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { query } from '@/lib/db'
import { verifyAccessToken } from '@/lib/auth'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = cookies()
    const accessToken = (await cookieStore).get('access_token')?.value

    // Even if no token, we'll clear cookies
    if (accessToken) {
      try {
        const decoded = await verifyAccessToken(accessToken)

        if (decoded && decoded.sessionId) {
          // Delete specific session
          await query(
            `DELETE FROM user_sessions WHERE session_id = $1`,
            [decoded.sessionId]
          )
        }
      } catch (error) {
        // Token might be invalid/expired, but we still want to clear cookies
        console.log('Token verification failed during logout:', error)
      }
    }

    // Clear auth cookies
    (await
      // Clear auth cookies
      cookieStore).delete('access_token')
    ;(await cookieStore).delete('refresh_token')

    return successResponse({
      message: 'Logged out successfully',
    })
  } catch (error) {
    console.error('Logout error:', error)
    // Even on error, we should clear cookies
    const cookieStore = await cookies()
    cookieStore.delete('access_token')
    cookieStore.delete('refresh_token')
    
    return successResponse({
      message: 'Logged out successfully',
    })
  }
}

// Support GET method for simple logout links
export async function GET(req: NextRequest) {
  return POST(req)
}
