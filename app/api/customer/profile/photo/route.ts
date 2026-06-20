import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { hashPassword, verifyPassword } from '@/lib/auth'
import { uploadProfilePhoto, deleteProfilePhoto } from '@/lib/s3-profile'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
  unauthorizedResponse,
} from '@/lib/api-response'

// POST /api/customer/profile/photo
// Auth required — multipart form upload
// Field name: "photo", max 5MB, jpg/png only

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const formData = await req.formData()
    const file = formData.get('photo') as File | null

    if (!file) return errorResponse('No photo provided', 400)

    const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!ALLOWED_TYPES.includes(file.type)) {
      return errorResponse('Only JPG, PNG, or WebP images are allowed', 400)
    }

    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    if (file.size > MAX_SIZE) {
      return errorResponse('Image must be smaller than 5MB', 400)
    }

    // Get current profile_image to delete after successful upload
    const current = await query<{ profile_image: string | null }>(
      `SELECT profile_image FROM users WHERE id = $1`,
      [userId]
    )
    const oldImageUrl = current.rows[0]?.profile_image

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to S3
    const imageUrl = await uploadProfilePhoto(userId, buffer, file.type)

    // Save URL to DB
    await query(
      `UPDATE users SET profile_image = $1, updated_at = NOW() WHERE id = $2`,
      [imageUrl, userId]
    )

    // Delete old image from S3 (non-blocking)
    if (oldImageUrl && oldImageUrl.includes('amazonaws.com')) {
      deleteProfilePhoto(oldImageUrl).catch(() => {})
    }

    return successResponse({ profile_image: imageUrl })
  } catch (error) {
    console.error('[POST /api/customer/profile/photo]', error)
    return serverErrorResponse('Failed to upload photo')
  }
}
