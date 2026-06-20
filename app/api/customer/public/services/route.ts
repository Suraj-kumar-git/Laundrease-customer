// app/api/customer/public/services/route.ts
import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    
    // Optional filters
    const category = searchParams.get('category') // 'wash', 'dry_clean', 'iron', 'express'
    const isActive = searchParams.get('active') !== 'false' // default true
    
    // Build query
    let sql = `
      SELECT 
        s.id,
        s.name,
        s.description,
        s.category,
        s.base_price,
        s.unit,
        s.is_express,
        s.turnaround_hours,
        s.is_active,
        s.icon_url,
        s.features,
        s.sort_order
      FROM services s
      WHERE 1=1
    `
    
    const params: any[] = []
    let paramIndex = 1
    
    if (category) {
      sql += ` AND s.category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }
    
    if (isActive) {
      sql += ` AND s.is_active = true`
    }
    
    sql += ` ORDER BY s.sort_order ASC, s.name ASC`
    
    const result = await query(sql, params)
    
    // Group by category
    const grouped = result.rows.reduce((acc: any, service: any) => {
      const cat = service.category || 'other'
      if (!acc[cat]) {
        acc[cat] = []
      }
      acc[cat].push({
        id: service.id,
        name: service.name,
        description: service.description,
        basePrice: parseFloat(service.base_price),
        unit: service.unit,
        isExpress: service.is_express,
        turnaroundHours: service.turnaround_hours,
        iconUrl: service.icon_url,
        features: service.features || [],
      })
      return acc
    }, {})
    
    return successResponse({
      services: result.rows.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        category: service.category,
        basePrice: parseFloat(service.base_price),
        unit: service.unit,
        isExpress: service.is_express,
        turnaroundHours: service.turnaround_hours,
        iconUrl: service.icon_url,
        features: service.features || [],
      })),
      groupedByCategory: grouped,
      total: result.rowCount,
    })
  } catch (error) {
    console.error('Get services error:', error)
    return errorResponse('Failed to fetch services', 500)
  }
}
