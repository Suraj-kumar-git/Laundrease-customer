// lib/service-areas.ts
// Admin visibility for provider coverage growth: whenever a laundry provider
// registers with — or later adds — a pincode that NO OTHER provider serves
// yet, ping the admin bell. Called (best-effort) from every path that writes
// provider_service_areas: laundry registration, laundry profile updates, and
// the admin provider-areas editor.

import { query, queryOne } from '@/lib/db'

export async function notifyAdminIfNewServiceArea(params: {
  providerId: number | string
  postalCode: string
  city?:      string | null
}): Promise<void> {
  try {
    // "New" = nobody else (any status — a pending provider announcing an
    // area is still coverage news) had this pincode before this write.
    const existing = await queryOne(
      `SELECT 1 FROM provider_service_areas
       WHERE postal_code = $1 AND provider_id <> $2::BIGINT
       LIMIT 1`,
      [params.postalCode, params.providerId]
    )
    if (existing) return

    const provider = await queryOne<{ business_name: string }>(
      `SELECT business_name FROM laundry_profiles WHERE id = $1::BIGINT`,
      [params.providerId]
    )

    await query(
      `INSERT INTO admin_notifications (type, title, body, entity_id)
       VALUES ('new_service_area', 'New service area added',
               $1 || ' now serves ' || $2 ||
               ' — the first provider in this area. Review fleet coverage for it.',
               $3)`,
      [
        provider?.business_name || 'A laundry provider',
        params.city ? `${params.postalCode} (${params.city})` : params.postalCode,
        params.postalCode,
      ]
    )
  } catch (e) {
    console.error('[service-areas] new-area notification failed:', e)
  }
}
