// app/api/customer/testimonials/route.ts
// POST — submit a platform testimonial (written to platform_testimonials)
// Picks display_name and avatar_url from users table automatically.
// is_active defaults to FALSE — admin must approve before it shows publicly.

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: {
    content:              string
    rating:               number
    role?:                string | null   // customer's profession (optional)
    is_featured_request?: boolean         // customer opted to feature it
    recommendation_score?: number | null  // 1-10 NPS-style score
  }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.content?.trim())           return errorResponse('Feedback content is required', 400)
  if (body.content.trim().length < 20) return errorResponse('Please write at least 20 characters', 400)
  if (!body.rating || body.rating < 1 || body.rating > 5)
    return errorResponse('Rating must be between 1 and 5', 400)
  if (body.recommendation_score != null &&
    (body.recommendation_score < 1 || body.recommendation_score > 10))
    return errorResponse('Recommendation score must be 1–10', 400)

  try {
    // Pull display_name and profile_image from users table
    const user = await queryOne<{ full_name: string; profile_image: string | null }>(
      `SELECT full_name, profile_image FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (!user) return errorResponse('User not found', 404)

    // One pending/active testimonial per user at a time — check for existing
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM platform_testimonials
       WHERE display_name = $1 AND is_active = FALSE
       ORDER BY created_at DESC LIMIT 1`,
      [user.full_name]
    )

    let testimonialId: number
    if (existing) {
      // Update the existing pending one
      const upd = await queryOne<{ id: number }>(
        `UPDATE platform_testimonials SET
           content              = $1,
           rating               = $2,
           role                 = $3,
           is_featured          = $4,
           recommendation_score = $5,
           avatar_url           = $6,
           updated_at           = NOW()
         WHERE id = $7
         RETURNING id`,
        [
          body.content.trim(),
          Math.round(body.rating),
          body.role?.trim() || null,
          body.is_featured_request ?? false,
          body.recommendation_score ?? null,
          user.profile_image,
          existing.id,
        ]
      )
      testimonialId = upd!.id
    } else {
      // Insert new — is_active = FALSE until admin approves
      const ins = await queryOne<{ id: number }>(
        `INSERT INTO platform_testimonials
           (display_name, avatar_url, content, rating, role,
            is_featured, is_active, recommendation_score, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, 999)
         RETURNING id`,
        [
          user.full_name,
          user.profile_image,
          body.content.trim(),
          Math.round(body.rating),
          body.role?.trim() || null,
          body.is_featured_request ?? false,
          body.recommendation_score ?? null,
        ]
      )
      testimonialId = ins!.id
    }

    return successResponse({ testimonial_id: testimonialId, saved: true, pending_approval: true }, 201)
  } catch (err) {
    console.error('[POST /api/customer/testimonials]', err)
    return serverErrorResponse('Failed to save testimonial')
  }
}
