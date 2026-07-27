// lib/gst.ts
// Shared helpers for GST-inclusive service pricing. The rate itself is
// admin-configurable (order_fee_config, code='gst_rate' — see
// scripts/42-gst-inclusive-pricing.sql) rather than hardcoded, since the
// government can change the slab. get_gst_rate() is the single SQL-side
// source of truth; this just wraps it so every call site shares one query
// shape instead of repeating it.
//
// Server-only (imports lib/db) — pure math with no DB dependency lives in
// lib/gst-pure.ts, which this re-exports so existing server-side imports of
// applyGst/computeSubscriptionCharge from here keep working unchanged.

import { queryOne } from '@/lib/db'
import type { SubscriptionGstMode } from '@/lib/gst-pure'

export * from '@/lib/gst-pure'

export async function getGstRate(): Promise<number> {
  const row = await queryOne<{ rate: string }>(`SELECT get_gst_rate()::TEXT AS rate`)
  return row ? parseFloat(row.rate) : 18
}

// ─── Subscription GST (Part 2) ───────────────────────────────────────────────
// Single platform-wide toggle deciding how GST applies to the laundry-
// provider subscription fee — see platform_config key 'subscription_gst_mode'
// (scripts/42-gst-inclusive-pricing.sql).

export async function getSubscriptionGstMode(): Promise<SubscriptionGstMode> {
  const row = await queryOne<{ value: { mode?: string } }>(
    `SELECT value FROM platform_config WHERE key = 'subscription_gst_mode'`
  )
  return row?.value?.mode === 'exclusive' ? 'exclusive' : 'inclusive'
}
