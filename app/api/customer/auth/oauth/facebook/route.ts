import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'

export async function GET(req: NextRequest) {
  const clientId = process.env.FACEBOOK_APP_ID
  const redirectUri = `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/auth/oauth/callback`

  if (!clientId) {
    return new Response('Facebook OAuth not configured', { status: 500 })
  }

  // Build OAuth URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'email,public_profile',
    state: JSON.stringify({
      provider: 'facebook',
      returnTo: req.nextUrl.searchParams.get('returnTo') || '/customer/dashboard',
      // Set when the Android app opened this in a Custom Tab (see
      // components/capacitor-oauth-bridge.tsx) — the callback route uses
      // this to bridge back into the app instead of setting cookies here,
      // since a Custom Tab's cookies don't reach the app's own WebView.
      platform: req.nextUrl.searchParams.get('platform') === 'app' ? 'app' : 'web',
    }),
  })

  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`

  redirect(authUrl)
}