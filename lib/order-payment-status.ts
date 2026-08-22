// lib/order-payment-status.ts
//
// Setting an order's payment status by hand, without leaving the ledger
// disagreeing with the summary.
//
// The problem this replaces
// ------------------------
// Both the admin and support routes did exactly one thing:
//
//   UPDATE orders SET payment_status = $1 WHERE id = $2
//
// `orders.payment_status` is a DENORMALISED SUMMARY. The record of what
// actually happened with money is the `payments` rows, and those were never
// touched. So an operator setting "failed" got a success message and a screen
// reading "Failed (online)" beside a Financials panel still reading
// "Online ₹263.76 · Completed" — the update looked ignored because only half
// of it happened, and every surface then answered differently depending on
// which of the two it read.
//
// Both are now written together, in one transaction.
//
// Scope: only the GATEWAY payment rows are synced. Wallet and COD rows are
// settled by their own flows — a wallet debit that genuinely happened is not
// undone because an operator marked the order failed, and COD is reconciled at
// the door by verify-otp, which already writes both sides.

import { transaction } from '@/lib/db'

export type OrderPaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded'

/**
 * Order-level summary -> the status its gateway payment rows should carry.
 *
 * 'pending' maps back to 'initiated' rather than 'pending' because that is the
 * value the pay route writes when it opens an attempt; using it keeps a
 * corrected order indistinguishable from one that simply has not been paid yet.
 */
const PAYMENT_ROW_STATUS: Record<OrderPaymentStatus, string> = {
  paid:      'completed',
  failed:    'failed',
  refunded:  'refunded',
  pending:   'initiated',
}

// ─── Guard: marking an order PAID by hand ────────────────────────────────────
//
// Flipping a gateway payment row to 'completed' is not cosmetic. The refund
// calculator (lib/payment/refund.ts) sums exactly those rows to decide what a
// cancellation pays back, so declaring an unpaid order paid creates refundable
// money that never arrived. The other three directions only ever shrink that
// sum, so they stay open to any operator with write access.
//
// Two conditions on the upward move, therefore:
//   1. admin only — a support lead can correct a settlement downward, but
//      cannot conjure one; and
//   2. a typed reason — the audit blob is worthless if every manual
//      correction records `reason: null`, which is what the UI sent before.
//
// (COD and wallet rows are out of scope either way; see the header note.)

/** Minimum length of the justification required to mark an order paid. */
export const PAID_REASON_MIN_LENGTH = 10

export type PaymentStatusGuardResult =
  | { ok: true }
  | { ok: false; httpStatus: 400 | 403; error: string }

/**
 * Whether this actor may make this particular payment-status change.
 *
 * Routes should call this before setOrderPaymentStatus so they can return a
 * proper 400/403. setOrderPaymentStatus re-checks and throws, so a caller that
 * forgets cannot write past the guard.
 */
export function checkManualPaymentStatusChange(params: {
  status:    OrderPaymentStatus
  actorRole: 'admin' | 'support'
  reason?:   string | null
}): PaymentStatusGuardResult {
  if (params.status !== 'paid') return { ok: true }

  if (params.actorRole !== 'admin') {
    return {
      ok: false,
      httpStatus: 403,
      error: 'Only an admin can mark an order as paid. Support can set pending, failed or refunded — ask an admin to record a payment as received.',
    }
  }

  const reason = (params.reason ?? '').trim()
  if (reason.length < PAID_REASON_MIN_LENGTH) {
    return {
      ok: false,
      httpStatus: 400,
      error: `A reason of at least ${PAID_REASON_MIN_LENGTH} characters is required when marking an order as paid (e.g. the gateway reference the payment was confirmed against).`,
    }
  }

  return { ok: true }
}

export class PaymentStatusGuardError extends Error {
  httpStatus: 400 | 403
  constructor(httpStatus: 400 | 403, message: string) {
    super(message)
    this.name = 'PaymentStatusGuardError'
    this.httpStatus = httpStatus
  }
}

export interface SetPaymentStatusResult {
  orderStatus:  OrderPaymentStatus
  rowsSynced:   number
}

/**
 * Set the order's payment status and bring its gateway payment rows with it.
 *
 * `actorId` is stamped into the payment row's gateway_response so a manually
 * corrected settlement is distinguishable from one a gateway callback wrote.
 * That matters: without it, a payment marked complete by hand looks exactly
 * like money that actually arrived.
 */
export async function setOrderPaymentStatus(params: {
  orderId:  number | string
  status:   OrderPaymentStatus
  actorId:  string | number
  actorRole: 'admin' | 'support'
  reason?:  string | null
}): Promise<SetPaymentStatusResult> {
  const { orderId, status, actorId, actorRole } = params

  const allowed = checkManualPaymentStatusChange({ status, actorRole, reason: params.reason })
  if (!allowed.ok) throw new PaymentStatusGuardError(allowed.httpStatus, allowed.error)

  const rowStatus = PAYMENT_ROW_STATUS[status]

  const rowsSynced = await transaction(async (client) => {
    await client.query(
      `UPDATE orders SET payment_status = $1, updated_at = NOW() WHERE id = $2`,
      [status, orderId]
    )

    const res = await client.query(
      `UPDATE payments
       SET status = $1,
           gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE order_id = $3
         AND provider NOT IN ('cod', 'wallet')
         AND payment_method <> 'wallet'
         AND status <> $1`,
      [
        rowStatus,
        JSON.stringify({
          manual_status_change: {
            to:         rowStatus,
            order_status: status,
            by_role:    actorRole,
            by_user_id: String(actorId),
            reason:     (params.reason ?? '').trim() || null,
            at:         new Date().toISOString(),
          },
        }),
        orderId,
      ]
    )
    return res.rowCount ?? 0
  })

  return { orderStatus: status, rowsSynced }
}
