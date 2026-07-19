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

const RETRY_INTERVAL_MS = 250
const MAX_ATTEMPTS = 20 // 20 * 250ms = 5s ceiling before giving up

export function CapacitorSplash() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>

    // launchAutoHide is off, so the splash stays up forever until hide()
    // succeeds. The very first call can be lost (fired a tick before the
    // native bridge finishes its startup handshake) — hide() is idempotent,
    // so retrying fast and often gets it dismissed as soon as the bridge is
    // actually ready, instead of waiting out a fixed multi-second delay.
    const attempt = () => {
      if (cancelled) return
      attempts++
      SplashScreen.hide().catch((err) => {
        if (attempts === 1) console.error('[splash] hide failed, retrying', err)
      })
      if (attempts < MAX_ATTEMPTS) {
        timer = setTimeout(attempt, RETRY_INTERVAL_MS)
      }
    }

    attempt()

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return null
}
