import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/public/pages/[slug]
// Public route — no auth required
// Returns all active content blocks for the requested page, ordered by sort_order

const VALID_SLUGS = ['about_us', 'help_center', 'safety_center'] as const

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (!VALID_SLUGS.includes(slug as any)) {
    return notFoundResponse('Page not found')
  }

  try {
    const result = await query(
      `SELECT
         id, page_slug, section_key, section_type,
         title, subtitle, body, sort_order
       FROM page_content_blocks
       WHERE page_slug = $1
         AND is_active = TRUE
       ORDER BY sort_order ASC`,
      [slug]
    )

    // Return empty array (not 404) if no blocks — page renders with static fallback
    return successResponse(result.rows)
  } catch (error) {
    console.error('[GET /api/customer/public/pages/:slug] Error:', error)
    return serverErrorResponse('Failed to fetch page content')
  }
}
