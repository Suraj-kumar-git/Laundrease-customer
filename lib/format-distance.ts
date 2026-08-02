// Shared display formatter for a provider's distance from the customer,
// e.g. "450m away" / "3.2 km away". Extracted from app/customer/page.tsx.
export function formatDistance(km: number | null): string {
  if (km === null) return ''
  if (km < 1) return `${Math.round(km * 1000)}m away`
  return `${km.toFixed(1)} km away`
}
