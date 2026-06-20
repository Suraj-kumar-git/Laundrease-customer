// app/api/customer/laundry/profile/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
 
export async function GET(req: NextRequest) {
  try {
    // Get user_id from auth session (implement your auth logic)
    const userId = req.headers.get('x-user-id') // Replace with actual auth
    
    if (!userId) {
      return errorResponse('Unauthorized', 401)
    }
 
    // Fetch laundry profile with all related data
    const profileResult = await query(`
      SELECT 
        lp.id,
        lp.user_id,
        lp.business_name,
        lp.business_address,
        lp.service_area,
        lp.capacity,
        lp.operating_hours,
        lp.certifications,
        lp.services_offered,
        lp.rating,
        lp.created_at,
        u.email,
        u.phone,
        u.full_name,
        u.status as account_status,
        u.profile_image,
        u.email_verified,
        u.phone_verified
      FROM laundry_profiles lp
      JOIN users u ON u.id = lp.user_id
      WHERE lp.user_id = $1
    `, [userId])
 
    if (profileResult.rowCount === 0) {
      return errorResponse('Profile not found', 404)
    }
 
    const profile = profileResult.rows[0]
 
    // Fetch operating hours in normalized format
    const hoursResult = await query(`
      SELECT 
        day_of_week,
        open_time,
        close_time,
        is_closed
      FROM provider_operating_hours
      WHERE provider_id = $1
      ORDER BY day_of_week
    `, [profile.id])
 
    // Fetch closed dates
    const closedDatesResult = await query(`
      SELECT 
        closed_date,
        note
      FROM provider_closed_dates
      WHERE provider_id = $1
      AND closed_date >= CURRENT_DATE
      ORDER BY closed_date
    `, [profile.id])
 
    // Fetch services with pricing
    const servicesResult = await query(`
      SELECT 
        s.id,
        s.name,
        s.description,
        s.category,
        s.base_price,
        s.price_per_kg,
        s.turnaround_hours,
        s.is_express_available,
        s.express_multiplier,
        ps.price_override,
        ps.price_per_kg_override,
        ps.is_express_available_override,
        ps.express_multiplier_override,
        ps.turnaround_hours_override
      FROM provider_services ps
      JOIN services s ON s.id = ps.service_id
      WHERE ps.provider_id = $1
    `, [profile.id])
 
    // Fetch service areas
    const serviceAreasResult = await query(`
      SELECT 
        postal_code,
        city,
        state,
        country
      FROM provider_service_areas
      WHERE provider_id = $1
    `, [profile.id])
 
    // Fetch statistics
    const statsResult = await query(`
      SELECT 
        COUNT(DISTINCT o.id) as total_orders,
        COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) as completed_orders,
        AVG(CASE WHEN r.service_rating IS NOT NULL THEN r.service_rating END) as avg_rating,
        COUNT(DISTINCT r.id) as total_reviews
      FROM orders o
      LEFT JOIN reviews r ON r.order_id = o.id
      WHERE o.laundry_profile_id = $1
    `, [profile.id])
 
    const stats = statsResult.rows[0]
 
    return successResponse({
      profile: {
        id: profile.id,
        businessName: profile.business_name,
        businessAddress: profile.business_address,
        serviceArea: profile.service_area,
        capacity: profile.capacity,
        certifications: profile.certifications || [],
        servicesOffered: profile.services_offered || [],
        rating: parseFloat(profile.rating),
        email: profile.email,
        phone: profile.phone,
        fullName: profile.full_name,
        accountStatus: profile.account_status,
        profileImage: profile.profile_image,
        emailVerified: profile.email_verified,
        phoneVerified: profile.phone_verified,
        createdAt: profile.created_at,
      },
      operatingHours: hoursResult.rows.map(row => ({
        dayOfWeek: row.day_of_week,
        openTime: row.open_time,
        closeTime: row.close_time,
        isClosed: row.is_closed,
      })),
      closedDates: closedDatesResult.rows.map(row => ({
        date: row.closed_date,
        note: row.note,
      })),
      services: servicesResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        price: parseFloat(row.price_override || row.base_price),
        pricePerKg: row.price_per_kg_override ? parseFloat(row.price_per_kg_override) : (row.price_per_kg ? parseFloat(row.price_per_kg) : null),
        turnaroundHours: row.turnaround_hours_override || row.turnaround_hours,
        isExpressAvailable: row.is_express_available_override !== null ? row.is_express_available_override : row.is_express_available,
        expressMultiplier: row.express_multiplier_override ? parseFloat(row.express_multiplier_override) : (row.express_multiplier ? parseFloat(row.express_multiplier) : null),
      })),
      serviceAreas: serviceAreasResult.rows,
      statistics: {
        totalOrders: parseInt(stats.total_orders),
        completedOrders: parseInt(stats.completed_orders),
        averageRating: stats.avg_rating ? parseFloat(stats.avg_rating).toFixed(2) : '0.00',
        totalReviews: parseInt(stats.total_reviews),
      },
    })
  } catch (error) {
    console.error('Get laundry profile error:', error)
    return errorResponse('Failed to fetch profile', 500)
  }
}
 
export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id')
    
    if (!userId) {
      return errorResponse('Unauthorized', 401)
    }
 
    const body = await req.json()
    const {
      businessName,
      businessAddress,
      serviceArea,
      capacity,
      certifications,
      servicesOffered,
    } = body
 
    // Update laundry profile
    await query(`
      UPDATE laundry_profiles
      SET 
        business_name = $1,
        business_address = $2,
        service_area = $3,
        capacity = $4,
        certifications = $5,
        services_offered = $6
      WHERE user_id = $7
    `, [
      businessName,
      businessAddress,
      serviceArea,
      capacity,
      certifications,
      servicesOffered,
      userId,
    ])
 
    return successResponse({ message: 'Profile updated successfully' })
  } catch (error) {
    console.error('Update laundry profile error:', error)
    return errorResponse('Failed to update profile', 500)
  }
}
