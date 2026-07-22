// lib/order-reschedule.ts
// Single write path for every way an order's pickup date/time can change —
// customer self-reschedule, delivery-partner reschedule_pickup, admin/support
// update_schedule, and the automatic "not picked up" sweep. Centralizes the
// order_status_history logging (previously only the delivery path did this)
// and the reschedule_count tracking that feeds the 3-strike auto-cancel.
//
// Deliberately does NOT validate which statuses are reschedulable, past-dates,
// or provider-closed-dates — those rules stay at each call site, which already
// enforce (or, for admin/support, deliberately don't enforce) them today.

import { PoolClient } from 'pg'
import { calculateEstimatedDeliveryDate } from '@/lib/delivery-estimate'

export const RESCHEDULE_AUTO_CANCEL_THRESHOLD = 3

export type RescheduleInitiatorRole = 'customer' | 'delivery' | 'admin' | 'support' | 'system'

export interface RescheduleOrderParams {
  client:            PoolClient
  orderId:           number
  laundryProfileId:  number | null
  newPickupDate:     string              // 'YYYY-MM-DD'
  newPickupTimeSlot?: string | null       // omit/null = keep existing slot
  newStatus?:        string | null       // omit/null = keep existing status
  reasonNote:        string
  initiatedBy:       string | number | null
  initiatedByRole:   RescheduleInitiatorRole
}

export interface RescheduleOrderResult {
  pickupDate:              string
  pickupTimeSlot:          string
  estimatedDeliveryDate:   string | null
  rescheduleCount:         number
  autoCancelThresholdReached: boolean
}

export async function rescheduleOrder(params: RescheduleOrderParams): Promise<RescheduleOrderResult> {
  const { client, orderId } = params

  const current = await client.query(
    `SELECT status, pickup_time_slot FROM orders WHERE id = $1`,
    [orderId]
  )
  if (current.rowCount === 0) throw new Error('ORDER_NOT_FOUND')

  const pickupTimeSlot   = params.newPickupTimeSlot ?? current.rows[0].pickup_time_slot
  const statusForHistory = params.newStatus ?? current.rows[0].status

  let estimatedDeliveryDate: string | null = null
  if (params.laundryProfileId != null) {
    const itemsRes = await client.query(
      `SELECT ois.service_id, ois.is_express
       FROM order_items oi
       INNER JOIN order_item_services ois ON ois.order_item_id = oi.id
       WHERE oi.order_id = $1`,
      [orderId]
    )
    estimatedDeliveryDate = await calculateEstimatedDeliveryDate(
      (text, p) => client.query(text, p),
      {
        providerId: params.laundryProfileId,
        pickupDate: params.newPickupDate,
        items: itemsRes.rows.map((r: any) => ({ serviceId: r.service_id, isExpress: r.is_express })),
      }
    )
  }

  const updateRes = await client.query(
    `UPDATE orders
     SET pickup_date = $1, pickup_time_slot = $2,
         estimated_delivery_date = COALESCE($3, estimated_delivery_date),
         status = $4, reschedule_count = reschedule_count + 1, updated_at = NOW()
     WHERE id = $5
     RETURNING reschedule_count`,
    [params.newPickupDate, pickupTimeSlot, estimatedDeliveryDate, statusForHistory, orderId]
  )
  const rescheduleCount = updateRes.rows[0].reschedule_count as number

  await client.query(
    `INSERT INTO order_status_history (order_id, status, notes, updated_by) VALUES ($1, $2, $3, $4)`,
    [orderId, statusForHistory, params.reasonNote, params.initiatedBy]
  )

  return {
    pickupDate: params.newPickupDate,
    pickupTimeSlot,
    estimatedDeliveryDate,
    rescheduleCount,
    autoCancelThresholdReached: rescheduleCount >= RESCHEDULE_AUTO_CANCEL_THRESHOLD,
  }
}
