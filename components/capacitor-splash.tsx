'use client'
// Hides the native splash screen once the web app has actually mounted.
// launchAutoHide is off in capacitor.config.ts specifically so the splash
// (with its spinner) stays up for the whole network fetch instead of
// disappearing on a fixed timer and leaving a blank gap before paint.
// No-ops outside the native app (Capacitor.isNativePlatform() is false in
// a regular browser), so this is safe on the plain website too.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

export function CapacitorSplash() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false

    SplashScreen.hide().catch((err) => console.error('[splash] hide failed', err))

    // Safety net: launchAutoHide is off, so the splash stays up forever if
    // this call is ever lost (e.g. fired a tick before the native bridge
    // finishes its startup handshake) or silently rejects. A harmless
    // retry a few seconds later means one dropped call can never strand
    // the user on the splash screen indefinitely.
    const retry = setTimeout(() => {
      if (!cancelled) SplashScreen.hide().catch((err) => console.error('[splash] retry hide failed', err))
    }, 4000)

    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [])

  return null
}
