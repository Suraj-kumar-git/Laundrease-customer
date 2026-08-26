// app/customer/compare/types.ts
// Shapes shared between the comparison page and its components.

import type { ServiceWithProducts } from '@/types/pricing'

/** Subset of GET /api/customer/laundry-providers/search that this page uses. */
export interface CompareProvider {
  id: number
  business_name: string
  /**
   * Which branch of that business. Two branches are two comparable providers
   * with their own prices, distance and rating, so this is what keeps the
   * side-by-side readable when both belong to the same brand.
   */
  branch_name: string | null
  business_address: string | null
  city: string | null
  postal_code: string | null
  service_area: string | null
  rating: number
  rating_count: number
  is_verified: boolean
  min_price_kg: number | null
  distance_km: number | null
}

/** A filled comparison slot: the provider plus their resolved catalogue. */
export interface CompareSlot {
  provider: CompareProvider
  services: ServiceWithProducts[]
}

export type SlotId = 'a' | 'b'

/**
 * One comparison line — a (service, product) pair, with whichever of the two
 * providers actually offers it. `null` means "this provider doesn't offer it",
 * which is itself a meaningful comparison result and is rendered as a dash
 * rather than hidden.
 */
export interface CompareRow {
  key: string
  serviceId: number
  serviceName: string
  productId: number
  productName: string
  icon: string
  priceA: number | null
  priceB: number | null
}

/** Rows bucketed under their service, preserving the catalogue's own order. */
export interface CompareGroup {
  serviceId: number
  serviceName: string
  rows: CompareRow[]
}

/**
 * Builds the union of both catalogues, so a row exists whenever EITHER
 * provider offers that item. Intersecting instead would quietly hide the most
 * decision-relevant case: the item only one of them will clean at all.
 */
export function buildCompareGroups(
  a: ServiceWithProducts[] | null,
  b: ServiceWithProducts[] | null,
): CompareGroup[] {
  const groups = new Map<number, CompareGroup>()
  const rowIndex = new Map<string, CompareRow>()

  const ingest = (list: ServiceWithProducts[] | null, side: 'A' | 'B') => {
    for (const { service, product_types } of list ?? []) {
      let group = groups.get(service.id)
      if (!group) {
        group = { serviceId: service.id, serviceName: service.name, rows: [] }
        groups.set(service.id, group)
      }
      for (const pt of product_types) {
        const key = `${service.id}::${pt.id}`
        let row = rowIndex.get(key)
        if (!row) {
          row = {
            key,
            serviceId: service.id,
            serviceName: service.name,
            productId: pt.id,
            productName: pt.name,
            icon: pt.icon,
            priceA: null,
            priceB: null,
          }
          rowIndex.set(key, row)
          group.rows.push(row)
        }
        if (side === 'A') row.priceA = pt.unit_price
        else row.priceB = pt.unit_price
      }
    }
  }

  ingest(a, 'A')
  ingest(b, 'B')

  return Array.from(groups.values()).filter(g => g.rows.length > 0)
}

/** Headline counts for the summary strip. Only rows both sides price count. */
export function summarise(groups: CompareGroup[]) {
  let aCheaper = 0
  let bCheaper = 0
  let tied = 0
  let comparable = 0
  let aOnly = 0
  let bOnly = 0
  let totalDiff = 0

  for (const g of groups) {
    for (const r of g.rows) {
      if (r.priceA != null && r.priceB != null) {
        comparable++
        if (r.priceA < r.priceB) { aCheaper++; totalDiff += r.priceB - r.priceA }
        else if (r.priceB < r.priceA) { bCheaper++; totalDiff += r.priceA - r.priceB }
        else tied++
      } else if (r.priceA != null) aOnly++
      else if (r.priceB != null) bOnly++
    }
  }

  return { aCheaper, bCheaper, tied, comparable, aOnly, bOnly, totalDiff }
}
