// app/api/customer/laundry-providers/[id]/route.ts
// GET — live availability check for a single provider. Used by checkout to
// re-verify the provider a customer picked earlier in the flow (possibly a
// while ago, via a resumed cart) hasn't since paused/been suspended — and by
// the order-details reschedule modal to know which weekdays this provider
// is closed on (closed_dates come from a separate endpoint).

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { successResponse, notFoundResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const providerId = parseInt(id, 10)
  if (isNaN(providerId)) return notFoundResponse('Provider not found')

  try {
    const provider = await queryOne<{ id: number; business_name: string; status: string; is_verified: boolean }>(
      `SELECT id, business_name, status, is_verified FROM laundry_profiles WHERE id = $1`,
      [providerId]
    )
    if (!provider) return notFoundResponse('Provider not found')

    // day_of_week: 0=Sunday .. 6=Saturday, matching JS Date#getDay(). Empty
    // array (no rows configured for this provider) means "always open" —
    // consumers should treat that as the fallback, same as checkout does.
    const hoursRes = await query<{ day_of_week: number; is_closed: boolean }>(
      `SELECT day_of_week, is_closed FROM provider_operating_hours WHERE provider_id = $1 ORDER BY day_of_week ASC`,
      [providerId]
    )

    return successResponse({
      id: provider.id,
      business_name: provider.business_name,
      is_available: provider.status === 'active' && provider.is_verified === true,
      operating_hours: hoursRes.rows,
    })
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/:id]', error)
    return serverErrorResponse('Failed to fetch provider')
  }
}
