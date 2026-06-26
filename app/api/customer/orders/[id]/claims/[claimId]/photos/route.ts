// app/api/customer/orders/[id]/claims/[claimId]/photos/route.ts
// POST — attach an evidence photo to a claim the customer just filed.
// Capped at 5 photos per claim; only while the claim is still 'submitted'
// (once support starts reviewing, the evidence set is locked).

import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
import { uploadClaimPhoto } from '@/lib/s3'
import {
  successResponse, errorResponse, notFoundResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

const MAX_PHOTOS = 5

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()
  const { id, claimId } = await params
  const orderId = parseInt(id, 10)

  try {
    const claim = await queryOne<{ id: number; photo_urls: string[]; status: string }>(
      `SELECT id, photo_urls, status FROM garment_claims
       WHERE id = $1 AND order_id = $2 AND customer_id = $3`,
      [claimId, orderId, userId]
    )
    if (!claim) return notFoundResponse('Claim not found')
    if (claim.status !== 'submitted') {
      return errorResponse('This claim is already being reviewed — evidence can no longer be added', 400)
    }
    if ((claim.photo_urls?.length || 0) >= MAX_PHOTOS) {
      return errorResponse(`Maximum ${MAX_PHOTOS} photos per claim`, 400)
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return errorResponse('No file provided', 400)

    const s3Key = await uploadClaimPhoto(file, orderId, claim.id)

    const updated = await queryOne<{ photo_urls: string[] }>(
      `UPDATE garment_claims
       SET photo_urls = photo_urls || $1::jsonb, updated_at = NOW()
       WHERE id = $2
       RETURNING photo_urls`,
      [JSON.stringify([s3Key]), claim.id]
    )

    return successResponse({ photo_urls: updated!.photo_urls })
  } catch (err: any) {
    if (err.message?.includes('Unsupported file type') || err.message?.includes('too large')) {
      return errorResponse(err.message, 400)
    }
    console.error('[api/customer/orders/[id]/claims/[claimId]/photos] POST error:', err)
    return serverErrorResponse()
  }
}
