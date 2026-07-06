// app/api/customer/laundry-providers/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, validationError } from '@/lib/api-response'
import { z } from 'zod'

const searchSchema = z.object({
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  pincode: z.string().optional(),
  city: z.string().optional(),
  radius: z.string().optional().default('10'), // km
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('20'),
  sort: z.enum(['distance', 'rating', 'orders']).optional().default('rating'),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    // Validate query parameters
    const validation = searchSchema.safeParse({
      latitude: searchParams.get('lat'),
      longitude: searchParams.get('lng'),
      pincode: searchParams.get('pincode'),
      city: searchParams.get('city'),
      radius: searchParams.get('radius'),
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      sort: searchParams.get('sort'),
    })
    
    if (!validation.success) {
      return validationError(validation.error.flatten().fieldErrors as any)
    }
    
    const { latitude, longitude, pincode, city, radius, page, limit, sort } = validation.data
    
    const offset = (parseInt(page) - 1) * parseInt(limit)
    
    let sql = `
      SELECT 
        lsp.id,
        lsp.business_name,
        lsp.description,
        lsp.business_email,
        lsp.business_phone,
        lsp.address_line1,
        lsp.address_line2,
        lsp.city,
        lsp.state,
        lsp.postal_code,
        lsp.latitude,
        lsp.longitude,
        lsp.rating,
        lsp.rating_count,
        lsp.total_orders,
        lsp.is_verified,
        lsp.is_accepting_orders,
        lsp.logo_url,
        lsp.cover_image_url,
        lsp.operating_hours,
        lsp.min_order_amount,
        lsp.free_delivery_above,
        lsp.delivery_fee,
        u.full_name as owner_name,
        u.email as owner_email
    `
    
    // Add distance calculation if coordinates provided — use nearest service area
    if (latitude && longitude) {
      const lat = parseFloat(latitude)
      const lng = parseFloat(longitude)
      sql += `,
        LEAST(
          COALESCE((
            SELECT MIN(
              6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians(${lat})) * cos(radians(psa.latitude::float))
                * cos(radians(psa.longitude::float) - radians(${lng}))
                + sin(radians(${lat})) * sin(radians(psa.latitude::float))
              )))
            )
            FROM provider_service_areas psa
            WHERE psa.provider_id = lsp.id
              AND psa.is_active = TRUE
              AND psa.latitude IS NOT NULL
          ), 99999),
          COALESCE(
            CASE WHEN lsp.latitude IS NOT NULL AND lsp.longitude IS NOT NULL THEN
              6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians(${lat})) * cos(radians(lsp.latitude::float))
                * cos(radians(lsp.longitude::float) - radians(${lng}))
                + sin(radians(${lat})) * sin(radians(lsp.latitude::float))
              )))
            END,
            99999
          )
        ) AS distance_km
      `
    }
    
    sql += `
      FROM laundry_profiles lsp
      INNER JOIN users u ON lsp.user_id = u.id
      WHERE lsp.is_verified = true
        AND lsp.is_accepting_orders = true
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `
    
    const params: any[] = []
    let paramIndex = 1
    
    // Filter by location — check any active service area first, fall back to profile coords
    if (latitude && longitude) {
      const lat = parseFloat(latitude)
      const lng = parseFloat(longitude)
      const rad = parseFloat(radius)
      sql += `
        AND (
          EXISTS (
            SELECT 1 FROM provider_service_areas psa
            WHERE psa.provider_id = lsp.id
              AND psa.is_active = TRUE
              AND psa.latitude  IS NOT NULL
              AND psa.longitude IS NOT NULL
              AND (
                6371 * acos(LEAST(1, GREATEST(-1,
                  cos(radians(${lat})) * cos(radians(psa.latitude::float))
                  * cos(radians(psa.longitude::float) - radians(${lng}))
                  + sin(radians(${lat})) * sin(radians(psa.latitude::float))
                )))
              ) <= ${rad}
          )
          OR (
            lsp.latitude  IS NOT NULL
            AND lsp.longitude IS NOT NULL
            AND (
              6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($${paramIndex})) * cos(radians(lsp.latitude::float))
                * cos(radians(lsp.longitude::float) - radians($${paramIndex + 1}))
                + sin(radians($${paramIndex})) * sin(radians(lsp.latitude::float))
              )))
            ) <= $${paramIndex + 2}
          )
        )
      `
      params.push(lat, lng, rad)
      paramIndex += 3
    }
    
    if (pincode) {
      sql += ` AND lsp.postal_code = $${paramIndex}`
      params.push(pincode)
      paramIndex++
    }
    
    if (city) {
      sql += ` AND LOWER(lsp.city) = LOWER($${paramIndex})`
      params.push(city)
      paramIndex++
    }
    
    // Sorting
    if (sort === 'distance' && latitude && longitude) {
      sql += ` ORDER BY distance_km ASC`
    } else if (sort === 'rating') {
      sql += ` ORDER BY lsp.rating DESC, lsp.rating_count DESC`
    } else if (sort === 'orders') {
      sql += ` ORDER BY lsp.total_orders DESC`
    }
    
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    params.push(parseInt(limit), offset)
    
    // Execute query
    const result = await query(sql, params)
    
    // Get total count
    let countSql = `
      SELECT COUNT(*) as total
      FROM laundry_profiles lsp
      INNER JOIN users u ON lsp.user_id = u.id
      WHERE lsp.is_verified = true
        AND lsp.is_accepting_orders = true
        AND u.status = 'active'
        AND u.deleted_at IS NULL
    `
    
    const countParams: any[] = []
    let countParamIndex = 1
    
    if (latitude && longitude) {
      const lat = parseFloat(latitude)
      const lng = parseFloat(longitude)
      const rad = parseFloat(radius)
      countSql += `
        AND (
          EXISTS (
            SELECT 1 FROM provider_service_areas psa
            WHERE psa.provider_id = lsp.id
              AND psa.is_active = TRUE
              AND psa.latitude  IS NOT NULL
              AND psa.longitude IS NOT NULL
              AND (
                6371 * acos(LEAST(1, GREATEST(-1,
                  cos(radians(${lat})) * cos(radians(psa.latitude::float))
                  * cos(radians(psa.longitude::float) - radians(${lng}))
                  + sin(radians(${lat})) * sin(radians(psa.latitude::float))
                )))
              ) <= ${rad}
          )
          OR (
            lsp.latitude  IS NOT NULL
            AND lsp.longitude IS NOT NULL
            AND (
              6371 * acos(LEAST(1, GREATEST(-1,
                cos(radians($${countParamIndex})) * cos(radians(lsp.latitude::float))
                * cos(radians(lsp.longitude::float) - radians($${countParamIndex + 1}))
                + sin(radians($${countParamIndex})) * sin(radians(lsp.latitude::float))
              )))
            ) <= $${countParamIndex + 2}
          )
        )
      `
      countParams.push(lat, lng, rad)
      countParamIndex += 3
    }
    
    if (pincode) {
      countSql += ` AND lsp.postal_code = $${countParamIndex}`
      countParams.push(pincode)
      countParamIndex++
    }
    
    if (city) {
      countSql += ` AND LOWER(lsp.city) = LOWER($${countParamIndex})`
      countParams.push(city)
    }
    
    const countResult = await query(countSql, countParams)
    const total = parseInt(countResult.rows[0].total)
    
    return successResponse(
      {
        providers: result.rows.map((row: any) => ({
          id: row.id,
          businessName: row.business_name,
          description: row.description,
          email: row.business_email,
          phone: row.business_phone,
          address: {
            line1: row.address_line1,
            line2: row.address_line2,
            city: row.city,
            state: row.state,
            postalCode: row.postal_code,
            coordinates: {
              lat: parseFloat(row.latitude),
              lng: parseFloat(row.longitude),
            },
          },
          rating: parseFloat(row.rating),
          ratingCount: row.rating_count,
          totalOrders: row.total_orders,
          isVerified: row.is_verified,
          isAcceptingOrders: row.is_accepting_orders,
          logoUrl: row.logo_url,
          coverImageUrl: row.cover_image_url,
          operatingHours: row.operating_hours,
          pricing: {
            minOrderAmount: row.min_order_amount ? parseFloat(row.min_order_amount) : null,
            freeDeliveryAbove: row.free_delivery_above ? parseFloat(row.free_delivery_above) : null,
            deliveryFee: row.delivery_fee ? parseFloat(row.delivery_fee) : 0,
          },
          ...(row.distance_km && { distanceKm: parseFloat(row.distance_km).toFixed(2) }),
        })),
      },
      200,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
      }
    )
  } catch (error) {
    console.error('Search laundry providers error:', error)
    return errorResponse('Failed to search providers', 500)
  }
}
