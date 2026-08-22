import { NextRequest } from 'next/server'
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

// NOTE: this file deliberately has no POST.
//
// It used to carry one, commented "Create a new FAQ (Admin only)" — with no
// auth check of any kind, on a path proxy.ts serves publicly. Anyone could
// insert rows into `faqs`, which render on /customer/faq and feed that page's
// FAQPage JSON-LD, so it was an open content-injection door on the public
// site. Nothing called it: FAQ authoring belongs to /api/admin/cms/faqs and
// /api/support/cms/faqs, both properly gated.
//
// If a public write is ever needed here, it needs a real authorization check —
// not a comment saying admin only.

