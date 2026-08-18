// lib/condition-photo-types.ts
//
// Pure, client-safe half of the pickup-condition-photo feature: the damage
// vocabulary shared by the delivery capture UI and the server that validates
// it. Kept separate from lib/delivery-condition-photos.ts because that one
// imports @/lib/db, and importing it from a client component would drag `pg`
// into the browser bundle.

export const DAMAGE_TYPES = [
  'stain',
  'tear',
  'discoloration',
  'missing_part',
  'other',
] as const

export type DamageType = (typeof DAMAGE_TYPES)[number]

// Must stay in step with the CHECK constraint on
// order_item_condition_photos.damage_type (scripts/54-pickup-condition-photos.sql).
export const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
  stain:         'Stain',
  tear:          'Tear / hole',
  discoloration: 'Discolouration',
  missing_part:  'Missing button / part',
  other:         'Other',
}

export function isDamageType(value: unknown): value is DamageType {
  return typeof value === 'string' && (DAMAGE_TYPES as readonly string[]).includes(value)
}

export interface ConditionPhoto {
  id:            number
  order_item_id: number | null
  damage_type:   DamageType
  note:          string | null
  url:           string | null   // signed; null if the object has gone missing
  created_at:    string
  mine?:         boolean         // delivery persona only — can this partner delete it
  // Which garment this is. Supplied by order-level views, where photos from
  // several items appear in one list and "a photo of a stain" is useless
  // without knowing what it's a stain on. Claim views omit it — every photo
  // there is already scoped to the one item being claimed.
  item_label?:   string | null
}

export const MAX_CONDITION_PHOTOS_PER_ITEM  = 5
export const MAX_CONDITION_PHOTOS_PER_ORDER = 25
