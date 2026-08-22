// lib/delivery-condition-photos.ts
//
// Server-side scoping and the write lock for pickup condition photos. All
// three delivery routes (list/commit, presign, delete) resolve their context
// through here so the lock is defined exactly once.
//
// THE LOCK is the integrity core of this feature. Condition photos are only
// accepted while the parcel is still in the customer's hands — from the
// moment the pickup OTP is verified and the order flips to 'picked_up', the
// partner is carrying the goods and any damage from then on is theirs. A
// partner who could still upload "pre-existing damage" evidence after
// collection could photograph damage they caused in transit and have the
// provider or the customer absorb it. So: writes close at pickup, and the
// evidence set is frozen for the life of the claim.

import { queryOne } from '@/lib/db'

// Statuses in which the partner is with the customer and the goods have not
// changed hands yet. 'assigned_for_pickup' is included because a partner can
// reach the door and start inspecting before they remember to tap
// "out for pickup".
const WRITE_OPEN_STATUSES = new Set(['assigned_for_pickup', 'out_for_pickup'])

export interface ConditionContext {
  profileId:  string
  orderId:    string
  status:     string
  /** May this partner add/remove condition photos right now? */
  canWrite:   boolean
  /** Why not, phrased for the partner. Null when canWrite. */
  lockReason: string | null
}

/**
 * Resolve the requesting partner + order and decide whether writes are open.
 *
 * Returns null when the order doesn't exist or this partner never owned a leg
 * of it — callers should 404 rather than distinguishing the two, so a partner
 * can't probe for other people's order ids.
 */
export async function resolveConditionContext(
  userId:   string,
  publicId: string
): Promise<ConditionContext | null> {
  const profile = await queryOne<{ id: string }>(
    `SELECT id::TEXT FROM delivery_profiles WHERE user_id = $1`, [userId]
  )
  if (!profile) return null

  const row = await queryOne<{
    id: string
    status: string
    is_current_partner: boolean
    owns_pickup_leg: boolean
  }>(`
    SELECT
      o.id::TEXT AS id,
      o.status,
      (o.delivery_profile_id = $2::BIGINT) AS is_current_partner,
      EXISTS (
        SELECT 1 FROM order_delivery_legs l
        WHERE l.order_id = o.id AND l.delivery_profile_id = $2::BIGINT
          AND l.leg_type = 'pickup'
      ) AS owns_pickup_leg
    FROM orders o
    WHERE o.public_id = $1
      -- Readable by any partner who owns or owned a leg: a completed pickup
      -- stays viewable after the delivery leg moves to someone else.
      AND EXISTS (
        SELECT 1 FROM order_delivery_legs l
        WHERE l.order_id = o.id AND l.delivery_profile_id = $2::BIGINT
      )
  `, [publicId, profile.id])

  if (!row) return null

  let lockReason: string | null = null
  if (!row.owns_pickup_leg) {
    lockReason = 'Only the partner handling the pickup can record item condition'
  } else if (!row.is_current_partner) {
    lockReason = 'This order is no longer assigned to you'
  } else if (!WRITE_OPEN_STATUSES.has(row.status)) {
    lockReason = 'Condition photos are locked once the parcel has been picked up'
  }

  return {
    profileId:  profile.id,
    orderId:    row.id,
    status:     row.status,
    canWrite:   lockReason === null,
    lockReason,
  }
}

/**
 * Confirm an order_item_id actually belongs to this order.
 *
 * Without this a partner could attach evidence to an item id belonging to
 * somebody else's order — the item id travels in the request body and is
 * otherwise unconstrained.
 */
export async function itemBelongsToOrder(
  orderItemId: number,
  orderId:     string
): Promise<boolean> {
  const row = await queryOne<{ ok: boolean }>(
    `SELECT TRUE AS ok FROM order_items WHERE id = $1 AND order_id = $2::BIGINT`,
    [orderItemId, orderId]
  )
  return !!row
}
