import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

// GET /api/customer/public/careers
// Public route — no auth required
// Returns all active, non-expired job postings ordered by featured first, then posted_at desc
// Query params:
//   ?department=Engineering   (optional filter)
//   ?type=full_time           (optional filter)

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const department = searchParams.get('department')
  const employmentType = searchParams.get('type')

  const conditions: string[] = [
    'is_active = TRUE',
    '(expires_at IS NULL OR expires_at > NOW())',
  ]
  const params: any[] = []

  if (department) {
    params.push(department)
    conditions.push(`department ILIKE $${params.length}`)
  }

  if (employmentType) {
    const VALID_TYPES = ['full_time', 'part_time', 'contract', 'internship']
    if (VALID_TYPES.includes(employmentType)) {
      params.push(employmentType)
      conditions.push(`employment_type = $${params.length}`)
    }
  }

  const whereClause = conditions.join(' AND ')

  try {
    const result = await query(
      `SELECT
         id, title, department, location, employment_type,
         experience_range, about_role,
         responsibilities, requirements, nice_to_have, benefits,
         -- Only expose whether a JD exists, not the raw S3 key
         (jd_s3_key IS NOT NULL) AS has_jd,
         hr_name, hr_email,
         email_subject_format, email_body_format,
         is_featured,
         to_char(posted_at, 'YYYY-MM-DD') AS posted_at,
         to_char(expires_at, 'YYYY-MM-DD') AS expires_at
       FROM career_jobs
       WHERE ${whereClause}
       ORDER BY is_featured DESC, posted_at DESC`,
      params
    )

    return successResponse(result.rows)
  } catch (error) {
    console.error('[GET /api/customer/public/careers] Error:', error)
    return serverErrorResponse('Failed to fetch job listings')
  }
}
