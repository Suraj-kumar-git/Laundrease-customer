// app/api/customer/push/register/route.ts
// POST — register (or re-register) this device's FCM token against the
// authenticated customer. Upserts on the token itself, not the user — a
// token can move between accounts (logout + a different login on the same
// device), so ON CONFLICT (token) re-points it rather than inserting a
// duplicate row.

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, unauthorizedResponse, serverErrorResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { token?: string; platform?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.token?.trim()) return errorResponse('token is required', 400)
  const platform = body.platform?.trim() || 'android'

  try {
    await query(
      `INSERT INTO device_tokens (user_id, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE
         SET user_id = $1, platform = $3, updated_at = NOW()`,
      [userId, body.token.trim(), platform]
    )
    return successResponse({ registered: true })
  } catch (err) {
    console.error('[POST /api/customer/push/register]', err)
    return serverErrorResponse('Failed to register device')
  }
}
