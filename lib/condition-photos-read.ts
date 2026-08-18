// lib/condition-photos-read.ts
//
// Server-side reads of pickup condition photos for every persona that only
// looks at them: provider, support, admin, customer. (The delivery persona
// writes them — see lib/delivery-condition-photos.ts.)
//
// Access control lives with the caller, not here. Each route has already
// proven the requester may see this order — the provider owns it, the support
// agent holds the item-reports tab, the customer placed it — and these helpers
// take an order id that has passed that check.

import { query } from '@/lib/db'
import { getConditionPhotoUrl } from '@/lib/s3'
import type { ConditionPhoto, DamageType } from '@/lib/condition-photo-types'

export interface ConditionPhotoSet {
  /** Attached to a specific garment. */
  photos:        ConditionPhoto[]
  /** Whole-consignment shots, not tied to one garment. */
  generalPhotos: ConditionPhotoSet['photos']
}

interface Row {
  id: number
  order_item_id: number | null
  damage_type: string
  note: string | null
  s3_key: string
  created_at: string
  item_label?: string | null
}

async function sign(rows: Row[]): Promise<ConditionPhotoSet> {
  const photos = await Promise.all(rows.map(async r => ({
    id:            r.id,
    order_item_id: r.order_item_id,
    damage_type:   r.damage_type as DamageType,
    note:          r.note,
    created_at:    r.created_at,
    item_label:    r.item_label ?? null,
    url:           await getConditionPhotoUrl(r.s3_key).catch(() => null),
  })))

  return {
    photos:        photos.filter(p => p.order_item_id !== null),
    generalPhotos: photos.filter(p => p.order_item_id === null),
  }
}

/**
 * Evidence relevant to one claim: photos of the claimed garment, plus any
 * whole-consignment shots.
 *
 * No item label — every photo here is already scoped to the one garment under
 * review, so labelling each would just repeat the heading.
 */
export async function loadClaimConditionPhotos(
  orderId:     number | string,
  orderItemId: number | string
): Promise<ConditionPhotoSet> {
  const { rows } = await query<Row>(`
    SELECT id, order_item_id, damage_type, note, s3_key, created_at::TEXT
    FROM order_item_condition_photos
    WHERE order_id = $1
      AND (order_item_id = $2 OR order_item_id IS NULL)
    ORDER BY id
  `, [orderId, orderItemId])

  return sign(rows)
}

/**
 * Every condition photo on an order, each labelled with its garment — order
 * views mix photos from several items into one list, where an unlabelled
 * close-up of a stain says nothing about what it's a stain on.
 */
export async function loadOrderConditionPhotos(
  orderId: number | string
): Promise<ConditionPhotoSet> {
  const { rows } = await query<Row>(`
    SELECT cp.id, cp.order_item_id, cp.damage_type, cp.note, cp.s3_key,
           cp.created_at::TEXT,
           COALESCE(oi.garment_label, pt.name) AS item_label
    FROM order_item_condition_photos cp
    LEFT JOIN order_items   oi ON oi.id = cp.order_item_id
    LEFT JOIN product_types pt ON pt.id = oi.product_type_id
    WHERE cp.order_id = $1
    ORDER BY cp.id
  `, [orderId])

  return sign(rows)
}
