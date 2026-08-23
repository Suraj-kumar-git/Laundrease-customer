import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

// Sign-in has three paths, in descending order of quality:
//
//  1. NATIVE (Android app, configured) — @capgo/capacitor-social-login drives
//     Android's Credential Manager, so Google shows the OS account-picker
//     sheet *inside* the app, and Facebook goes through its native SDK
//     (one-tap via the installed Facebook app, else its own Custom Tab).
//     The provider hands back a token which POSTs to
//     /api/customer/auth/oauth/native for verification.
//
//  2. CUSTOM TAB (Android app, native unavailable) — the original flow.
//     Google and Facebook both refuse sign-in inside a plain embedded
//     WebView as a security policy, so a Chrome Custom Tab is the pattern
//     they accept. See components/capacitor-oauth-bridge.tsx for how the
//     session gets back into the app afterwards.
//
//  3. REDIRECT (browser) — ordinary server-side OAuth.
//
// Path 2 is not dead code. This app loads a *remote* URL
// (capacitor.config.ts sets server.url), so its JavaScript updates whenever
// laundrease.in is deployed, while the native plugin only arrives with a new
// APK. Anyone still running an older APK reaches this file's newest code with
// no plugin underneath it, and falls through to the Custom Tab rather than
// finding sign-in broken.

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID
const FACEBOOK_APP_ID = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID
const FACEBOOK_CLIENT_TOKEN = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_TOKEN

export type OAuthProvider = 'google' | 'facebook'

/** Thrown when the user backs out of the native sheet — not an error to report. */
export class OAuthCancelledError extends Error {
  constructor() {
    super('Sign-in was cancelled')
    this.name = 'OAuthCancelledError'
  }
}

function isProviderConfigured(provider: OAuthProvider): boolean {
  return provider === 'google' ? !!GOOGLE_WEB_CLIENT_ID : !!FACEBOOK_APP_ID
}

// Loaded on demand so the plugin stays out of the main bundle for the
// (majority) web visitors who will never reach the native path.
let initPromise: Promise<typeof import('@capgo/capacitor-social-login')> | null = null

function loadPlugin() {
  if (!initPromise) {
    initPromise = import('@capgo/capacitor-social-login').then(async (mod) => {
      await mod.SocialLogin.initialize({
        ...(GOOGLE_WEB_CLIENT_ID
          // Credential Manager wants the *web* client ID here, not the Android
          // one — passing the Android client ID is the classic silent failure.
          // The Android client still has to exist in the same Google Cloud
          // project, matched to the APK's package name and signing SHA-1;
          // that is what authorises this app to ask at all.
          ? { google: { webClientId: GOOGLE_WEB_CLIENT_ID } }
          : {}),
        ...(FACEBOOK_APP_ID
          ? { facebook: { appId: FACEBOOK_APP_ID, clientToken: FACEBOOK_CLIENT_TOKEN } }
          : {}),
      })
      return mod
    }).catch((error) => {
      // Reset so a later attempt can retry rather than being stuck with a
      // rejected promise for the life of the page.
      initPromise = null
      throw error
    })
  }
  return initPromise
}

/**
 * Run the native sign-in sheet and establish a session.
 *
 * Returns false when the native path is simply not available (old APK, plugin
 * missing, provider not configured) so the caller can fall back. Cancellation
 * and genuine failures throw, because those must not silently re-open sign-in
 * in a Custom Tab on top of the sheet the user just dismissed.
 */
async function nativeSignIn(provider: OAuthProvider): Promise<boolean> {
  if (!isProviderConfigured(provider)) return false

  let token: string | null | undefined
  try {
    const { SocialLogin } = await loadPlugin()

    if (provider === 'google') {
      const { result } = await SocialLogin.login({
        provider: 'google',
        options: {},
      })
      // The response type is a union with the offline-mode shape, which only
      // carries a serverAuthCode. We never enable offline mode, but the
      // compiler cannot know that from here.
      token = 'idToken' in result ? result.idToken : null
    } else {
      const { result } = await SocialLogin.login({
        provider: 'facebook',
        options: { permissions: ['email', 'public_profile'] },
      })
      token = result.accessToken?.token
    }
  } catch (error) {
    if ((error as { code?: string })?.code === 'USER_CANCELLED') {
      throw new OAuthCancelledError()
    }
    // Anything else here — plugin absent on an older APK, Credential Manager
    // unavailable, misconfigured SHA-1 — is recoverable via the Custom Tab.
    console.warn(`Native ${provider} sign-in unavailable, falling back:`, error)
    return false
  }

  if (!token) {
    console.warn(`Native ${provider} sign-in returned no token, falling back`)
    return false
  }

  // Sent from the app's own WebView, so the session cookies this sets land in
  // the jar the app actually reads from — the whole reason the Custom Tab
  // path needs a separate exchange step and this one does not.
  const response = await fetch('/api/customer/auth/oauth/native', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, token }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Sign-in failed')
  }

  return true
}

/**
 * Start sign-in with the given provider.
 *
 * On success via the native path this resolves and the caller should navigate
 * to `returnTo` itself. The other two paths navigate away, so nothing after
 * the call runs.
 */
export async function openOAuthProvider(provider: OAuthProvider, returnTo?: string) {
  const params = new URLSearchParams()
  if (returnTo) params.set('returnTo', returnTo)

  if (Capacitor.isNativePlatform()) {
    if (await nativeSignIn(provider)) return

    params.set('platform', 'app')
    await Browser.open({
      url: `${window.location.origin}/api/customer/auth/oauth/${provider}?${params.toString()}`,
    })
    return
  }

  const query = params.toString()
  window.location.href = `/api/customer/auth/oauth/${provider}${query ? `?${query}` : ''}`
}
