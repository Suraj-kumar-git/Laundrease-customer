// lib/dashboard-address-pref.ts
// The customer's last-picked "dashboard address" — set from the dashboard's
// address dropdown, read by every "New Order" quick-launch entry point
// (the dashboard's own button, the mobile bottom nav's center button, etc.)
// so they all resolve to the same address instead of silently falling back
// to the account default.
//
// Persisted in localStorage (survives reloads/app restarts) and mirrored via
// a same-tab custom event on write — the browser's native `storage` event
// only fires in OTHER tabs/windows, so a component that's already mounted in
// THIS tab (e.g. the bottom nav, which persists across dashboard navigation
// without remounting) would otherwise never see a change made moments ago on
// the same page.

const KEY = 'laundrease_dashboard_address_id'
const EVENT = 'laundrease:dashboard-address-changed'

export function getPreferredAddressId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  } catch { return null }
}

export function setPreferredAddressId(id: number) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(KEY, String(id)) } catch { /* private browsing, etc. */ }
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: id }))
}

// Returns an unsubscribe function.
export function onPreferredAddressChange(cb: (id: number) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (e: Event) => cb((e as CustomEvent<number>).detail)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
