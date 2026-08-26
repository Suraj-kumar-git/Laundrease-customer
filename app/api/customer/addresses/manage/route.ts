import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

interface AddressBody {
  id?:            string     // public_id — required for PUT/DELETE
  label:          string
  tags?:          string[]
  address_line1:  string
  address_line2?: string
  landmark?:      string
  neighborhood?:  string
  city:           string
  state?:         string
  postal_code?:   string
  country_code:   string
  // Required — the customer address form now only ever produces an address
  // via a confirmed map pin (see components/common/AddressMapPicker), so
  // there's no text-only path left to geocode server-side as a fallback.
  latitude:       number
  longitude:      number
  instructions?:  string
  contact_name?:  string
  contact_phone?: string
  is_default?:    boolean
}

/**
 * Maximum saved addresses per customer.
 *
 * Mirrors customer_addresses_position_check in the database
 * (CHECK (position BETWEEN 1 AND 10)). The DB constraint is the real limit —
 * this constant only keeps the count check and the slot search agreeing with
 * it, which is exactly what drifted apart before.
 */
const MAX_ADDRESSES_PER_CUSTOMER = 10

async function getCustomerProfileId(userId: string): Promise<number | null> {
  const res = await query(
    `SELECT id FROM customer_profiles WHERE user_id = $1`, [userId]
  )
  return res.rowCount! > 0 ? res.rows[0].id : null
}

function isValidCoords(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

// POST — create
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: AddressBody
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.label?.trim())         return errorResponse('Label is required', 400)
  if (!body.address_line1?.trim()) return errorResponse('Address line 1 is required', 400)
  if (!body.city?.trim())          return errorResponse('City is required', 400)
  if (!body.country_code?.trim())  return errorResponse('Country code is required', 400)
  if (!isValidCoords(body.latitude, body.longitude))
    return errorResponse('Please pick a location on the map', 400)

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const { latitude, longitude } = body

    const result = await transaction(async (client) => {
      // Serialise concurrent adds for this customer. Two saves racing — a
      // double-tapped Save button is enough — would otherwise both pick the
      // same free slot, and the second would hit the unique index on
      // (customer_profile_id, position).
      await client.query(
        `SELECT 1 FROM customer_profiles WHERE id = $1 FOR UPDATE`, [profileId]
      )

      // Check address count
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM customer_addresses
         WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
        [profileId]
      )
      if (countRes.rows[0].n >= MAX_ADDRESSES_PER_CUSTOMER) throw new Error('MAX_ADDRESSES')

      // Lowest FREE slot — deliberately not MAX(position) + 1.
      //
      // Deletes here are soft (deleted_at is stamped, the row stays) and
      // nothing renumbers afterwards, so a position is consumed permanently
      // by a row that no longer counts toward the limit. An account that has
      // added and deleted its way up to position 10 therefore has a live
      // count under the cap while MAX(position) is still 10 — and MAX + 1 = 11
      // violates customer_addresses_position_check, which allows only 1..10.
      //
      // That is why this failed on long-lived accounts and never on fresh
      // ones, and why it looked intermittent: deleting whichever address held
      // the highest slot lowered MAX again, so the next save succeeded and the
      // one after it failed.
      //
      // Reusing a freed slot is safe because the unique index is partial
      // (WHERE deleted_at IS NULL) — a slot held only by a deleted row is
      // genuinely available.
      const posRes = await client.query(
        `SELECT MIN(s.p)::int AS next_pos
         FROM generate_series(1, $2) AS s(p)
         WHERE NOT EXISTS (
           SELECT 1 FROM customer_addresses ca
           WHERE ca.customer_profile_id = $1
             AND ca.deleted_at IS NULL
             AND ca.position = s.p
         )`,
        [profileId, MAX_ADDRESSES_PER_CUSTOMER]
      )
      const position: number | null = posRes.rows[0]?.next_pos ?? null
      // Belt and braces with the count check above: if every slot is occupied
      // the count was already at the cap. Never insert a NULL position.
      if (!position) throw new Error('MAX_ADDRESSES')

      // If set as default, clear existing default first
      if (body.is_default) {
        await client.query(
          `UPDATE customer_addresses SET is_default = FALSE
           WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
          [profileId]
        )
      }

      const isDefault = body.is_default ??
        // Auto-set as default if it's the first address
        (countRes.rows[0].n === 0)

      const ins = await client.query(
        `INSERT INTO customer_addresses (
           customer_profile_id, label, tags, address_line1, address_line2,
           landmark, neighborhood, city, state, postal_code, country_code,
           instructions, contact_name, contact_phone, is_default, position,
           latitude, longitude
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [
          profileId, body.label, body.tags ?? [], body.address_line1, body.address_line2 ?? null,
          body.landmark ?? null, body.neighborhood ?? null, body.city,
          body.state ?? null, body.postal_code ?? null, body.country_code,
          body.instructions ?? null, body.contact_name ?? null,
          body.contact_phone ?? null, isDefault, position,
          latitude, longitude,
        ]
      )

      return ins.rows[0]
    })

    return successResponse(result, 201)
  } catch (error: any) {
    if (error.message === 'MAX_ADDRESSES')
      return errorResponse(`You can save a maximum of ${MAX_ADDRESSES_PER_CUSTOMER} addresses`, 400)
    console.error('[POST /api/customer/addresses/manage]', error)
    return serverErrorResponse('Failed to create address')
  }
}

