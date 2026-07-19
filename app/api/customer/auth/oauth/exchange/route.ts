import { NextRequest } from 'next/server'
import { redirect } from 'next/navigation'
import { query, queryOne } from '@/lib/db'
import { createSessionAndSetCookies } from '@/lib/auth'

// The other half of the Android OAuth bridge (see oauth/callback/route.ts
// and components/capacitor-oauth-bridge.tsx): the app's own WebView hits
// this — not the Custom Tab — so the Set-Cookie headers from
// createSessionAndSetCookies land in the WebView's cookie jar, which is
// the one that actually matters for the app to be logged in.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    redirect('/customer/auth/login?error=invalid_oauth')
  }

  const row = await queryOne<{
    user_id: string
    return_to: string | null
    email: string
    role_name: string
  }>(
    `SELECT oet.user_id, oet.return_to, u.email, r.name AS role_name
     FROM oauth_exchange_tokens oet
     JOIN users u ON u.id = oet.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE oet.token = $1
       AND oet.used_at IS NULL
       AND oet.expires_at > NOW()`,
    [token]
  )

  if (!row) {
    redirect('/customer/auth/login?error=oauth_expired')
  }

  // Single-use — mark it spent before creating the session so a retried
  // or replayed request can't ride the same token twice.
  await query(`UPDATE oauth_exchange_tokens SET used_at = NOW() WHERE token = $1`, [token])

  await createSessionAndSetCookies(req, {
    userId: row.user_id,
    email: row.email,
    role: row.role_name || 'customer',
  })

  redirect(row.return_to || '/customer/dashboard')
}
