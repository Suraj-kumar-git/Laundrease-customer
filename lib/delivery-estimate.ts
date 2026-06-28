// lib/delivery-estimate.ts
// Computes an estimated delivery DATE (not a time slot) for an order, based on:
//   - the slowest service among the order's items (turnaround_hours)
//   - the provider's per-service turnaround override, if set
//   - express turnaround, if the item was ordered as express
//   - the provider's weekly closed days + one-off holiday dates
//
// Deliberately date-only — the actual delivery time slot is only firmed up
// once a delivery partner is assigned and dispatched.

import { addDays, format } from 'date-fns'

type QueryFn = (text: string, params?: any[]) => Promise<{ rows: any[] }>

export interface DeliveryEstimateItem {
  serviceId: number
  isExpress: boolean
}

export interface DeliveryEstimateParams {
  providerId:  number
  pickupDate:  string   // 'YYYY-MM-DD'
  items:       DeliveryEstimateItem[]
}

const DEFAULT_TURNAROUND_HOURS = 24
const CLOSED_DAY_SEARCH_WINDOW = 7 // max days to look ahead for an open day

function parseLocalDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

/**
 * Returns the estimated delivery date as 'YYYY-MM-DD'.
 * `queryFn` is anything with a (text, params) => Promise<{rows}> signature —
 * pass the transaction client's `.query` when called inside a transaction,
 * or the standalone `query` from lib/db otherwise.
 */
export async function calculateEstimatedDeliveryDate(
  queryFn: QueryFn,
  { providerId, pickupDate, items }: DeliveryEstimateParams
): Promise<string> {
  if (items.length === 0) return pickupDate

  const serviceIds = [...new Set(items.map(i => i.serviceId))]

  const { rows: svcRows } = await queryFn(
    `SELECT s.id,
            s.turnaround_hours,
            s.express_turnaround_hours,
            ps.turnaround_hours_override,
            ps.express_turnaround_hours_override
     FROM services s
     LEFT JOIN provider_services ps
       ON ps.service_id = s.id AND ps.provider_id = $1
     WHERE s.id = ANY($2::int[])`,
    [providerId, serviceIds]
  )
  const byService = new Map<number, any>(svcRows.map(r => [r.id, r]))

  let maxHours = 0
  for (const item of items) {
    const svc = byService.get(item.serviceId)
    if (!svc) continue

    const standardHours = svc.turnaround_hours_override ?? svc.turnaround_hours ?? DEFAULT_TURNAROUND_HOURS
    const expressHours  = svc.express_turnaround_hours_override
      ?? svc.express_turnaround_hours
      ?? Math.ceil(standardHours / 2)

    const hours = item.isExpress ? expressHours : standardHours
    maxHours = Math.max(maxHours, hours)
  }
  if (maxHours === 0) maxHours = DEFAULT_TURNAROUND_HOURS

  const days = Math.max(1, Math.ceil(maxHours / 24))
  let estimate = addDays(parseLocalDate(pickupDate), days)

  // Push the date forward past the provider's closed weekdays / holidays.
  const windowEnd = format(addDays(estimate, CLOSED_DAY_SEARCH_WINDOW), 'yyyy-MM-dd')

  const [{ rows: closedDowRows }, { rows: closedDateRows }] = await Promise.all([
    queryFn(
      `SELECT day_of_week FROM provider_operating_hours
       WHERE provider_id = $1 AND is_closed = TRUE`,
      [providerId]
    ),
    queryFn(
      `SELECT TO_CHAR(closed_date, 'YYYY-MM-DD') AS closed_date
       FROM provider_closed_dates
       WHERE provider_id = $1 AND closed_date BETWEEN $2 AND $3`,
      [providerId, format(estimate, 'yyyy-MM-dd'), windowEnd]
    ),
  ])
  const closedWeekdays = new Set<number>(closedDowRows.map(r => r.day_of_week))
  const closedDates    = new Set<string>(closedDateRows.map(r => r.closed_date))

  for (let i = 0; i < CLOSED_DAY_SEARCH_WINDOW; i++) {
    const dateStr = format(estimate, 'yyyy-MM-dd')
    const isClosed = closedWeekdays.has(estimate.getDay()) || closedDates.has(dateStr)
    if (!isClosed) break
    estimate = addDays(estimate, 1)
  }

  return format(estimate, 'yyyy-MM-dd')
}
