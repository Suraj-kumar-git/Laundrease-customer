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
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide()
    }
  }, [])

  return null
}
