// lib/delivery-availability.ts
// Estimates how booked-up delivery is in a customer's pickup zone right now,
// so the checkout flow can push the earliest bookable pickup slot further out
// when delivery partners serving that area are overloaded.
//
// Mirrors the zone-matching + workload predicate used by
// auto_assign_delivery_partner() (scripts/12-fixes-and-fees.sql) — but reads
// only the *current* active-order count for the least-loaded eligible
// partner, since at checkout time we don't yet know which slot/date will
// finally be picked.

export type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

export interface DeliveryQueueInfo {
  hasPartner: boolean
  queueCount: number
}

// Slot-tier thresholds — how many active orders the least-loaded eligible
// delivery partner is carrying determines how far out the earliest bookable
// slot gets pushed today.
export const QUEUE_TIERS = {
  immediate: 5,   // <=5  -> earliest slot open right now
  next:      12,  // 6-12 -> skip to the slot after that
  lastToday: 20,  // 13-20 -> only the last slot of today
  // >20 -> no slots left today, earliest is tomorrow
} as const

export async function getDeliveryQueueInfo(
  query: QueryFn,
  params: { postalCode?: string | null; city?: string | null }
): Promise<DeliveryQueueInfo> {
  const result = await query(
    `SELECT
       (SELECT COUNT(*) FROM orders o2
        WHERE o2.delivery_profile_id = dp.id
          AND o2.status NOT IN ('delivered','cancelled','completed','returned')
       ) AS active_count
     FROM delivery_profiles dp
     JOIN users u ON u.id = dp.user_id
     WHERE dp.status = 'active'
       AND dp.is_verified = TRUE
       AND u.status = 'active'
       AND (dp.shift_status IN ('on_duty','off_duty') OR dp.is_online = TRUE)
       AND (
         EXISTS (
           SELECT 1
           FROM delivery_profile_service_zones dpsz
           JOIN service_zones sz ON sz.id = dpsz.service_zone_id
           WHERE dpsz.delivery_profile_id = dp.id
             AND (sz.shape->>'postal_code' = $1 OR sz.shape->>'city' ILIKE $2)
         )
         OR NOT EXISTS (
           SELECT 1 FROM delivery_profile_service_zones WHERE delivery_profile_id = dp.id
         )
       )
     ORDER BY active_count ASC
     LIMIT 1`,
    [params.postalCode ?? null, params.city ?? null]
  )

  if (result.rows.length === 0) {
    // No eligible delivery partner found for this zone right now — don't
    // block checkout over incomplete delivery-network data; treat as
    // unconstrained (earliest slot stays open).
    return { hasPartner: false, queueCount: 0 }
  }

  return { hasPartner: true, queueCount: parseInt(result.rows[0].active_count, 10) || 0 }
}

export type SlotTier = 'immediate' | 'next' | 'last_today' | 'tomorrow_only'

// Which of today's remaining (non-past) slots are still bookable, based on
// how loaded the least-busy eligible delivery partner is right now:
//   immediate     -> the earliest remaining slot is bookable
//   next          -> skip the earliest remaining slot, the one after is bookable
//   last_today    -> only the very last remaining slot of today is bookable
//   tomorrow_only -> no slot today is bookable, earliest is tomorrow
export function getSlotTier(queueCount: number): SlotTier {
  if (queueCount <= QUEUE_TIERS.immediate) return 'immediate'
  if (queueCount <= QUEUE_TIERS.next)      return 'next'
  if (queueCount <= QUEUE_TIERS.lastToday) return 'last_today'
  return 'tomorrow_only'
}
