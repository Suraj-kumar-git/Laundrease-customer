// app/api/customer/delivery-availability/route.ts
// GET ?postal_code=&city= — current delivery-partner workload for a pickup
// zone, used by SchedulePickup to decide which of today's slots are still
// bookable (see lib/delivery-availability.ts for the tiering rules).

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { getDeliveryQueueInfo, getSlotTier } from '@/lib/delivery-availability'
import { successResponse, serverErrorResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const sp         = req.nextUrl.searchParams
    const postalCode = sp.get('postal_code')
    const city        = sp.get('city')

    const { hasPartner, queueCount } = await getDeliveryQueueInfo(query, { postalCode, city })

    return successResponse({
      has_partner: hasPartner,
      queue_count: queueCount,
      tier:        getSlotTier(queueCount),
    })
  } catch (err) {
    console.error('[api/customer/delivery-availability] GET error:', err)
    return serverErrorResponse()
  }
}
