'use client'

// lib/use-customer-location.ts
// Shared browser-geolocation hook — extracted from app/customer/page.tsx so
// the customer dashboard's "Providers near you" fallback (no saved address)
// can reuse the exact same permission-state machine instead of duplicating
// it, given its StrictMode/Safari-permission-state history (see the
// one-shot auto-request guard below).

import { useState, useEffect, useRef, useCallback } from 'react'

export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

// `enabled` gates the automatic initial request — the public landing page
// always wants it (default true), but a consumer that only needs geolocation
// as a fallback for a specific state (e.g. the dashboard's "no saved
// address" case) should pass `enabled={false}` the rest of the time, so a
// registered customer with an address on file is never nagged for browser
// location permission on every dashboard visit.
export function useCustomerLocation(enabled: boolean = true) {
  const [coords,     setCoords]     = useState<{ lat: number; lng: number } | null>(null)
  const [permission, setPermission] = useState<LocationPermission>('prompt')
  const [asking,     setAsking]     = useState(false)

  const request = useCallback(() => {
    if (!navigator.geolocation) { setPermission('unsupported'); return }
    setAsking(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setPermission('granted')
        setAsking(false)
      },
      err => {
        setAsking(false)
        // Only a real permission denial should trigger the "allow access"
        // banner — a timeout or transient GPS unavailability isn't that,
        // and there's nothing useful to prompt the user for in that case.
        if (err.code === err.PERMISSION_DENIED) setPermission('denied')
      },
      { timeout: 8000 }
    )
  }, [])

  // Guards the *automatic* initial request so it only ever fires once total,
  // no matter which branch below triggers it. Without this, React Strict
  // Mode's dev-only double-invoke of effects — or a browser (e.g. Safari)
  // where permissions.query() rejects instead of resolving — could call
  // request() twice, producing two distinct coords objects and making
  // whatever depends on coords fetch and visibly flicker twice. A manual
  // "Try again" button calling `request` directly is unaffected by this guard.
  const autoRequestedRef = useRef(false)
  const requestOnce = useCallback(() => {
    if (autoRequestedRef.current) return
    autoRequestedRef.current = true
    request()
  }, [request])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then(status => {
          if (cancelled) return
          setPermission(status.state as LocationPermission)
          // Keep in sync if the user changes the permission from browser
          // settings while this tab stays open — no reload needed.
          status.onchange = () => { if (!cancelled) setPermission(status.state as LocationPermission) }
          if (status.state !== 'denied') requestOnce()
        })
        .catch(() => { if (!cancelled) requestOnce() })
    } else {
      requestOnce()
    }
    return () => { cancelled = true }
  }, [requestOnce, enabled])

  return { coords, permission, asking, request }
}
