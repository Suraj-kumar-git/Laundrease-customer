// app/api/customer/laundry-providers/[id]/route.ts
// GET — live availability check for a single provider. Used by checkout to
// re-verify the provider a customer picked earlier in the flow (possibly a
// while ago, via a resumed cart) hasn't since paused/been suspended.

import { NextRequest } from 'next/server'
import { queryOne } from '@/lib/db'
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

    return successResponse({
      id: provider.id,
      business_name: provider.business_name,
      is_available: provider.status === 'active' && provider.is_verified === true,
    })
  } catch (error) {
    console.error('[GET /api/customer/laundry-providers/:id]', error)
    return serverErrorResponse('Failed to fetch provider')
  }
}
