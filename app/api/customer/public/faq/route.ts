import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
 
/**
* GET /api/customer/public/faq
* Fetch all FAQs, optionally filtered by category
*/
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    
    let sql = `
      SELECT
        id,
        question,
        answer,
        category,
        sort_order,
        is_active,
        created_at,
        updated_at
      FROM faqs
      WHERE is_active = true
    `
    
    const params: string[] = []
    let paramIndex = 1
    
    if (category) {
      sql += ` AND category = $${paramIndex}`
      params.push(category)
      paramIndex++
    }
    
    sql += ` ORDER BY sort_order ASC, created_at DESC`
    
    const result = await query(sql, params)
    
    // Group by category
    const grouped = result.rows.reduce((acc: any, faq: any) => {
      const cat = faq.category || 'general'
      if (!acc[cat]) {
        acc[cat] = []
      }
      acc[cat].push({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        sortOrder: faq.sort_order,
      })
      return acc
    }, {})
    
    return successResponse({
      faqs: result.rows.map((faq: any) => ({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        sortOrder: faq.sort_order,
      })),
      groupedByCategory: grouped,
      total: result.rowCount,
    })
  } catch (error) {
    console.error('Get FAQs error:', error)
    return errorResponse('Failed to fetch FAQs', 500)
  }
}
 
/**
* POST /api/customer/public/faq
* Create a new FAQ (Admin only)
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { question, answer, category, sortOrder } = body
    
    // Validation
    if (!question || !answer) {
      return errorResponse('Question and answer are required', 400)
    }
    
    const sql = `
      INSERT INTO faqs (question, answer, category, sort_order, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, question, answer, category, sort_order, created_at
    `
    
    const result = await query(sql, [
      question,
      answer,
      category || 'general',
      sortOrder || 999,
    ])
    
    return successResponse({
      faq: {
        id: result.rows[0].id,
        question: result.rows[0].question,
        answer: result.rows[0].answer,
        category: result.rows[0].category,
        sortOrder: result.rows[0].sort_order,
        createdAt: result.rows[0].created_at,
      },
    }, 201)
  } catch (error) {
    console.error('Create FAQ error:', error)
    return errorResponse('Failed to create FAQ', 500)
  }
}