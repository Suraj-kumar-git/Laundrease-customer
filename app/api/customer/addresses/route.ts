import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { errorResponse } from '@/lib/api-response'
import { getAuthUser } from '@/lib/auth'
 
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user from JWT token in cookies
    const authUser = await getAuthUser(req)
    
    if (!authUser) {
      return errorResponse('Unauthorized - Please login', 401)
    }
    
    const user_id = authUser.id
    
    // Verify user is a customer
    if (authUser.role !== 'customer') {
      return errorResponse('Only customers can manage addresses', 403)
    }
 
    // Fetch customer profile
    const profileResult = await query(
      'SELECT id FROM customer_profiles WHERE user_id = $1',
      [user_id]
    )
 
    if (profileResult.rowCount === 0) {
      return NextResponse.json({
        success: false,
        message: 'Customer profile not found',
      }, { status: 404 })
    }
 
    const customer_profile_id = profileResult.rows[0].id
 
    // Fetch all addresses
    const addressesResult = await query(`
      SELECT
        id,
        label,
        tags,
        address_line1,
        address_line2,
        landmark,
        neighborhood,
        city,
        state,
        postal_code,
        country_code,
        latitude,
        longitude,
        instructions,
        contact_name,
        contact_phone,
        is_default,
        validated
      FROM customer_addresses
      WHERE customer_profile_id = $1
        AND deleted_at IS NULL
      ORDER BY is_default DESC, position ASC
    `, [customer_profile_id])
 
    const addresses = addressesResult.rows
    const defaultAddress = addresses.find((a: any) => a.is_default)
 
    return NextResponse.json({
      success: true,
      data: {
        addresses,
        default_address: defaultAddress,
      },
    })
  } catch (error) {
    console.error('Error fetching addresses:', error)
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch addresses',
    }, { status: 500 })
  }
}