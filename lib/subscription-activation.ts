// lib/subscription-activation.ts
// Shared logic for activating a laundry provider subscription.
// Used by: checkout (free), payu-callback, verify (Razorpay/Cashfree).
//
// Upgrade logic:
//   New plan sort_order > current → start immediately, ends_at = current.ends_at + 30 days
//   Same/downgrade           → schedule after current ends (status = 'scheduled')
//   No current sub           → start immediately, ends_at = NOW() + 30 days

import { query, queryOne } from '@/lib/db'

export interface ActivationParams {
  providerId:               number
  planId:                   number
  offerId:                  number | null
  amount:                   number          // 0 for free/trial
  isTrial:                  boolean
  commissionTypeOverride:   string | null
  commissionValueOverride:  number | null
  paymentTransactionId?:    string | null
  paymentGateway?:          string | null
  paymentGatewayOrderId?:   string | null
}

export interface ActivationResult {
  subscriptionId: number
  status:         'active' | 'scheduled'
  startsAt:       Date
  endsAt:         Date
  action:         'upgraded' | 'scheduled' | 'activated'
}

export async function activateSubscription(p: ActivationParams): Promise<ActivationResult> {
  // Fetch current active sub with its plan's sort_order
  const current = await queryOne<{
    id: number; ends_at: string; plan_sort_order: number; plan_id: number
  }>(`
    SELECT lps.id, lps.ends_at::TEXT, lsp.sort_order AS plan_sort_order, lps.plan_id
    FROM laundry_provider_subscriptions lps
    JOIN laundry_subscription_plans lsp ON lsp.id = lps.plan_id
    WHERE lps.provider_id = $1 AND lps.status = 'active'
    LIMIT 1
  `, [p.providerId])

  // Fetch new plan details
  const newPlan = await queryOne<{ sort_order: number; name: string }>(`
    SELECT sort_order, name FROM laundry_subscription_plans WHERE id = $1
  `, [p.planId])

  if (!newPlan) throw new Error(`Plan ${p.planId} not found`)

  const isUpgrade = !current || newPlan.sort_order > current.plan_sort_order

  // Cancel any existing scheduled sub (only one pending sub allowed at a time)
  await query(`
    UPDATE laundry_provider_subscriptions
    SET status = 'cancelled', cancelled_at = NOW(),
        cancel_reason = 'Replaced by newer subscription choice', updated_at = NOW()
    WHERE provider_id = $1 AND status = 'scheduled'
  `, [p.providerId])

  let startsAt: Date
  let endsAt:   Date
  let subStatus: 'active' | 'scheduled'
  let action:    ActivationResult['action']

  if (isUpgrade) {
    // Upgrade: activate immediately, extend end date by 30 days from current end
    if (current) {
      await query(`
        UPDATE laundry_provider_subscriptions
        SET status = 'cancelled', cancelled_at = NOW(),
            cancel_reason = 'Upgraded to higher plan', updated_at = NOW()
        WHERE id = $1
      `, [current.id])

      startsAt  = new Date()
      endsAt    = new Date(new Date(current.ends_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    } else {
      startsAt = new Date()
      endsAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
    subStatus = 'active'
    action    = current ? 'upgraded' : 'activated'
  } else {
    // Same tier or downgrade: schedule to start when current ends
    const currentEnds = current ? new Date(current.ends_at) : new Date()
    startsAt  = currentEnds
    endsAt    = new Date(currentEnds.getTime() + 30 * 24 * 60 * 60 * 1000)
    subStatus = 'scheduled'
    action    = 'scheduled'
  }

  const sub = await queryOne<{ id: number }>(`
    INSERT INTO laundry_provider_subscriptions (
      provider_id, plan_id, is_trial, amount_paid,
      starts_at, ends_at, status, offer_id,
      commission_type_override, commission_value_override,
      payment_transaction_id, payment_gateway, payment_gateway_order_id,
      auto_renew
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, TRUE
    ) RETURNING id
  `, [
    p.providerId,
    p.planId,
    p.isTrial,
    p.amount,
    startsAt.toISOString(),
    endsAt.toISOString(),
    subStatus,
    p.offerId,
    p.commissionTypeOverride,
    p.commissionValueOverride,
    p.paymentTransactionId    ?? null,
    p.paymentGateway          ?? null,
    p.paymentGatewayOrderId   ?? null,
  ])

  if (!sub) throw new Error('Failed to insert subscription row')

  // Mark basic trial as consumed when a trial is activated
  if (p.isTrial && subStatus === 'active') {
    await query(
      `UPDATE laundry_profiles SET basic_trial_used = TRUE, updated_at = NOW() WHERE id = $1`,
      [p.providerId]
    )
  }

  // Auto-verify provider so they appear in customer search immediately (active subs only)
  if (subStatus === 'active') {
    await query(
      `UPDATE laundry_profiles SET is_verified = TRUE, updated_at = NOW() WHERE id = $1`,
      [p.providerId]
    )
  }

  return { subscriptionId: sub.id, status: subStatus, startsAt, endsAt, action }
}

// Lazily promotes a scheduled subscription to active if its starts_at has passed.
// Call at the top of GET /api/laundry/subscription so the provider doesn't need
// to wait for the nightly cron to see their new plan activate.
export async function promoteScheduledIfReady(providerId: number): Promise<boolean> {
  const scheduled = await queryOne<{ id: number; starts_at: string }>(`
    SELECT id, starts_at::TEXT
    FROM laundry_provider_subscriptions
    WHERE provider_id = $1 AND status = 'scheduled' AND starts_at <= NOW()
    ORDER BY starts_at ASC
    LIMIT 1
  `, [providerId])

  if (!scheduled) return false

  // Expire the current active sub
  await query(`
    UPDATE laundry_provider_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE provider_id = $1 AND status = 'active'
  `, [providerId])

  // Promote scheduled → active
  await query(`
    UPDATE laundry_provider_subscriptions
    SET status = 'active', updated_at = NOW()
    WHERE id = $1
  `, [scheduled.id])

  return true
}
