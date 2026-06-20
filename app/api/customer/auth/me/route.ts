import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { getAuthUser } from '@/lib/auth'
 
/**
* GET /api/customer/auth/me
* Returns current authenticated user information
* Used by auth-provider to verify JWT token on page load
*/
export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req)
    
    if (!authUser) {
      return errorResponse('Not authenticated', 401)
    }
    
    // Fetch full user details from database
    const userResult = await query(`
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.phone,
        u.profile_image,
        u.email_verified,
        u.phone_verified,
        u.status,
        r.name as role
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.id
      WHERE u.id = $1
    `, [authUser.id])
    
    if (userResult.rows.length === 0) {
      return errorResponse('User not found', 404)
    }
    
    const user = userResult.rows[0]
    
    return successResponse({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        profile_image: user.profile_image,
        email_verified: user.email_verified,
        phone_verified: user.phone_verified,
        status: user.status,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Get current user error:', error)
    return errorResponse('Failed to get user information', 500)
  }
}