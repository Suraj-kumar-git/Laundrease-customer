import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { hashPassword, verifyPassword, validatePassword } from '@/lib/auth'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// PUT /api/customer/profile/password
// Auth required
// Body: { current_password, new_password }

export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { current_password?: string; new_password?: string }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const { current_password, new_password } = body
  const errors: Record<string, string> = {}

  if (!current_password) errors.current_password = 'Current password is required'
  if (!new_password) errors.new_password = 'New password is required'

  if (new_password) {
    const { valid, errors: pwErrors } = validatePassword(new_password)
    if (!valid) errors.new_password = pwErrors[0]
  }

  if (current_password && new_password && current_password === new_password) {
    errors.new_password = 'New password must be different from current password'
  }

  if (Object.keys(errors).length > 0) return validationError(errors)

  try {
    // Fetch current hash
    const userResult = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    )
    if (userResult.rowCount === 0) return errorResponse('User not found', 404)

    const isValid = await verifyPassword(current_password!, userResult.rows[0].password_hash)
    if (!isValid) {
      return validationError({ current_password: 'Current password is incorrect' })
    }

    const newHash = await hashPassword(new_password!)
    await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    )

    return successResponse({ updated: true })
  } catch (error) {
    console.error('[PUT /api/customer/profile/password]', error)
    return serverErrorResponse('Failed to update password')
  }
}
