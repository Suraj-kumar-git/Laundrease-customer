import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import crypto from 'crypto'
import { query } from '@/lib/db'
import { createSessionAndSetCookies } from '@/lib/auth'
import { upsertOAuthUser } from '@/lib/oauth-account'

async function exchangeGoogleCode(code: string) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/auth/oauth/callback`,
      grant_type: 'authorization_code',
    }),
  })

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange Google code')
  }

  const tokens = await tokenResponse.json()

  // Get user info
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })

  if (!userResponse.ok) {
    throw new Error('Failed to get Google user info')
  }

  const userInfo = await userResponse.json()

  return {
    provider_user_id: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  }
}

async function exchangeFacebookCode(code: string) {
  const tokenParams = new URLSearchParams({
    client_id: process.env.FACEBOOK_APP_ID || '',
    redirect_uri: `${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/auth/oauth/callback`,
    client_secret: process.env.FACEBOOK_APP_SECRET || '',
    code,
  })

  const tokenResponse = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?${tokenParams.toString()}`,
    { method: 'GET' }
  )

  if (!tokenResponse.ok) {
    // Facebook's error body (e.g. "redirect_uri does not match", "invalid
    // code") is the single most useful thing for diagnosing OAuth setup
    // issues — surface it instead of swallowing it into a generic message.
    const errorBody = await tokenResponse.text().catch(() => '')
    console.error('Facebook token exchange failed:', tokenResponse.status, errorBody)
    throw new Error('Failed to exchange Facebook code')
  }

  const tokens = await tokenResponse.json()

  // Get user info
  const userResponse = await fetch(
    `https://graph.facebook.com/me?${new URLSearchParams({
      fields: 'id,name,email,picture',
      access_token: tokens.access_token,
    }).toString()}`
  )

  if (!userResponse.ok) {
    const errorBody = await userResponse.text().catch(() => '')
    console.error('Facebook user info fetch failed:', userResponse.status, errorBody)
    throw new Error('Failed to get Facebook user info')
  }

  const userInfo = await userResponse.json()

  return {
    provider_user_id: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture?.data?.url,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get('code')
  const stateStr = searchParams.get('state')
  const error = searchParams.get('error')
  const errorReason = searchParams.get('error_reason') || searchParams.get('error_description')

  // These are real, expected outcomes (user denied access, provider sent a
  // malformed callback, etc.) — redirect immediately, outside any try/catch,
  // so Next's redirect() throw isn't accidentally caught below and silently
  // rewritten into a generic 'oauth_failed' with the real reason lost.
  if (error) {
    console.error('OAuth provider returned an error:', error, errorReason)
    redirect(`/customer/auth/login?error=oauth_failed&reason=${encodeURIComponent(error)}`)
  }

  if (!code || !stateStr) {
    redirect('/customer/auth/login?error=invalid_oauth')
  }

  const state = JSON.parse(stateStr)
  const { provider, returnTo, platform } = state
  let jumpToDashboard = returnTo
  const isNativeApp = platform === 'app'

  if (provider !== 'google' && provider !== 'facebook') {
    redirect('/customer/auth/login?error=invalid_provider')
  }

  try {
    // Exchange code for tokens and get user info
    const oauthData = provider === 'google'
      ? await exchangeGoogleCode(code)
      : await exchangeFacebookCode(code)

    // Check if email exists
    if (!oauthData.email) {
      redirect('/customer/auth/login?error=no_email')
    }

    // Find-or-create the customer and link the provider account. Shared with
    // the Android native-token flow — see lib/oauth-account.ts.
    const result = await upsertOAuthUser(provider, oauthData)

    if (isNativeApp) {
      // This request is running inside a Chrome Custom Tab, which has its
      // own cookie jar separate from the app's WebView — setting cookies
      // here wouldn't reach the app. Hand off via a short-lived, single-use
      // token instead; the app's own WebView exchanges it for a real
      // session (see app/api/customer/auth/oauth/exchange/route.ts).
      const exchangeToken = crypto.randomBytes(32).toString('hex')
      await query(
        `INSERT INTO oauth_exchange_tokens (token, user_id, return_to, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [
          exchangeToken,
          result.userId,
          jumpToDashboard || '/customer/dashboard',
          new Date(Date.now() + 2 * 60 * 1000), // same-device, same-instant handoff — 2 minutes is generous
        ]
      )
      redirect(`laundrease://oauth-complete?token=${exchangeToken}`)
    }

    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d' // For oAuth login, session will be logged in for 7 days.
    await createSessionAndSetCookies(req, {
      userId: result.userId,
      email: oauthData.email,
      role: result.user?.role_name || 'customer',
      refreshTokenExpiry,
    })

  } catch (error: any) {
    // redirect() throws internally (digest starts with 'NEXT_REDIRECT') so
    // Next can perform the actual navigation — the no_email redirect above
    // is one of these. Let it propagate instead of treating it as a real
    // failure, otherwise the real reason gets lost behind a generic
    // 'oauth_failed' every time.
    if (typeof error?.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')) {
      throw error
    }
    console.error('OAuth callback error:', error)
    redirect('/customer/auth/login?error=oauth_failed')
  }
  // Redirect to return URL or dashboard
  redirect(jumpToDashboard || '/customer/dashboard');
}