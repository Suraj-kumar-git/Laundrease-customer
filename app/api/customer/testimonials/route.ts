// app/api/customer/testimonials/route.ts
// GET    — fetch the current customer's own feedback (if any), to prefill the form
// POST   — submit feedback for the first time (errors if one already exists)
// PATCH  — update the customer's existing feedback (goes back to pending review)
// DELETE — remove the customer's feedback entirely (frees them up to submit a new one)
//
// One customer = at most one platform_testimonials row (customer_id is unique).

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse,
  unauthorizedResponse, notFoundResponse,
} from '@/lib/api-response'

interface FeedbackBody {
  content:               string
  rating:                number
  role?:                 string | null
  is_featured_request?:  boolean
  recommendation_score?: number | null
}

function validate(body: FeedbackBody) {
  if (!body.content?.trim())           return 'Feedback content is required'
  if (body.content.trim().length < 20) return 'Please write at least 20 characters'
  if (!body.rating || body.rating < 1 || body.rating > 5)
    return 'Rating must be between 1 and 5'
  if (body.recommendation_score != null &&
    (body.recommendation_score < 1 || body.recommendation_score > 10))
    return 'Recommendation score must be 1–10'
  return null
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const testimonial = await queryOne<any>(
      `SELECT id, content, rating, role, is_featured, is_active,
              recommendation_score, created_at, updated_at
       FROM platform_testimonials
       WHERE customer_id = $1`,
      [userId]
    )

    return successResponse({ testimonial: testimonial ?? null })
  } catch (err) {
    console.error('[GET /api/customer/testimonials]', err)
    return serverErrorResponse('Failed to load feedback')
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: FeedbackBody
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const validationMsg = validate(body)
  if (validationMsg) return errorResponse(validationMsg, 400)

  try {
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM platform_testimonials WHERE customer_id = $1`, [userId]
    )
    if (existing) {
      return errorResponse('You have already submitted feedback. Edit or delete it instead of adding a new one.', 409)
    }

    const user = await queryOne<{ full_name: string; profile_image: string | null }>(
      `SELECT full_name, profile_image FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (!user) return errorResponse('User not found', 404)

    const ins = await queryOne<{ id: number }>(
      `INSERT INTO platform_testimonials
         (customer_id, display_name, avatar_url, content, rating, role,
          is_featured, is_active, recommendation_score, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, 999)
       RETURNING id`,
      [
        userId,
        user.full_name,
        user.profile_image,
        body.content.trim(),
        Math.round(body.rating),
        body.role?.trim() || null,
        body.is_featured_request ?? false,
        body.recommendation_score ?? null,
      ]
    )

    return successResponse({ testimonial_id: ins!.id, saved: true, pending_approval: true }, 201)
  } catch (err) {
    console.error('[POST /api/customer/testimonials]', err)
    return serverErrorResponse('Failed to save feedback')
  }
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: FeedbackBody
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const validationMsg = validate(body)
  if (validationMsg) return errorResponse(validationMsg, 400)

  try {
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM platform_testimonials WHERE customer_id = $1`, [userId]
    )
    if (!existing) return notFoundResponse('No existing feedback to update — submit new feedback instead')

    // Editing resets it to pending review — the previously approved/featured
    // content is gone, so it shouldn't keep showing as approved/featured.
    await query(
      `UPDATE platform_testimonials SET
         content              = $1,
         rating                = $2,
         role                  = $3,
         is_featured            = $4,
         recommendation_score  = $5,
         is_active              = FALSE,
         updated_at             = NOW()
       WHERE id = $6`,
      [
        body.content.trim(),
        Math.round(body.rating),
        body.role?.trim() || null,
        body.is_featured_request ?? false,
        body.recommendation_score ?? null,
        existing.id,
      ]
    )

    return successResponse({ testimonial_id: existing.id, saved: true, pending_approval: true })
  } catch (err) {
    console.error('[PATCH /api/customer/testimonials]', err)
    return serverErrorResponse('Failed to update feedback')
  }
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const deleted = await queryOne<{ id: number }>(
      `DELETE FROM platform_testimonials WHERE customer_id = $1 RETURNING id`, [userId]
    )
    if (!deleted) return notFoundResponse('No feedback found to delete')

    return successResponse({ deleted: true })
  } catch (err) {
    console.error('[DELETE /api/customer/testimonials]', err)
    return serverErrorResponse('Failed to delete feedback')
  }
}
