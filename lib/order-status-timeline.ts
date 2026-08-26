// lib/order-status-timeline.ts
//
// One deduplicated view of order_status_history, shared by every persona that
// renders an order timeline.
//
// ---- Why rows are duplicated in the first place ----------------------------
// Two independent writers log the same event:
//
//   1. The trigger `trg_orders_status_history` (AFTER INSERT OR UPDATE OF
//      status ON orders) fires on EVERY status change and inserts a bare row —
//      notes NULL, actor taken from `app.current_user_id`, which most routes
//      never set.
//
//   2. Ten route/lib sites ALSO insert their own row, with a real note and a
//      real actor: 'Delivered to customer — OTP verified', 'Delivery partner
//      heading to customer for pickup', and so on.
//
// So any status change made through one of those ten paths produces two rows
// with the same status and effectively the same timestamp — which is what the
// customer sees as "Delivered" twice, once bare and once annotated. Statuses
// changed only by the trigger appear once, which is why some entries in the
// timeline double up and others don't.
//
// ---- Why this is fixed on the read side ------------------------------------
// Removing the trigger would be the tidy fix, but ~104 statements across 20
// files update orders.status and only ten of them log explicitly — dropping
// the trigger would silently erase the other ninety-odd events from every
// timeline. Removing the ten explicit inserts instead would throw away the
// notes and the actor, which are the useful half. Neither is worth the risk
// for what is, in the end, a display defect, so the duplicate is collapsed
// when read. The rows both stay; the timeline shows the better one.
//
// ---- How a duplicate is recognised ----------------------------------------
// Same order, same status, within seconds of each other. A status genuinely
// re-entered later (assigned_for_pickup after a failed attempt, say) is
// minutes or hours away, so it forms its own group and is still shown.
//
// Grouping uses an "island" number — how many earlier rows of the same status
// sit more than the window before this one — rather than bucketing on
// date_trunc, which would split a pair that happens to straddle a boundary.
//
// Of each group the richest row wins: one with notes beats one without, then
// one with a known actor, then the earliest id.

/**
 * How far apart two rows for the same status can be and still count as one
 * event. Duplicates are written in the same transaction (identical
 * created_at, since now() is transaction time) or milliseconds apart, so this
 * is almost all margin.
 */
const DUPLICATE_WINDOW = '10 seconds'

/**
 * A drop-in replacement for `order_status_history` in a FROM clause, with
 * duplicate rows collapsed.
 *
 * Pass the same predicate you would have put in the WHERE clause, written
 * against the alias `osh`. Alias the result `osh` at the call site and every
 * existing column reference and JOIN keeps working:
 *
 *   FROM ${dedupedStatusHistory('osh.order_id = $1')} osh
 *   LEFT JOIN users u ON u.id = osh.updated_by
 *   WHERE ...
 *
 * The predicate is interpolated, so it must be a literal written by us — never
 * anything derived from a request. Bind values stay as $n placeholders.
 */
export function dedupedStatusHistory(orderPredicate: string): string {
  return `(
    SELECT DISTINCT ON (h.order_id, h.status, h.island)
           h.id, h.order_id, h.status, h.updated_by, h.notes, h.location, h.created_at
    FROM (
      SELECT osh.id, osh.order_id, osh.status, osh.updated_by, osh.notes,
             osh.location, osh.created_at,
             (SELECT COUNT(*)
                FROM order_status_history e
               WHERE e.order_id = osh.order_id
                 AND e.status   = osh.status
                 AND e.created_at < osh.created_at - INTERVAL '${DUPLICATE_WINDOW}'
             ) AS island
      FROM order_status_history osh
      WHERE ${orderPredicate}
    ) h
    ORDER BY h.order_id, h.status, h.island,
             (h.notes IS NOT NULL AND btrim(h.notes) <> '') DESC,
             (h.updated_by IS NOT NULL) DESC,
             h.id
  )`
}
