// lib/delivery-address.ts
//
// Address display + navigation for the delivery partner app.
//
// pickup_address / delivery_address arrive as strings that are *sometimes* a
// serialized Address object and sometimes already-flattened text — customer
// checkout writes the full object (including latitude/longitude), while older
// rows and some admin paths hold plain text. Both shapes have to render, so
// every surface that shows an address needs the same parse-or-passthrough.
//
// These two functions previously existed as identical copies in the delivery
// order list and order detail pages. They live here now so the job cards can
// use them without becoming a third copy that drifts from the other two.

/** Human-readable single line, whether the input is JSON or already text. */
export function fmtAddr(a: string | null): string {
  if (!a) return '—'

  const looksLikeJson = typeof a === 'string' && /^\s*[{[]/.test(a)
  if (looksLikeJson) {
    try {
      const obj = JSON.parse(a)

      const line1     = obj.address_line1 ?? obj.line1 ?? obj.line_1
      const line2     = obj.address_line2 ?? obj.line2 ?? obj.area
      const landmark  = obj.landmark
      const cityState = [obj.city, obj.state].filter(Boolean).join(', ')
      const postal    = obj.postal_code ?? obj.postalCode ?? obj.postal

      return [line1, line2, landmark, cityState, postal].filter(Boolean).join(', ')
    } catch {
      // Not valid JSON after all — fall through to the raw string.
    }
  }

  return a.trim()
}

/**
 * Turn-by-turn navigation link, coordinate-precise where possible.
 *
 * Coordinates beat text every time: a free-text address can resolve to the
 * wrong end of a long road, while a geocoded pickup point lands on the
 * doorstep. Explicit lat/lng wins, then coordinates embedded in the address
 * JSON, then a text search as the last resort.
 *
 * `dir/?api=1&destination=` rather than a bare `?q=` because the intent is
 * navigation, and this form opens the native Maps app on mobile when it's
 * installed — no platform sniffing needed.
 */
export function getMapsLink(
  rawAddress: string | null,
  lat?: string | number | null,
  lng?: string | number | null,
): string {
  const latNum = lat != null ? Number(lat) : NaN
  const lngNum = lng != null ? Number(lng) : NaN
  if (!isNaN(latNum) && !isNaN(lngNum) && (latNum !== 0 || lngNum !== 0)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${latNum},${lngNum}`
  }

  if (rawAddress && /^\s*[{[]/.test(rawAddress)) {
    try {
      const obj  = JSON.parse(rawAddress)
      const jLat = obj.latitude  ?? obj.position?.lat
      const jLng = obj.longitude ?? obj.position?.lng
      if (jLat != null && jLng != null) {
        return `https://www.google.com/maps/dir/?api=1&destination=${jLat},${jLng}`
      }
    } catch { /* fall through to text search */ }
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(fmtAddr(rawAddress))}`
}

/**
 * Whether an address is specific enough to navigate to. A dash (fmtAddr's
 * empty marker) or a blank string would send the partner to a Maps search for
 * nothing, so callers hide the Navigate action instead of offering a dead one.
 */
export function isNavigable(rawAddress: string | null): boolean {
  const text = fmtAddr(rawAddress)
  return text !== '—' && text.trim().length > 0
}
