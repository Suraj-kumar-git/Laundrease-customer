import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/api-response'

// GET /api/customer/public/careers/[id]
// Returns single job posting detail

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
    const result = await query(
      `SELECT
         id, title, department, location, employment_type,
         experience_range, about_role,
         responsibilities, requirements, nice_to_have, benefits,
         (jd_s3_key IS NOT NULL) AS has_jd,
         hr_name, hr_email,
         email_subject_format, email_body_format,
         is_featured,
         to_char(posted_at, 'YYYY-MM-DD') AS posted_at,
         to_char(expires_at, 'YYYY-MM-DD') AS expires_at
       FROM career_jobs
       WHERE id = $1
         AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [jobId]
    )

    if (result.rowCount === 0) {
      return notFoundResponse('Job not found')
    }

    return successResponse(result.rows[0])
  } catch (error) {
    console.error('[GET /api/customer/public/careers/:id] Error:', error)
    return serverErrorResponse('Failed to fetch job details')
  }
}
