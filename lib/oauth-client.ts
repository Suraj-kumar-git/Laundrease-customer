import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

// Google and Facebook block sign-in from inside a plain embedded WebView as
// a security policy — Capacitor's default (following normal <a>/redirect
// navigation to an external origin) either gets silently kicked out to the
// system browser or rejected outright. A Chrome Custom Tab is the pattern
// they actually accept; see components/capacitor-oauth-bridge.tsx for how
// the app gets the resulting session back afterwards.
export async function openOAuthProvider(provider: 'google' | 'facebook', returnTo?: string) {
  const params = new URLSearchParams()
  if (returnTo) params.set('returnTo', returnTo)

  if (Capacitor.isNativePlatform()) {
    params.set('platform', 'app')
    await Browser.open({ url: `${window.location.origin}/api/customer/auth/oauth/${provider}?${params.toString()}` })
    return
  }

  const query = params.toString()
  window.location.href = `/api/customer/auth/oauth/${provider}${query ? `?${query}` : ''}`
}
