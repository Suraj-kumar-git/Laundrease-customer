import { queryOne } from '@/lib/db'

export interface AboutPageLiveStats {
  package: number // Orders completed (all-time)
  smile: number // Happy customers
  store: number // Laundry partners
  'map-pin': number // Cities served
}

export async function getAboutPageLiveStats(): Promise<AboutPageLiveStats | null> {
  try {
    const row = await queryOne<{
      orders_completed: string
      happy_customers: string
      laundry_partners: string
      cities_served: string
    }>(`
      SELECT
        (SELECT COUNT(*) FROM orders WHERE status IN ('delivered', 'completed'))::TEXT
          AS orders_completed,
        (SELECT COUNT(*) FROM users u
         INNER JOIN roles r ON r.id = u.role_id
         WHERE r.name = 'customer' AND u.deleted_at IS NULL AND u.status = 'active')::TEXT
          AS happy_customers,
        (SELECT COUNT(*) FROM laundry_profiles
         WHERE status = 'active' AND is_verified = TRUE)::TEXT
          AS laundry_partners,
        (SELECT COUNT(DISTINCT LOWER(psa.city)) FROM provider_service_areas psa
         INNER JOIN laundry_profiles lp ON lp.id = psa.provider_id
         WHERE psa.is_active = TRUE AND lp.status = 'active' AND lp.is_verified = TRUE
           AND psa.city IS NOT NULL)::TEXT
          AS cities_served
    `)

    if (!row) return null

    return {
      package: parseInt(row.orders_completed, 10),
      smile: parseInt(row.happy_customers, 10),
      store: parseInt(row.laundry_partners, 10),
      'map-pin': parseInt(row.cities_served, 10),
    }
  } catch (error) {
    console.error('[about-stats] Failed to load live stats:', error)
    return null
  }
}
