'use client'
import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

const RETRY_INTERVAL_MS = 250
const MAX_ATTEMPTS = 20

export function CapacitorSplash() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let cancelled = false
    let attempts = 0
    let timer: ReturnType<typeof setTimeout>
    const attempt = () => {
      if (cancelled) return
      attempts++
      SplashScreen.hide().catch((err) => {
        if (attempts === 1) console.error('[splash] hide failed, retrying', err)
      })
      if (attempts < MAX_ATTEMPTS) timer = setTimeout(attempt, RETRY_INTERVAL_MS)
    }
    attempt()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [])
  return null
}
