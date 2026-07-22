import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { uploadSupportAttachment } from '@/lib/s3'
import {
  successResponse, errorResponse, unauthorizedResponse, serverErrorResponse,
} from '@/lib/api-response'

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'video/mp4', 'video/quicktime',
]
const MAX_SIZE_BYTES = 10 * 1024 * 1024  // 10 MB

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    const ticketId = formData.get('ticket_id') as string | null

    if (!file) return errorResponse('No file provided', 400)
    if (!ALLOWED_TYPES.includes(file.type))
      return errorResponse(`File type ${file.type} is not allowed. Allowed: images, PDF, video.`, 400)
    if (file.size > MAX_SIZE_BYTES)
      return errorResponse('File exceeds 10 MB limit', 400)

    const buffer = Buffer.from(await file.arrayBuffer())

    const { storageKey, url } = await uploadSupportAttachment({
      buffer,
      filename:    file.name,
      contentType: file.type,
      uploaderRole:'customer',
      uploaderId:  parseInt(userId),
    })

    if (ticketId) {
      const ticket = await queryOne(
        `SELECT id FROM support_tickets WHERE id = $1 AND reporter_id = $2 AND reporter_role = 'customer'`,
        [ticketId, userId]
      )
      if (ticket) {
        await queryOne(`
          INSERT INTO support_ticket_attachments
            (ticket_id, uploaded_by, filename, content_type, storage_key, size_bytes)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id
        `, [ticketId, userId, file.name, file.type, storageKey, file.size])
      }
    }

    return successResponse({
      storage_key:  storageKey,
      url,
      filename:     file.name,
      content_type: file.type,
      size_bytes:   file.size,
    })
  } catch (err) {
    console.error('[api/customer/support/upload] POST error:', err)
    return serverErrorResponse()
  }
}
