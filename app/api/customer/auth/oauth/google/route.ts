import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'

export async function GET(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/auth/oauth/callback`

  if (!clientId) {
    return new Response('Google OAuth not configured', { status: 500 })
  }

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state: JSON.stringify({
      provider: 'google',
      returnTo: req.nextUrl.searchParams.get('returnTo') || '/customer/dashboard',
      // Set when the Android app opened this in a Custom Tab (see
      // components/capacitor-oauth-bridge.tsx) — the callback route uses
      // this to bridge back into the app instead of setting cookies here,
      // since a Custom Tab's cookies don't reach the app's own WebView.
      platform: req.nextUrl.searchParams.get('platform') === 'app' ? 'app' : 'web',
    }),
  })

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

  redirect(authUrl)
}