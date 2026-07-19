'use client'
// Second half of the Android OAuth bridge: Google/Facebook sign-in runs in
// a Chrome Custom Tab (see components/capacitor-oauth-buttons usage in the
// login/register pages), which has its own cookie jar separate from this
// app's WebView. Once oauth/callback/route.ts finishes there, it redirects
// to laundrease://oauth-complete?token=... — the OS routes that back into
// this already-running app (MainActivity is launchMode="singleTask"),
// Capacitor surfaces it as this appUrlOpen event, and we finish the
// handoff by loading the exchange endpoint *inside the WebView itself*, so
// the session cookies it sets land in the place that actually needs them.

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App, type URLOpenListenerEvent } from '@capacitor/app'
import { Browser } from '@capacitor/browser'

export function CapacitorOAuthBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listener = App.addListener('appUrlOpen', (event: URLOpenListenerEvent) => {
      let url: URL
      try {
        url = new URL(event.url)
      } catch {
        return
      }

      if (url.protocol !== 'laundrease:' || url.host !== 'oauth-complete') return

      const token = url.searchParams.get('token')
      if (!token) return

      Browser.close().catch(() => {})
      window.location.href = `/api/customer/auth/oauth/exchange?token=${encodeURIComponent(token)}`
    })

    return () => {
      listener.then((h) => h.remove())
    }
  }, [])

  return null
}
