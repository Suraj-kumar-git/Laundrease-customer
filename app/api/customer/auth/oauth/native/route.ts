import { NextRequest } from 'next/server'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { successResponse, errorResponse } from '@/lib/api-response'
import { createSessionAndSetCookies } from '@/lib/auth'
import { upsertOAuthUser, type OAuthIdentity } from '@/lib/oauth-account'

// The Android half of OAuth. The web flow redirects through the provider and
// comes back with an authorization code (see ../callback/route.ts); the native
// plugin instead hands the app a token that the provider already issued, and
// the app POSTs it here from inside its own WebView — so the Set-Cookie
// headers land in the jar that actually matters, with no Custom Tab and no
// exchange-token round trip.
//
// SECURITY: a token arriving here is just a string from an untrusted client.
// It is only meaningful once we have checked *who it was issued to* — Google's
// `aud` and Facebook's `app_id` below. Skipping that check would let a token
// minted for any other app log someone into this one, so neither branch may
// return an identity without it.

// Cached across invocations by jose, so this is one key fetch per process
// rather than one per sign-in.
const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

async function verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
  // Credential Manager issues the ID token to the *web* client ID that the app
  // passed as serverClientId — not the Android client ID — so this is the
  // audience we require. See lib/oauth-client.ts for the app side.
  const audience = process.env.GOOGLE_CLIENT_ID
  if (!audience) {
    throw new Error('GOOGLE_CLIENT_ID is not configured')
  }

  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience,
  })

  if (!payload.sub) {
    throw new Error('Google ID token has no subject')
  }
  // Google sets this false for unverified Workspace/consumer addresses; the
  // account-matching in upsertOAuthUser keys on email, so accepting an
  // unverified one would let a stranger claim an existing account.
  if (payload.email_verified === false) {
    throw new Error('Google account email is not verified')
  }

  return {
    provider_user_id: payload.sub,
    email: String(payload.email || ''),
    name: (payload.name as string) || null,
    picture: (payload.picture as string) || null,
    access_token: null,
    refresh_token: null,
  }
}

async function verifyFacebookAccessToken(accessToken: string): Promise<OAuthIdentity> {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('Facebook OAuth is not configured')
  }

  // debug_token is what proves the token was minted for *this* app. Without
  // it, a token from any Facebook app would be accepted here.
  const debugResponse = await fetch(
    `https://graph.facebook.com/debug_token?${new URLSearchParams({
      input_token: accessToken,
      access_token: `${appId}|${appSecret}`,
    }).toString()}`
  )

  if (!debugResponse.ok) {
    const errorBody = await debugResponse.text().catch(() => '')
    console.error('Facebook debug_token failed:', debugResponse.status, errorBody)
    throw new Error('Could not validate Facebook token')
  }

  const debug = await debugResponse.json()
  if (!debug?.data?.is_valid || debug.data.app_id !== appId) {
    throw new Error('Facebook token was not issued for this app')
  }

  const userResponse = await fetch(
    `https://graph.facebook.com/me?${new URLSearchParams({
      fields: 'id,name,email,picture',
      access_token: accessToken,
    }).toString()}`
  )

  if (!userResponse.ok) {
    const errorBody = await userResponse.text().catch(() => '')
    console.error('Facebook user info fetch failed:', userResponse.status, errorBody)
    throw new Error('Could not read Facebook profile')
  }

  const userInfo = await userResponse.json()

  return {
    provider_user_id: userInfo.id,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture?.data?.url,
    access_token: accessToken,
    refresh_token: null,
  }
}

export async function POST(req: NextRequest) {
  let body: { provider?: string; token?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Invalid request body', 400, 'INVALID_BODY')
  }

  const { provider, token } = body

  if (provider !== 'google' && provider !== 'facebook') {
    return errorResponse('Unsupported provider', 400, 'INVALID_PROVIDER')
  }
  if (!token || typeof token !== 'string') {
    return errorResponse('Missing token', 400, 'MISSING_TOKEN')
  }

  let identity: OAuthIdentity
  try {
    identity = provider === 'google'
      ? await verifyGoogleIdToken(token)
      : await verifyFacebookAccessToken(token)
  } catch (error) {
    // Deliberately vague to the client — the detail goes to the logs, not to
    // whoever is probing the endpoint.
    console.error(`Native ${provider} token verification failed:`, error)
    return errorResponse('Could not verify sign-in', 401, 'OAUTH_VERIFICATION_FAILED')
  }

  // Facebook accounts registered by phone number have no email, and the whole
  // account model here keys on one.
  if (!identity.email) {
    return errorResponse(
      'This account has no email address associated with it',
      400,
      'NO_EMAIL'
    )
  }

  try {
    const result = await upsertOAuthUser(provider, identity)

    // 7 days, matching the web OAuth flow in ../callback/route.ts.
    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d'
    await createSessionAndSetCookies(req, {
      userId: result.userId,
      email: identity.email,
      role: result.user?.role_name || 'customer',
      refreshTokenExpiry,
    })

    return successResponse({
      isNewUser: result.isNewUser,
      user: {
        id: result.userId,
        email: identity.email,
        fullName: result.user?.full_name || identity.name || null,
      },
    })
  } catch (error) {
    console.error('Native OAuth sign-in failed:', error)
    return errorResponse('Sign-in failed', 500, 'OAUTH_FAILED')
  }
}
