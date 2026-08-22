// lib/payment/settle.ts
//
// Applying a gateway's authoritative settlement signal to our own records.
//
// Why this is separate from the browser-return routes
// ---------------------------------------------------
// The return routes (payu/success, cashfree/return) settle from the redirect
// the CUSTOMER'S BROWSER carries back. That works until the browser never
// arrives — the payer closes the tab on the bank page, loses signal on mobile
// mid-3DS, or the app is backgrounded through the redirect. The money moved;
// nothing told us. The webhook is the server-to-server channel that reports it
// anyway, so this is the path that has to be right when the happy path isn't.
//
// Two properties a browser callback never needs and this cannot do without:
//
// 1. IDEMPOTENT. Gateways retry until they get a 2xx, and send several events
//    for one payment. Applying the same settlement twice must change nothing.
//
// 2. MONOTONIC. Webhook delivery is not ordered. A `failed` event for an
//    abandoned first attempt can land after the `success` for the retry that
//    worked, and applying it in arrival order would mark a paid order failed
//    and strand a customer who has already been debited. Settlement therefore
//    only ever moves forward: nothing overwrites 'completed', and nothing at
//    all touches a payment that has since been 'refunded'.
//
// Amount reconciliation runs here too, on the same rule as everywhere else —
// the signature proves the message is authentic, never that the sum is right.

import { transaction } from '@/lib/db'
import { reconcileAmount, logReconcileFailure } from './reconcile'
import type { WebhookOutcome } from './webhook-parse'

export interface SettleParams {
  provider:          string
  merchantTxnId:     string
  providerPaymentId: string | null
  outcome:           WebhookOutcome
  /** Rupees, when the verified body vouched for a figure. */
  reportedAmount?:   number
  /** The raw callback, stored verbatim for audit. */
  rawPayload:        string
  eventType:         string
}

export type SettleStatus =
  | 'applied'          // we changed something
  | 'already_settled'  // idempotent no-op
  | 'ignored_stale'    // arrived after a stronger state; deliberately dropped
  | 'not_found'        // no payment row for this id — caller should retry
  | 'pending'          // gateway is not done yet; nothing to apply

export interface SettleResult {
  status:        SettleStatus
  paymentStatus: string | null
  orderPublicId: string | null
  detail:        string
}

type Client = { query: (text: string, values?: unknown[]) => Promise<any> }

