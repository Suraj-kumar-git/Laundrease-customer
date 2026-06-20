import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
} from '@/lib/api-response'

// POST /api/customer/public/newsletter/subscribe
// Public route — no auth required
// Body: { email: string, source?: string }

export async function POST(req: NextRequest) {
  let body: { email?: string; source?: string }

  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  const email = body.email?.trim().toLowerCase()
  const source = body.source?.trim().slice(0, 50) || 'footer'

  // ---- Validation ------------------------------------------------
  if (!email) {
    return validationError({ email: 'Email is required' })
  }

  // RFC-compliant enough for our purposes
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return validationError({ email: 'Please enter a valid email address' })
  }

  if (email.length > 320) {
    return validationError({ email: 'Email address is too long' })
  }

  // ---- DB upsert --------------------------------------------------
  // Three cases:
  //   1. New email → insert, return 201
  //   2. Already active → treat as success (don't reveal subscription state)
  //   3. Previously unsubscribed → re-activate
  try {
    const result = await query<{ status: string; is_new: boolean }>(
      `INSERT INTO newsletter_subscribers (email, source)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE
         SET
           status           = CASE
                                WHEN newsletter_subscribers.status = 'unsubscribed'
                                THEN 'active'
                                ELSE newsletter_subscribers.status
                              END,
           unsubscribed_at  = CASE
                                WHEN newsletter_subscribers.status = 'unsubscribed'
                                THEN NULL
                                ELSE newsletter_subscribers.unsubscribed_at
                              END,
           updated_at       = NOW()
       RETURNING
         status,
         (xmax = 0) AS is_new`,
      [email, source]
    )

    const row = result.rows[0]

    // Always return a success-shaped response — never confirm whether an
    // email was already subscribed (avoids user enumeration)
    return successResponse(
      { subscribed: true },
      row.is_new ? 201 : 200
    )
  } catch (error) {
    console.error('[POST /api/customer/public/newsletter/subscribe] Error:', error)
    return serverErrorResponse('Failed to subscribe. Please try again.')
  }
}
