import { transaction } from '@/lib/db'

// The identity an OAuth provider hands back, normalised across providers and
// across transports. The web flow builds this from an authorization-code
// exchange (see app/api/customer/auth/oauth/callback/route.ts); the Android
// flow builds it from a natively-issued token (see
// app/api/customer/auth/oauth/native/route.ts). Everything downstream of this
// point is identical, which is why it lives here rather than in either route.
export interface OAuthIdentity {
  provider_user_id: string
  email: string
  name?: string | null
  picture?: string | null
  access_token?: string | null
  refresh_token?: string | null
}

export interface OAuthUpsertResult {
  userId: string
  user: { id: string; email: string; full_name: string; role_name?: string }
  isNewUser: boolean
}

/**
 * Find-or-create the customer behind an OAuth identity and link the provider
 * account to them, in a single transaction.
 *
 * Matching is by email: a customer who signed up with a password and later
 * uses Google with the same address lands on their existing account rather
 * than a duplicate.
 */
export async function upsertOAuthUser(
  provider: 'google' | 'facebook',
  oauthData: OAuthIdentity
): Promise<OAuthUpsertResult> {
  return transaction(async (client) => {
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

      await client.query(
        `INSERT INTO customer_profiles (user_id, preferences)
         VALUES ($1, $2)`,
        [userId, JSON.stringify({})]
      )

      user = newUser
    } else {
      userId = user.rows[0].id

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
}
