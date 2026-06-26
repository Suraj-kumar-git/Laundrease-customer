import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { getJdSignedUrl } from '@/lib/s3'
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api-response'

// GET /api/customer/public/careers/[id]/jd
// Generates and returns a short-lived S3 signed URL for downloading the JD PDF.
// The actual S3 key is never exposed to the client.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const jobId = parseInt(id, 10)

  if (isNaN(jobId)) {
    return notFoundResponse('Job not found')
  }

  try {
    // Fetch only the s3 key — never expose it in the job listing API
    const result = await query(
      `SELECT jd_s3_key FROM career_jobs
       WHERE id = $1
         AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [jobId]
    )

    if (result.rowCount === 0) {
      return notFoundResponse('Job not found')
    }

    const { jd_s3_key } = result.rows[0]

    if (!jd_s3_key) {
      return notFoundResponse('No JD available for this position')
    }

    const signedUrl = await getJdSignedUrl(jd_s3_key)

    if (!signedUrl) {
      return notFoundResponse('JD file not found')
    }

    const expiresIn = parseInt(process.env.AWS_S3_SIGNED_URL_EXPIRY || '300', 10)

    return successResponse({ url: signedUrl, expires_in: expiresIn })
  } catch (error) {
    console.error('[GET /api/customer/public/careers/:id/jd] Error:', error)
    return serverErrorResponse('Failed to generate download link')
  }
}
