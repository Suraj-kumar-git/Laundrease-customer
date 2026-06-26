// lib/subscription.ts
// Shared subscription-eligibility logic for laundry providers.
//
// A provider may receive new orders only if their current subscription row
// is 'active' AND not past ends_at (checked directly against NOW() rather
// than trusting the `status` column alone, since expire_subscriptions_and_
// fallback() is only ever run on-demand by an admin, not on a schedule —
// see scripts/23-subscription-enhancements.sql) AND, if their plan caps
// orders per cycle (max_orders), they haven't hit that cap yet.

interface SubscriptionRow {
  ends_at: string | Date
  starts_at: string | Date
  max_orders: number | null
  orders_this_cycle: number
}

interface QueryableClient {
  query: (text: string, params?: unknown[]) => Promise<{ rows: SubscriptionRow[] }>
}

export interface SubscriptionEligibility {
  eligible: boolean
  reason?: 'NO_ACTIVE_SUBSCRIPTION' | 'SUBSCRIPTION_EXPIRED' | 'ORDER_LIMIT_REACHED'
}

export async function checkProviderOrderEligibility(
  client: QueryableClient,
  providerId: number | string
): Promise<SubscriptionEligibility> {
  const result = await client.query(
    `SELECT
       lps.ends_at, lps.starts_at, lsp.max_orders,
       (
         SELECT COUNT(*) FROM orders o
         WHERE o.laundry_profile_id = $1
           AND o.created_at BETWEEN lps.starts_at AND lps.ends_at
           AND o.status NOT IN ('cancelled')
       )::INTEGER AS orders_this_cycle
     FROM laundry_provider_subscriptions lps
     INNER JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
     WHERE lps.provider_id = $1 AND lps.status = 'active'
     LIMIT 1`,
    [providerId]
  )

  const sub = result.rows[0]
  if (!sub) return { eligible: false, reason: 'NO_ACTIVE_SUBSCRIPTION' }
  if (new Date(sub.ends_at) <= new Date()) return { eligible: false, reason: 'SUBSCRIPTION_EXPIRED' }
  if (sub.max_orders != null && sub.orders_this_cycle >= sub.max_orders) {
    return { eligible: false, reason: 'ORDER_LIMIT_REACHED' }
  }
  return { eligible: true }
}

// Correlated EXISTS clause for provider-listing queries — splice into a WHERE
// clause alongside `lp.status = 'active' AND lp.is_verified = TRUE` so
// expired/capped-out providers don't show up for customers to order from in
// the first place. References `lp.id` from the enclosing query.
export const PROVIDER_HAS_SUBSCRIPTION_CAPACITY_SQL = `
  EXISTS (
    SELECT 1 FROM laundry_provider_subscriptions lps
    INNER JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
    WHERE lps.provider_id = lp.id
      AND lps.status = 'active'
      AND lps.ends_at > NOW()
      AND (
        lsp.max_orders IS NULL
        OR (
          SELECT COUNT(*) FROM orders o
          WHERE o.laundry_profile_id = lp.id
            AND o.created_at BETWEEN lps.starts_at AND lps.ends_at
            AND o.status NOT IN ('cancelled')
        ) < lsp.max_orders
      )
  )
`
