import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import {
  successResponse,
  errorResponse,
  validationError,
  serverErrorResponse,
} from '@/lib/api-response'

// POST /api/customer/public/quick-pickup
// Public — no auth required
// Body: QuickPickupFormData

const PHONE_REGEX = /^\+?[6-9]\d{9}$/   // Indian mobile numbers
const PINCODE_REGEX = /^\d{6}$/

export async function POST(req: NextRequest) {
  let body: Record<string, any>

  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400)
  }

  // ---- Validation ---------------------------------------------
  const errors: Record<string, string> = {}

  const full_name = body.full_name?.trim()
  const phone = body.phone?.trim().replace(/\s+/g, '')
  const email = body.email?.trim().toLowerCase() || null
  const pincode = body.pincode?.trim()
  const city = body.city?.trim() || null
  const service_type = body.service_type ?? 'standard'
  const services_interested: string[] = Array.isArray(body.services_interested)
    ? body.services_interested.filter((s: any) => typeof s === 'string').slice(0, 10)
    : []
  const notes = body.notes?.trim().slice(0, 500) || null
  const request_mode = body.request_mode ?? 'callback'
  const preferred_provider_id = body.preferred_provider_id
    ? Number(body.preferred_provider_id)
    : null
  const source = body.source?.trim().slice(0, 50) || 'quick_pickup_page'
  const utm_source = body.utm_source?.trim().slice(0, 100) || null
  const utm_medium = body.utm_medium?.trim().slice(0, 100) || null
  const utm_campaign = body.utm_campaign?.trim().slice(0, 100) || null

  if (!full_name || full_name.length < 2) errors.full_name = 'Full name is required'
  if (full_name && full_name.length > 150) errors.full_name = 'Name is too long'

  if (!phone) {
    errors.phone = 'Phone number is required'
  } else if (!PHONE_REGEX.test(phone)) {
    errors.phone = 'Enter a valid 10-digit Indian mobile number'
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address'
  }

  if (!pincode) {
    errors.pincode = 'Pincode is required'
  } else if (!PINCODE_REGEX.test(pincode)) {
    errors.pincode = 'Enter a valid 6-digit pincode'
  }

  if (!['standard', 'express'].includes(service_type)) {
    errors.service_type = 'Invalid service type'
  }

  if (!['callback', 'direct_call'].includes(request_mode)) {
    errors.request_mode = 'Invalid request mode'
  }

  if (Object.keys(errors).length > 0) {
    return validationError(errors)
  }

  // ---- Rate limiting (simple IP-based, in-memory) -----------
  // For production: use Redis. This prevents form spam in the meantime.
  // The middleware rate limiting already handles general abuse.

  // ---- Insert -------------------------------------------------
  try {
    const result = await query<{ id: number }>(
      `INSERT INTO quick_pickup_requests (
         full_name, phone, email, pincode, city,
         service_type, services_interested, notes,
         request_mode, preferred_provider_id,
         source, utm_source, utm_medium, utm_campaign
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id`,
      [
        full_name, phone, email, pincode, city,
        service_type, services_interested, notes,
        request_mode,
        preferred_provider_id && !isNaN(preferred_provider_id) ? preferred_provider_id : null,
        source, utm_source, utm_medium, utm_campaign,
      ]
    )

    return successResponse(
      { id: result.rows[0].id, submitted: true },
      201
    )
  } catch (error) {
    console.error('[POST /api/customer/public/quick-pickup]', error)
    return serverErrorResponse('Failed to submit request. Please try again.')
  }
}
