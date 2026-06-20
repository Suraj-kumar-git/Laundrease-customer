import { NextRequest } from 'next/server'
import { query, transaction } from '@/lib/db'
import {
  successResponse, errorResponse, notFoundResponse,
  serverErrorResponse, unauthorizedResponse,
} from '@/lib/api-response'

interface AddressBody {
  id?:            number     // required for PUT/DELETE
  label:          string
  address_line1:  string
  address_line2?: string
  landmark?:      string
  neighborhood?:  string
  city:           string
  state?:         string
  postal_code?:   string
  country_code:   string
  instructions?:  string
  contact_name?:  string
  contact_phone?: string
  is_default?:    boolean
}

async function getCustomerProfileId(userId: string): Promise<number | null> {
  const res = await query(
    `SELECT id FROM customer_profiles WHERE user_id = $1`, [userId]
  )
  return res.rowCount! > 0 ? res.rows[0].id : null
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

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const result = await transaction(async (client) => {
      // Check address count (max 10)
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS n FROM customer_addresses
         WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
        [profileId]
      )
      if (countRes.rows[0].n >= 10) throw new Error('MAX_ADDRESSES')

      // Next available position
      const posRes = await client.query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
         FROM customer_addresses
         WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
        [profileId]
      )
      const position = posRes.rows[0].next_pos

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
           customer_profile_id, label, address_line1, address_line2,
           landmark, neighborhood, city, state, postal_code, country_code,
           instructions, contact_name, contact_phone, is_default, position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [
          profileId, body.label, body.address_line1, body.address_line2 ?? null,
          body.landmark ?? null, body.neighborhood ?? null, body.city,
          body.state ?? null, body.postal_code ?? null, body.country_code,
          body.instructions ?? null, body.contact_name ?? null,
          body.contact_phone ?? null, isDefault, position,
        ]
      )

      return ins.rows[0]
    })

    return successResponse(result, 201)
  } catch (error: any) {
    if (error.message === 'MAX_ADDRESSES')
      return errorResponse('You can save a maximum of 10 addresses', 400)
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

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const result = await transaction(async (client) => {
      // Verify address belongs to this customer
      const check = await client.query(
        `SELECT id FROM customer_addresses
         WHERE id = $1 AND customer_profile_id = $2 AND deleted_at IS NULL`,
        [body.id, profileId]
      )
      if (check.rowCount === 0) throw new Error('NOT_FOUND')

      if (body.is_default) {
        await client.query(
          `UPDATE customer_addresses SET is_default = FALSE
           WHERE customer_profile_id = $1 AND deleted_at IS NULL`,
          [profileId]
        )
      }

      const upd = await client.query(
        `UPDATE customer_addresses SET
           label         = $1, address_line1 = $2, address_line2  = $3,
           landmark      = $4, neighborhood  = $5, city           = $6,
           state         = $7, postal_code   = $8, country_code   = $9,
           instructions  = $10, contact_name = $11, contact_phone = $12,
           is_default    = $13, updated_at   = NOW()
         WHERE id = $14
         RETURNING *`,
        [
          body.label, body.address_line1, body.address_line2 ?? null,
          body.landmark ?? null, body.neighborhood ?? null, body.city,
          body.state ?? null, body.postal_code ?? null, body.country_code ?? 'IN',
          body.instructions ?? null, body.contact_name ?? null,
          body.contact_phone ?? null, body.is_default ?? false,
          body.id,
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
  const addressId = parseInt(searchParams.get('id') ?? '', 10)
  if (isNaN(addressId)) return errorResponse('id query param required', 400)

  try {
    const profileId = await getCustomerProfileId(userId)
    if (!profileId) return errorResponse('Customer profile not found', 404)

    const result = await transaction(async (client) => {
      const check = await client.query(
        `SELECT is_default FROM customer_addresses
         WHERE id = $1 AND customer_profile_id = $2 AND deleted_at IS NULL`,
        [addressId, profileId]
      )
      if (check.rowCount === 0) throw new Error('NOT_FOUND')

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
