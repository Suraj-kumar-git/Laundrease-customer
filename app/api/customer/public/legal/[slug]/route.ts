import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/public/legal/[slug]
// Public route — no auth required
// Returns the currently active version of the requested legal document

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const VALID_SLUGS = ['terms_of_service', 'privacy_policy'] as const
  if (!VALID_SLUGS.includes(slug as any)) {
    return notFoundResponse('Legal document not found')
  }

  try {
    const result = await query(
      `SELECT
         id, code, title, version,
         to_char(effective_date, 'YYYY-MM-DD') AS effective_date,
         content,
         updated_at
       FROM legal_documents
       WHERE code = $1
         AND is_active = TRUE
       LIMIT 1`,
      [slug]
    )

    if (result.rowCount === 0) {
      return notFoundResponse('Legal document not found')
    }

    return successResponse(result.rows[0])
  } catch (error) {
    console.error('[GET /api/customer/public/legal/:slug] Error:', error)
    return serverErrorResponse('Failed to fetch document')
  }
}
