// app/api/customer/orders/estimate-delivery/route.ts
// POST /api/customer/orders/estimate-delivery
//
// Preview-only: lets the checkout review page show an estimated delivery
// date BEFORE the order is actually created. Uses the same calculation
// the create/reschedule routes use, so the number shown here matches what
// gets persisted once the order is placed.
//
// Body: { laundry_profile_id, pickup_date, services: [{ service_id, is_express }] }

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { calculateEstimatedDeliveryDate } from '@/lib/delivery-estimate'
import { successResponse, validationError, unauthorizedResponse, serverErrorResponse } from '@/lib/api-response'

interface EstimateBody {
  laundry_profile_id: number
  pickup_date:         string
  services:             { service_id: number; is_express: boolean }[]
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: EstimateBody
  try { body = await req.json() } catch { return validationError({ body: ['Invalid JSON'] }) }

  const errors: Record<string, string> = {}
  if (!body.laundry_profile_id) errors.laundry_profile_id = 'Required'
  if (!body.pickup_date)        errors.pickup_date        = 'Required'
  if (!Array.isArray(body.services) || body.services.length === 0) errors.services = 'At least one service is required'
  if (Object.keys(errors).length) return validationError(errors)

  try {
    const estimatedDeliveryDate = await calculateEstimatedDeliveryDate(query, {
      providerId: body.laundry_profile_id,
      pickupDate: body.pickup_date,
      items: body.services.map(s => ({ serviceId: s.service_id, isExpress: !!s.is_express })),
    })

    return successResponse({ estimated_delivery_date: estimatedDeliveryDate })
  } catch (error) {
    console.error('[POST /api/customer/orders/estimate-delivery]', error)
    return serverErrorResponse('Failed to estimate delivery date')
  }
}
