// Server-side geocoding via Google Maps Geocoding API.
// Keeps GOOGLE_MAPS_API_KEY secret — never expose it to the client.

interface GeocodeAddressInput {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string
}

export interface GeocodeResult {
  latitude: number
  longitude: number
  formatted_address: string
}

export async function geocodeAddress(input: GeocodeAddressInput): Promise<GeocodeResult | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error('[geocodeAddress] GOOGLE_MAPS_API_KEY not configured')
    return null
  }

  const parts = [
    input.address_line1,
    input.address_line2,
    input.city,
    input.state,
    input.postal_code,
    input.country ?? 'India',
  ].filter(Boolean)

  if (parts.length === 0) return null

  const address = parts.join(', ')
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  try {
    const res  = await fetch(url)
    const json = await res.json()

    if (json.status !== 'OK' || !json.results?.length) {
      console.warn('[geocodeAddress] No result for address:', address, json.status)
      return null
    }

    const result   = json.results[0]
    const location = result.geometry.location

    return {
      latitude:          location.lat,
      longitude:         location.lng,
      formatted_address: result.formatted_address,
    }
  } catch (error) {
    console.error('[geocodeAddress] Request failed:', error)
    return null
  }
}