// PUT — update
export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  let body: AddressBody
  try { body = await req.json() } catch { return errorResponse('Invalid body', 400) }

  if (!body.id)                    return errorResponse('id is required', 400)
  if (!body.label?.trim())         return errorResponse('Label is required', 400)
  if (!body.address_line1?.trim()) return errorResponse('Address line 1 is required', 400)
  if (!body.city?.trim())          return errorResponse('City is required', 400)
  if (!isValidCoords(body.latitude, body.longitude))
    return errorResponse('Please pick a location on the map', 400)

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const { latitude, longitude } = body

    const result = await transaction(async (client) => {
      // Verify address belongs to this customer
      const check = await client.query(
        `SELECT id FROM customer_addresses
         WHERE public_id = $1 AND customer_profile_id = $2 AND deleted_at IS NULL`,
        [body.id, profileId]
      )
      if (check.rowCount === 0) throw new Error('NOT_FOUND')
      const addressId = check.rows[0].id

      if (body.is_default) {
        await client.query(
          `UPDATE customer_addresses SET is_default = FALSE
           WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
          [profileId]
        )
      }

      const upd = await client.query(
        `UPDATE customer_addresses SET
           label         = $1, tags          = $2, address_line1 = $3, address_line2  = $4,
           landmark      = $5, neighborhood  = $6, city           = $7,
           state         = $8, postal_code   = $9, country_code   = $10,
           instructions  = $11, contact_name = $12, contact_phone = $13,
           is_default    = $14, latitude      = $15, longitude    = $16, updated_at = NOW()
         WHERE id = $17
         RETURNING *`,
        [
          body.label, body.tags ?? [], body.address_line1, body.address_line2 ?? null,
          body.landmark ?? null, body.neighborhood ?? null, body.city,
          body.state ?? null, body.postal_code ?? null, body.country_code ?? 'IN',
          body.instructions ?? null, body.contact_name ?? null,
          body.contact_phone ?? null, body.is_default ?? false,
          latitude, longitude,
          addressId,
        ]
      )

      return upd.rows[0]
    })

    return successResponse(result)
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') return notFoundResponse('Address not found')
    console.error('[PUT /api/customer/addresses/manage]', error)
    return serverErrorResponse('Failed to update address')
  }
}

// DELETE — soft delete
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return unauthorizedResponse()

  const { searchParams } = req.nextUrl
  const publicId = searchParams.get('id')
  if (!publicId) return errorResponse('id query param required', 400)

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const result = await transaction(async (client) => {
      const check = await client.query(
        `SELECT id, is_default FROM customer_addresses
         WHERE public_id = $1 AND customer_profile_id = $2 AND deleted_at IS NULL`,
        [publicId, profileId]
      )
      if (check.rowCount === 0) throw new Error('NOT_FOUND')
      const addressId = check.rows[0].id

      await client.query(
        `UPDATE customer_addresses SET deleted_at = NOW() WHERE id = $1`, [addressId]
      )

      // If deleted address was default, promote the next one
      if (check.rows[0].is_default) {
        await client.query(
          `UPDATE customer_addresses SET is_default = TRUE
           WHERE customer_profile_id = $1 AND deleted_at IS NULL
           ORDER BY position LIMIT 1`,
          [profileId]
        )
      }

      return { deleted: true }
    })

    return successResponse(result)
  } catch (error: any) {
    if (error.message === 'NOT_FOUND') return notFoundResponse('Address not found')
    console.error('[DELETE /api/customer/addresses/manage]', error)
    return serverErrorResponse('Failed to delete address')
  }
}