export async function settleFromWebhook(params: SettleParams): Promise<SettleResult> {
  const {
    provider, merchantTxnId, providerPaymentId, outcome, reportedAmount, rawPayload, eventType,
  } = params

  return transaction(async (client) => {
    // FOR UPDATE: the browser-return route may be settling this very payment
    // from the customer's redirect at the same moment. Without the lock both
    // read 'initiated', both decide to write, and the second overwrites the
    // first's audit trail.
    const found = await client.query(
      `SELECT p.id, p.order_id, p.status, p.amount, p.currency, p.gateway_config_id,
              o.public_id AS order_public_id
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.merchant_txn_id = $1
       FOR UPDATE OF p
       LIMIT 1`,
      [merchantTxnId]
    )

    if (found.rowCount === 0) {
      return {
        status: 'not_found' as const, paymentStatus: null, orderPublicId: null,
        detail: `No payment row for merchant_txn_id ${merchantTxnId}`,
      }
    }

    const payment       = found.rows[0]
    const orderPublicId = payment.order_public_id ?? null

    // A payment already refunded needs no write — a late success callback must
    // not un-refund it. Record the callback and stop.
    if (payment.status === 'refunded') {
      await recordEvent(client, payment, provider, merchantTxnId, providerPaymentId, rawPayload, eventType, 'ignored_refunded')
      return {
        status: 'ignored_stale' as const, paymentStatus: payment.status, orderPublicId,
        detail: 'Payment already refunded — settlement callback ignored',
      }
    }

    if (outcome === 'pending') {
      await recordEvent(client, payment, provider, merchantTxnId, providerPaymentId, rawPayload, eventType, 'pending')
      return {
        status: 'pending' as const, paymentStatus: payment.status, orderPublicId,
        detail: 'Gateway reports the payment is still in progress',
      }
    }

    if (payment.status === 'completed') {
      await recordEvent(client, payment, provider, merchantTxnId, providerPaymentId, rawPayload, eventType,
        outcome === 'success' ? 'duplicate_success' : 'late_failure_ignored')
      return {
        status: outcome === 'success' ? 'already_settled' as const : 'ignored_stale' as const,
        paymentStatus: payment.status, orderPublicId,
        detail: outcome === 'success'
          ? 'Payment was already completed — nothing to do'
          : 'A failure callback arrived after this payment completed; ignored so a paid order is not marked failed',
      }
    }

    // ---- The payment is not yet settled; this callback decides it ----------

    let success = outcome === 'success'
    let note    = eventType

    if (success && reportedAmount !== undefined) {
      const reconciled = reconcileAmount(payment.amount, reportedAmount)
      if (!reconciled.ok) {
        logReconcileFailure(`webhook/${provider}`, merchantTxnId, reconciled)
        success = false
        note    = `${eventType}:amount_mismatch`
      }
    }

    const paymentStatus = success ? 'completed' : 'failed'

    await client.query(
      `UPDATE payments
       SET status = $1,
           provider_txn_id = COALESCE($2, provider_txn_id),
           gateway_response = COALESCE(gateway_response, '{}'::jsonb) || $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [
        paymentStatus,
        providerPaymentId,
        JSON.stringify({ webhook: { event: note, provider, at: new Date().toISOString() } }),
        payment.id,
      ]
    )

    await recordEvent(client, payment, provider, merchantTxnId, providerPaymentId, rawPayload, note, paymentStatus)

    if (payment.order_id) {
      // On failure the order status is left alone rather than forced to
      // 'failed': by the time a webhook lands the order may legitimately have
      // moved on (a customer who retried and paid by another method, or COD).
      // Only payment_status is this callback's to decide.
      await client.query(
        `UPDATE orders
         SET payment_status = $1,
             status = CASE
               WHEN $3 THEN CASE WHEN status = 'failed' THEN 'pending' ELSE status END
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = $2`,
        [success ? 'paid' : 'failed', payment.order_id, success]
      )

      // Matches the return routes: the cart is deliberately kept until payment
      // is confirmed, so a customer whose payment failed still has their
      // basket to retry from.
      if (success) {
        await client.query(
          `DELETE FROM shopping_carts WHERE user_id = (
             SELECT customer_id FROM orders WHERE id = $1
           )`,
          [payment.order_id]
        )
      }
    }

    return {
      status: 'applied' as const, paymentStatus, orderPublicId,
      detail: success
        ? 'Payment settled from gateway webhook'
        : `Payment marked failed from gateway webhook (${note})`,
    }
  })
}

/**
 * Write the callback into payment_gateway_transactions.
 *
 * Every callback lands here, including the ones deliberately ignored — an
 * ignored event is exactly the thing you need to see when reconstructing a
 * disputed payment later.
 */
async function recordEvent(
  client:   Client,
  payment:  { id: number; amount: string; currency: string | null; gateway_config_id: number | null },
  provider: string,
  merchantTxnId: string,
  providerPaymentId: string | null,
  rawPayload: string,
  eventType: string,
  status: string,
): Promise<void> {
  const isCompleted = status === 'completed'
  const isFailed    = status === 'failed'

  await client.query(
    `INSERT INTO payment_gateway_transactions (
       payment_id, gateway_config_id, provider, merchant_txn_id,
       provider_order_id, provider_payment_id, provider_txn_id,
       amount, currency, status, response_payload, completed_at, failed_at
     )
     VALUES ($1, $2, $3, $4, $4, $5, $5, $6, $7, $8, $9::jsonb, $10, $11)
     ON CONFLICT (merchant_txn_id) DO UPDATE SET
       provider_payment_id = COALESCE(EXCLUDED.provider_payment_id, payment_gateway_transactions.provider_payment_id),
       provider_txn_id     = COALESCE(EXCLUDED.provider_txn_id, payment_gateway_transactions.provider_txn_id),
       status = CASE
         WHEN payment_gateway_transactions.status = 'completed' THEN payment_gateway_transactions.status
         ELSE EXCLUDED.status END,
       response_payload = COALESCE(payment_gateway_transactions.response_payload, '{}'::jsonb) || EXCLUDED.response_payload,
       completed_at = CASE
         WHEN EXCLUDED.status = 'completed' AND payment_gateway_transactions.completed_at IS NULL
         THEN EXCLUDED.completed_at ELSE payment_gateway_transactions.completed_at END,
       failed_at = CASE
         WHEN EXCLUDED.status = 'failed' AND payment_gateway_transactions.failed_at IS NULL
         THEN EXCLUDED.failed_at ELSE payment_gateway_transactions.failed_at END,
       updated_at = NOW()`,
    [
      payment.id,
      payment.gateway_config_id,
      provider,
      merchantTxnId,
      providerPaymentId,
      payment.amount,
      payment.currency || 'INR',
      status,
      JSON.stringify({
        webhook_events: [{ event: eventType, at: new Date().toISOString(), payload: safeParse(rawPayload) }],
      }),
      isCompleted ? new Date() : null,
      isFailed    ? new Date() : null,
    ]
  )
}

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return raw.slice(0, 4000) }
}
