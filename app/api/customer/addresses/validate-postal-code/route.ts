import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
 
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const postalCode = searchParams.get('postalCode')
    
    if (!postalCode) {
      return errorResponse('Postal code is required', 400)
    }
    
    // Check if any laundry provider serves this postal code
    const providersResult = await query(`
      SELECT
        lp.id,
        lp.business_name,
        psa.city,
        psa.state
      FROM provider_service_areas psa
      INNER JOIN laundry_profiles lp ON lp.id = psa.provider_id
      WHERE psa.postal_code = $1
      ORDER BY lp.rating DESC
      LIMIT 5
    `, [postalCode])
    
    const isServiceable = (providersResult?.rowCount ?? 0) > 0;
    
    return successResponse({
      isServiceable,
      postalCode,
      providersCount: providersResult.rowCount,
      topProviders: providersResult.rows.map((p: any) => ({
        id: p.id,
        businessName: p.business_name,
        city: p.city,
        state: p.state,
      })),
      message: isServiceable
        ? `${providersResult.rowCount} provider(s) available in this area`
        : 'No providers available in this postal code',
    })
  } catch (error) {
    console.error('Validate postal code error:', error)
    return errorResponse('Failed to validate postal code', 500)
  }
}