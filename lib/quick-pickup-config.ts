// lib/quick-pickup-config.ts
//
// The platform-wide switch for Quick Pickup.
//
// Quick Pickup is the no-account lead capture: a visitor leaves a name, phone
// and pincode, and either operations call them back or a provider calls them
// directly. Ops asked for it to be something they can take down without a
// deploy, so it lives in platform_config rather than in the code.
//
// WHO IT HIDES IT FROM: customers and laundry providers — the two personas who
// see the feature as a product surface. Admin and support keep their Quick
// Pickup screens either way: requests already captured still need working,
// answering and reporting on long after the front door is closed. Turning the
// switch off stops NEW requests arriving; it does not orphan the ones that
// already have.
//
// DEFAULT WHEN UNSET: off. The switch exists because ops decided the feature
// should not be visible by default, so a missing row means the same thing an
// explicit false does. That also makes it fail closed: a config read that
// comes back empty for any reason hides the feature rather than exposing a
// front door nobody is watching.

import { queryOne } from '@/lib/db'

export const QUICK_PICKUP_CONFIG_KEY = 'quick_pickup_enabled'

/**
 * Is Quick Pickup switched on for customers and providers?
 *
 * Server-side only. Client components receive the resolved boolean — the
 * customer app through FeatureFlagsProvider, the laundry app through
 * LaundryContext — so no page has to fetch it for itself.
 */
export async function isQuickPickupEnabled(): Promise<boolean> {
  try {
    const row = await queryOne<{ value: any }>(
      `SELECT value FROM platform_config WHERE key = $1`,
      [QUICK_PICKUP_CONFIG_KEY]
    )
    if (!row) return false

    // Tolerate the shapes an admin write could leave behind: the object form
    // this app uses for boolean settings ({ enabled: true }, matching
    // order_fee_gst_enabled), a bare jsonb boolean, or the string "true".
    const v = row.value
    if (typeof v === 'boolean') return v
    if (typeof v === 'string')  return v.toLowerCase() === 'true'
    if (v && typeof v === 'object') return v.enabled === true
    return false
  } catch (err) {
    console.error('[quick-pickup-config] read failed, defaulting to off:', err)
    return false
  }
}
