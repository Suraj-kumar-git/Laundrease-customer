import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api-response'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const body = await req.json().catch(() => null)
  const token = body?.token
  const platform = body?.platform === 'ios' ? 'ios' : 'android'

  if (!token || typeof token !== 'string') {
    return errorResponse('Device token is required')
  }

  // A token can move between accounts (logout + different login on the same
  // device) — ON CONFLICT reassigns ownership rather than erroring.
  await query(
    `INSERT INTO device_tokens (user_id, token, platform, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (token)
     DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
    [userId, token, platform]
  )

  return successResponse({ registered: true })
}
