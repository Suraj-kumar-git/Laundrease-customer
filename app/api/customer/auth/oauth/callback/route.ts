import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { query, queryOne, transaction } from '@/lib/db'
import {
  generateSessionId,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  getClientIP,
} from '@/lib/auth'

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
  const tokenResponse = await fetch(
    `https://graph.facebook.com/v18.0/oauth/access_token?` +
    `client_id=${process.env.FACEBOOK_APP_ID}` +
    `&redirect_uri=${process.env.NEXT_PUBLIC_CUSTOMER_URL}/api/customer/auth/oauth/callback` +
    `&client_secret=${process.env.FACEBOOK_APP_SECRET}` +
    `&code=${code}`,
    { method: 'GET' }
  )

  if (!tokenResponse.ok) {
    throw new Error('Failed to exchange Facebook code')
  }

  const tokens = await tokenResponse.json()

  // Get user info
  const userResponse = await fetch(
    `https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${tokens.access_token}`
  )

  if (!userResponse.ok) {
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
  let jumpToDashboard;
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const stateStr = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      console.error('OAuth error:', error)
      redirect('/customer/auth/login?error=oauth_failed')
    }

    if (!code || !stateStr) {
      redirect('/customer/auth/login?error=invalid_oauth')
    }

    const state = JSON.parse(stateStr)
    const { provider, returnTo } = state;
    jumpToDashboard = returnTo;

    // Exchange code for tokens and get user info
    let oauthData
    if (provider === 'google') {
      oauthData = await exchangeGoogleCode(code!)
    } else if (provider === 'facebook') {
      oauthData = await exchangeFacebookCode(code!)
    } else {
      redirect('/customer/auth/login?error=invalid_provider')
    }

    // Check if email exists
    if (!oauthData.email) {
      redirect('/customer/auth/login?error=no_email')
    }

    const clientIP = getClientIP(req)

    // Use transaction to handle user creation/login
    const result = await transaction(async (client) => {
      // Check if user exists
      let user = await client.query(
        `SELECT 
          u.id, 
          u.email, 
          u.full_name, 
          u.status,
          r.name as role_name
         FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         WHERE u.email = $1 AND u.deleted_at IS NULL`,
        [oauthData.email.toLowerCase()]
      )

      let userId: string
      let isNewUser = false

      if (user.rows.length === 0) {
        // Create new user
        isNewUser = true
        const roleResult = await client.query(
          `SELECT id FROM roles WHERE name = 'customer'`
        )

        const newUser = await client.query(
          `INSERT INTO users (
            email, 
            password_hash, 
            full_name, 
            role_id, 
            status, 
            email_verified,
            email_verified_at,
            profile_image
          )
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
          RETURNING id, email, full_name`,
          [
            oauthData.email.toLowerCase(),
            '', // No password for OAuth users
            oauthData.name,
            roleResult.rows[0].id,
            'active',
            true, // Email verified via OAuth
            oauthData.picture,
          ]
        )

        userId = newUser.rows[0].id

        // Create customer profile
        await client.query(
          `INSERT INTO customer_profiles (user_id, preferences) 
           VALUES ($1, $2)`,
          [userId, JSON.stringify({})]
        )

        user = newUser
      } else {
        userId = user.rows[0].id

        // Update last login and profile image
        await client.query(
          `UPDATE users 
           SET last_logged_in = NOW(),
               profile_image = COALESCE(profile_image, $2),
               email_verified = true,
               email_verified_at = COALESCE(email_verified_at, NOW())
           WHERE id = $1`,
          [userId, oauthData.picture]
        )
      }

      // Check/Create OAuth account link
      const oauthAccount = await client.query(
        `SELECT id FROM oauth_accounts 
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider]
      )

      if (oauthAccount.rows.length === 0) {
        await client.query(
          `INSERT INTO oauth_accounts (
            user_id, 
            provider, 
            provider_user_id, 
            access_token, 
            refresh_token
          )
          VALUES ($1, $2, $3, $4, $5)`,
          [
            userId,
            provider,
            oauthData.provider_user_id,
            oauthData.access_token,
            oauthData.refresh_token,
          ]
        )
      } else {
        // Update tokens
        await client.query(
          `UPDATE oauth_accounts 
           SET access_token = $1,
               refresh_token = $2,
               updated_at = NOW()
           WHERE user_id = $3 AND provider = $4`,
          [
            oauthData.access_token,
            oauthData.refresh_token,
            userId,
            provider,
          ]
        )
      }

      return { userId, user: user.rows[0], isNewUser }
    })

    const refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d'; //For oAuth login, session will be logged in for 7 days.
    // Generate session and tokens
    const sessionId = generateSessionId()
    const accessToken = await generateAccessToken({
      userId: result.userId,
      email: oauthData.email,
      role: result.user?.role_name || 'customer',
      sessionId,
      emailVerified: true,
      phoneVerified: false
    })
    const refreshToken = await generateRefreshToken(result.userId, sessionId, refreshTokenExpiry)

    // Store session
    await query(
      `INSERT INTO user_sessions (
        user_id, 
        session_id, 
        refresh_token, 
        expires_at, 
        ip_address, 
        user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        result.userId,
        sessionId,
        refreshToken,
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        clientIP,
        req.headers.get('user-agent') || 'unknown',
      ]
    )

    // Set cookies
    await setAuthCookies(accessToken, refreshToken)

  } catch (error) {
    console.error('OAuth callback error:', error)
    redirect('/customer/auth/login?error=oauth_failed')
  }
  // Redirect to return URL or dashboard
  redirect(jumpToDashboard || '/customer/dashboard');
}