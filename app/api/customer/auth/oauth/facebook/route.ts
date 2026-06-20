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
    }),
  })

  const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`

  redirect(authUrl)
}