// lib/notifications/preferences.ts
// Gate for customer-facing notification sends. The Settings page already
// reads/writes customer_notification_preferences correctly (see
// app/api/customer/settings/route.ts) — nothing outside that route ever
// checked it before a send, which is the bug this closes. Call this before
// every customer-directed email/SMS; auth/OTP sends (security category,
// force-enabled by the DB layer) are intentionally never routed through here.

import { queryOne } from '@/lib/db'

export type NotificationCategory = 'orders' | 'promotions' | 'referrals' | 'security' | 'reminders'
export type NotificationChannel  = 'email' | 'sms' | 'push'

// Reuses get_notification_preferences() (scripts/14-settings.sql) as the
// single source of truth for defaults and the always-on 'security' category,
// rather than re-encoding that default table here. One round trip: resolves
// customer_profiles.id from the users.id every call site already has on
// hand (e.g. order.customer_id), then looks up the matching row.
export async function isNotificationEnabled(
  customerUserId: string | number,
  category: NotificationCategory,
  channel: NotificationChannel,
): Promise<boolean> {
  try {
    const row = await queryOne<{ enabled: boolean }>(`
      SELECT gp.enabled
      FROM customer_profiles cp
      CROSS JOIN LATERAL get_notification_preferences(cp.id) gp
      WHERE cp.user_id = $1 AND gp.category = $2 AND gp.channel = $3
    `, [customerUserId, category, channel])
    // No profile row (shouldn't happen for a real customer, but never block
    // a real notification over it) → fail open.
    return row?.enabled ?? true
  } catch (err) {
    // A broken preference check must never become the reason a real
    // notification silently stops firing — fail open, same as the
    // pre-existing (always-send) behavior.
    console.error('[notifications/preferences] isNotificationEnabled check failed:', err)
    return true
  }
}
