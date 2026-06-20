// app/api/customer/settings/route.ts
// GET  — fetch notification prefs + linked OAuth accounts + active session count
// PUT  — save notification preferences

import { NextRequest } from 'next/server'
import { query, queryOne } from '@/lib/db'
import {
  successResponse, errorResponse, serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

// ---- Canonical category metadata (used to build UI labels/descriptions) -----
// Stored here so the client doesn't need to hardcode them — API ships them.
const CATEGORY_META: Record<string, { label: string; description: string; locked?: boolean }> = {
  orders:     { label: 'Order Updates',      description: 'Pickup confirmed, in progress, out for delivery, delivered' },
  promotions: { label: 'Promotions & Offers', description: 'Discount codes, flash sales, and seasonal offers' },
  referrals:  { label: 'Referral Rewards',   description: 'When your referral places an order and you earn cashback' },
  security:   { label: 'Security Alerts',    description: 'Login from new device, password changes', locked: true },
  reminders:  { label: 'Reminders',          description: 'Incomplete orders, scheduled pickup reminders' },
}

const CATEGORY_ORDER = ['orders', 'promotions', 'referrals', 'security', 'reminders']

// ---- GET -----------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  try {
    // 1. Get customer_profile_id
    const profile = await queryOne<{ id: number }>(
      `SELECT cp.id FROM customer_profiles cp WHERE cp.user_id = $1`, [userId]
    )
    if (!profile) return errorResponse('Customer profile not found', 404)

    // 2. Notification prefs via DB function (fills defaults for missing rows)
    const prefsRes = await query<{ category: string; channel: string; enabled: boolean }>(
      `SELECT category, channel, enabled
       FROM get_notification_preferences($1)`,
      [profile.id]
    )

    // Shape into: { orders: { email: true, sms: true, push: true }, ... }
    const prefsMap: Record<string, Record<string, boolean>> = {}
    for (const row of prefsRes.rows) {
      prefsMap[row.category] = prefsMap[row.category] ?? {}
      prefsMap[row.category][row.channel] = row.enabled
    }

    // Build structured list for UI consumption
    const notifications = CATEGORY_ORDER.map(cat => ({
      category:    cat,
      label:       CATEGORY_META[cat].label,
      description: CATEGORY_META[cat].description,
      locked:      CATEGORY_META[cat].locked ?? false,
      channels: {
        email: prefsMap[cat]?.email ?? true,
        sms:   prefsMap[cat]?.sms   ?? true,
        push:  prefsMap[cat]?.push  ?? true,
      },
    }))

    // 3. Linked OAuth accounts
    const oauthRes = await query<{ provider: string; created_at: string; provider_user_id: string }>(
      `SELECT provider, created_at, provider_user_id
       FROM oauth_accounts
       WHERE user_id = $1
       ORDER BY created_at`,
      [userId]
    )

    const linkedAccounts = [
      { provider: 'google',   label: 'Google',   connected: false, connected_at: null as string | null },
      { provider: 'facebook', label: 'Facebook', connected: false, connected_at: null as string | null },
    ].map(acc => {
      const found = oauthRes.rows.find(r => r.provider === acc.provider)
      return {
        ...acc,
        connected:    !!found,
        connected_at: found?.created_at ?? null,
      }
    })

    // 4. Active session count (excluding current — counted separately)
    const sessionRes = await queryOne<{ total: number; other: number }>(
      `SELECT
         COUNT(*)::int                                              AS total,
         COUNT(*) FILTER (WHERE session_id != COALESCE(
           current_setting('app.current_session_id', TRUE), ''
         ))::int                                                    AS other
       FROM user_sessions
       WHERE user_id = $1 AND expires_at > NOW()`,
      [userId]
    )

    return successResponse({
      notifications,
      linked_accounts: linkedAccounts,
      sessions: {
        total: sessionRes?.total ?? 0,
        other: sessionRes?.other ?? 0,
      },
    })
  } catch (error) {
    console.error('[GET /api/customer/settings]', error)
    return serverErrorResponse('Failed to load settings')
  }
}

// ---- PUT -----------------------------------------------------------------------
// Body: { notifications: [{ category, channel, enabled }] }
// Validates categories/channels, enforces security lock, calls DB upsert function.

export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: { notifications: { category: string; channel: string; enabled: boolean }[] }
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  const items = body.notifications
  if (!Array.isArray(items) || items.length === 0)
    return errorResponse('notifications array is required', 400)

  const VALID_CATEGORIES = new Set(CATEGORY_ORDER)
  const VALID_CHANNELS   = new Set(['email', 'sms', 'push'])

  for (const item of items) {
    if (!VALID_CATEGORIES.has(item.category))
      return errorResponse(`Invalid category: ${item.category}`, 400)
    if (!VALID_CHANNELS.has(item.channel))
      return errorResponse(`Invalid channel: ${item.channel}`, 400)
    if (typeof item.enabled !== 'boolean')
      return errorResponse('enabled must be boolean', 400)
  }

  try {
    const profile = await queryOne<{ id: number }>(
      `SELECT cp.id FROM customer_profiles cp WHERE cp.user_id = $1`, [userId]
    )
    if (!profile) return errorResponse('Customer profile not found', 404)

    // Call DB function — handles security lock enforcement internally
    await query(
      `SELECT upsert_notification_preferences($1, $2::jsonb)`,
      [profile.id, JSON.stringify(items)]
    )

    return successResponse({ saved: true })
  } catch (error) {
    console.error('[PUT /api/customer/settings]', error)
    return serverErrorResponse('Failed to save notification preferences')
  }
}
