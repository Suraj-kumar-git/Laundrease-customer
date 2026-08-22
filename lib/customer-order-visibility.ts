// lib/customer-order-visibility.ts
//
// Which of a customer's orders they are allowed to see.
//
// An order row is created up front at checkout so the payment gateway has an
// id to attach to. If that payment never clears, the row is a dead draft, not
// an order — showing it would tell a customer they had placed something they
// had not. So unpaid online drafts are hidden.
//
// The bug this exists to prevent
// -----------------------------
// The rule used to be, in three separately-maintained copies:
//
//   payment_method LIKE '%cod%' OR payment_status = 'paid' OR status IN (...)
//
// which reads payment_status as a proxy for "was this ever really placed".
// It is not. Support can set payment_status back to 'pending' on a genuine,
// already-paid order — to flag that something needs re-collecting, say — and
// the order would vanish from the customer's list and dashboard while
// remaining perfectly visible to support. The customer is told their order
// no longer exists.
//
// The honest test is whether money ever actually arrived, which lives in
// `payments`, not in a mutable status column an operator can edit. A dead
// draft has no completed payment and never will; a real order has one
// regardless of what the order-level status was later changed to.

/**
 * SQL predicate for "this order is visible to its customer".
 *
 * @param alias table alias for `orders` in the surrounding query.
 */
export function customerVisibleOrderSql(alias = 'o'): string {
  return `(
    ${alias}.payment_method LIKE '%cod%'
    OR ${alias}.payment_status = 'paid'
    -- Always visible once they reach a terminal state: cancelling or rejecting
    -- a paid order flips payment_status to 'refunded', which matches none of
    -- the clauses above.
    OR ${alias}.status IN ('failed', 'cancelled', 'rejected')
    -- Money genuinely arrived at some point, whatever the order-level
    -- payment_status says now. This is the clause that keeps an order visible
    -- after support edits its payment status.
    OR EXISTS (
      SELECT 1 FROM payments p
      WHERE p.order_id = ${alias}.id AND p.status = 'completed'
    )
  )`
}
