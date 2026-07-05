// app/api/customer/public/places/route.ts
// GET ?input=TEXT          — returns Google Places autocomplete predictions
// GET ?place_id=PLACE_ID   — returns address components for a selected place
//
// Server-side proxy so the Maps API key never needs to be exposed client-side
// and domain/referrer restrictions on the key don't affect the customer app.

import { NextRequest } from 'next/server'
import { successResponse, errorResponse, serverErrorResponse } from '@/lib/api-response'

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

export async function GET(req: NextRequest) {
  if (!MAPS_KEY) return errorResponse('Maps not configured', 503)

  const { searchParams } = req.nextUrl
  const input   = searchParams.get('input')?.trim()
  const placeId = searchParams.get('place_id')?.trim()

  try {
    // ── Autocomplete predictions ─────────────────────────────────────────────
    if (input) {
      const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json')
      url.searchParams.set('input', input)
      url.searchParams.set('components', 'country:in')
      url.searchParams.set('types', 'geocode')
      url.searchParams.set('key', MAPS_KEY)

      const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
      const data = await res.json()

      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        console.error('[places autocomplete]', data.status, data.error_message)
        return successResponse({ predictions: [] })
      }

      const predictions = (data.predictions ?? []).map((p: any) => ({
        place_id:    p.place_id,
        description: p.description,
      }))

      return successResponse({ predictions })
    }

    // ── Place details (address components) ───────────────────────────────────
    if (placeId) {
      const url = new URL('https://maps.googleapis.com/maps/api/place/details/json')
      url.searchParams.set('place_id', placeId)
      url.searchParams.set('fields', 'address_component')
      url.searchParams.set('key', MAPS_KEY)

      const res  = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) })
      const data = await res.json()

      if (data.status !== 'OK') {
        console.error('[places details]', data.status, data.error_message)
        return successResponse({ components: [] })
      }

      const comps: any[] = data.result?.address_components ?? []
      const get = (type: string) =>
        comps.find((c: any) => c.types.includes(type))?.long_name ?? ''

      const streetNumber = get('street_number')
      const route        = get('route')
      const sublocality  = get('sublocality_level_1') || get('sublocality')
      const locality     = get('locality')
      const district     = get('administrative_area_level_2')
      const state        = get('administrative_area_level_1')
      const postalCode   = get('postal_code')

      const streetPart    = [streetNumber, route].filter(Boolean).join(' ')
      const address_line1 = streetPart || ''
      const city          = locality || district || sublocality

      return successResponse({ address_line1, city, state, postal_code: postalCode })
    }

    return errorResponse('Provide either input or place_id', 400)
  } catch (error) {
    console.error('[GET /api/customer/public/places]', error)
    return serverErrorResponse('Places lookup failed')
  }
}
