// lib/telephony/session.ts
//
// Who may call whom, on which order, right now — and the record of what
// happened when they did.
//
// PERMISSION IS COMPUTED, NOT STORED. There is no "session is open" flag to
// keep in sync; every call request re-derives the answer from the order and
// leg state at that moment. A stored flag would need something to close it,
// and anything that can fail to run would leave a line open after handover —
// exactly the case masking exists to prevent. order_call_sessions is a log of
// calls that were placed, not a grant that has to be revoked.

import { query, queryOne } from '@/lib/db'
import type { CallPairType, CallRole, CallStatusEvent } from './types'

// ── When each line is open ──────────────────────────────────────────────────

// Customer ↔ delivery partner, per leg. Each closes at its own handover: the
// pickup line dies when the parcel is collected, the delivery line when it is
// delivered. Keyed on order status rather than leg status so a leg row that
// fails to be marked completed can't leave a line open.
const LEG_OPEN_STATUSES: Record<string, readonly string[]> = {
  pickup:   ['assigned_for_pickup', 'out_for_pickup'],
  delivery: ['ready_for_delivery', 'out_for_delivery'],
}

// Customer ↔ laundry provider. Opens when the provider accepts the order and
// closes when the delivery partner collects from the shop. Deliberately does
// NOT reopen for a reported item: claim conversations belong in the claim
// thread, where they are written and attributable.
const LAUNDRY_OPEN_STATUSES: readonly string[] = [
  'confirmed', 'assigned_for_pickup', 'out_for_pickup',
  'picked_up', 'at_laundry', 'processing', 'ready_for_delivery',
]

// ── Result shapes ───────────────────────────────────────────────────────────

export interface CallContext {
  orderId:            string
  orderPublicId:      string
  pairType:           CallPairType
  legId:              string | null
  initiatorRole:      CallRole
  initiatorUserId:    string
  initiatorPhone:     string
  counterpartyUserId: string | null
  counterpartyPhone:  string
  /** Shown in the UI: "the customer", "your delivery partner". */
  counterpartyLabel:  string
}

export type CallDenialCode =
  | 'not_found'    // no such order, or not this user's
  | 'closed'       // the line for this pair has closed
  | 'unavailable'  // no counterparty yet, or a number is missing

export type CallAuthResult =
  | { ok: true;  context: CallContext }
  | { ok: false; code: CallDenialCode; reason: string }

function deny(code: CallDenialCode, reason: string): CallAuthResult {
  return { ok: false, code, reason }
}

// ── Authorization ───────────────────────────────────────────────────────────

/**
 * Decide whether `userId`, acting as `role`, may place a masked call on this
 * order — and to whom.
 *
 * `target` is only meaningful for the customer, who can reach either
 * counterparty and has to say which.
 */
export async function authorizeCall(params: {
  role:          CallRole
  userId:        string
  orderPublicId: string
  target?:       'delivery' | 'laundry'
}): Promise<CallAuthResult> {
  switch (params.role) {
    case 'delivery': return authorizeDeliveryCaller(params.userId, params.orderPublicId)
    case 'laundry':  return authorizeLaundryCaller(params.userId, params.orderPublicId)
    case 'customer': return authorizeCustomerCaller(params.userId, params.orderPublicId, params.target)
  }
}

/** Delivery partner → customer. */
async function authorizeDeliveryCaller(
  userId: string, orderPublicId: string
): Promise<CallAuthResult> {
  const row = await queryOne<{
    order_id: string; order_public_id: string; status: string
    leg_id: string; leg_type: string
    caller_phone: string | null
    customer_user_id: string; customer_phone: string | null
  }>(`
    SELECT o.id::TEXT       AS order_id,
           o.public_id::TEXT AS order_public_id,
           o.status,
           l.id::TEXT       AS leg_id,
           l.leg_type,
           du.phone         AS caller_phone,
           cu.id::TEXT      AS customer_user_id,
           cu.phone         AS customer_phone
    FROM orders o
    INNER JOIN delivery_profiles dp ON dp.user_id = $1
    INNER JOIN order_delivery_legs l
            ON l.order_id = o.id
           AND l.delivery_profile_id = dp.id
           AND l.status IN ('assigned', 'in_progress')
    INNER JOIN users du ON du.id = dp.user_id
    INNER JOIN users cu ON cu.id = o.customer_id
    WHERE o.public_id = $2
    ORDER BY l.id DESC
    LIMIT 1
  `, [userId, orderPublicId])

  if (!row) return deny('not_found', 'This order is not assigned to you')

  const open = LEG_OPEN_STATUSES[row.leg_type] ?? []
  if (!open.includes(row.status)) {
    return deny('closed', 'This line closed when the parcel changed hands')
  }
  if (!row.caller_phone || !row.customer_phone) {
    return deny('unavailable', 'A contact number is missing on this order')
  }

  return {
    ok: true,
    context: {
      orderId:            row.order_id,
      orderPublicId:      row.order_public_id,
      pairType:           'customer_delivery',
      legId:              row.leg_id,
      initiatorRole:      'delivery',
      initiatorUserId:    userId,
      initiatorPhone:     row.caller_phone,
      counterpartyUserId: row.customer_user_id,
      counterpartyPhone:  row.customer_phone,
      counterpartyLabel:  'the customer',
    },
  }
}

/** Laundry provider → customer. */
async function authorizeLaundryCaller(
  userId: string, orderPublicId: string
): Promise<CallAuthResult> {
  const row = await queryOne<{
    order_id: string; order_public_id: string; status: string
    caller_phone: string | null
    customer_user_id: string; customer_phone: string | null
  }>(`
    SELECT o.id::TEXT        AS order_id,
           o.public_id::TEXT AS order_public_id,
           o.status,
           -- The shop line first: it is answered during business hours by
           -- whoever is there, whereas the owner's mobile may not be.
           COALESCE(lp.business_phone, lu.phone) AS caller_phone,
           cu.id::TEXT       AS customer_user_id,
           cu.phone          AS customer_phone
    FROM orders o
    INNER JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id AND lp.user_id = $1
    INNER JOIN users lu ON lu.id = lp.user_id
    INNER JOIN users cu ON cu.id = o.customer_id
    WHERE o.public_id = $2
  `, [userId, orderPublicId])

  if (!row) return deny('not_found', 'This order does not belong to your shop')
  if (!LAUNDRY_OPEN_STATUSES.includes(row.status)) {
    return deny('closed', 'This line closed when the order left your shop')
  }
  if (!row.caller_phone || !row.customer_phone) {
    return deny('unavailable', 'A contact number is missing on this order')
  }

  return {
    ok: true,
    context: {
      orderId:            row.order_id,
      orderPublicId:      row.order_public_id,
      pairType:           'customer_laundry',
      legId:              null,
      initiatorRole:      'laundry',
      initiatorUserId:    userId,
      initiatorPhone:     row.caller_phone,
      counterpartyUserId: row.customer_user_id,
      counterpartyPhone:  row.customer_phone,
      counterpartyLabel:  'the customer',
    },
  }
}

/** Customer → either counterparty. */
async function authorizeCustomerCaller(
  userId: string, orderPublicId: string, target?: 'delivery' | 'laundry'
): Promise<CallAuthResult> {
  if (target !== 'delivery' && target !== 'laundry') {
    return deny('unavailable', 'Choose who to call')
  }

  const row = await queryOne<{
    order_id: string; order_public_id: string; status: string
    caller_phone: string | null
    leg_id: string | null; leg_type: string | null
    partner_user_id: string | null; partner_phone: string | null
    provider_user_id: string | null; provider_phone: string | null
  }>(`
    SELECT o.id::TEXT        AS order_id,
           o.public_id::TEXT AS order_public_id,
           o.status,
           cu.phone          AS caller_phone,
           l.id::TEXT        AS leg_id,
           l.leg_type,
           du.id::TEXT       AS partner_user_id,
           du.phone          AS partner_phone,
           lu.id::TEXT       AS provider_user_id,
           COALESCE(lp.business_phone, lu.phone) AS provider_phone
    FROM orders o
    INNER JOIN users cu ON cu.id = o.customer_id
    -- The leg still in play. A split order has two partners over its life, so
    -- "the delivery partner" only ever means whoever holds the open leg.
    LEFT JOIN LATERAL (
      SELECT * FROM order_delivery_legs
      WHERE order_id = o.id AND status IN ('assigned', 'in_progress')
      ORDER BY id DESC LIMIT 1
    ) l ON TRUE
    LEFT JOIN delivery_profiles dp ON dp.id = l.delivery_profile_id
    LEFT JOIN users du ON du.id = dp.user_id
    LEFT JOIN laundry_profiles lp ON lp.id = o.laundry_profile_id
    LEFT JOIN users lu ON lu.id = lp.user_id
    WHERE o.public_id = $2 AND o.customer_id = $1
  `, [userId, orderPublicId])

  if (!row) return deny('not_found', 'Order not found')
  if (!row.caller_phone) {
    return deny('unavailable', 'Add a phone number to your profile to make calls')
  }

  if (target === 'delivery') {
    if (!row.leg_id || !row.leg_type || !row.partner_phone) {
      return deny('unavailable', 'No delivery partner is assigned right now')
    }
    const open = LEG_OPEN_STATUSES[row.leg_type] ?? []
    if (!open.includes(row.status)) {
      return deny('closed', 'This line is open only while a partner is on the way')
    }
    return {
      ok: true,
      context: {
        orderId:            row.order_id,
        orderPublicId:      row.order_public_id,
        pairType:           'customer_delivery',
        legId:              row.leg_id,
        initiatorRole:      'customer',
        initiatorUserId:    userId,
        initiatorPhone:     row.caller_phone,
        counterpartyUserId: row.partner_user_id,
        counterpartyPhone:  row.partner_phone,
        counterpartyLabel:  'your delivery partner',
      },
    }
  }

  if (!row.provider_phone) return deny('unavailable', 'No laundry is assigned to this order yet')
  if (!LAUNDRY_OPEN_STATUSES.includes(row.status)) {
    return deny('closed', 'This line is open only while the laundry has your order')
  }
  return {
    ok: true,
    context: {
      orderId:            row.order_id,
      orderPublicId:      row.order_public_id,
      pairType:           'customer_laundry',
      legId:              null,
      initiatorRole:      'customer',
      initiatorUserId:    userId,
      initiatorPhone:     row.caller_phone,
      counterpartyUserId: row.provider_user_id,
      counterpartyPhone:  row.provider_phone,
      counterpartyLabel:  'the laundry',
    },
  }
}

// ── Recording what happened ─────────────────────────────────────────────────

/**
 * Log the call. Written before the provider is asked to dial, so a bridge that
 * fails still leaves evidence that someone tried — which matters when a
 * partner reports "the customer never picked up".
 */
export async function createCallSession(ctx: CallContext): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO order_call_sessions (
      order_id, leg_id, pair_type, initiated_by_role,
      initiator_user_id, counterparty_user_id,
      initiator_phone, counterparty_phone,
      provider, call_status, started_at
    ) VALUES (
      $1::BIGINT, $2::BIGINT, $3, $4,
      $5::BIGINT, $6::BIGINT,
      $7, $8,
      $9, 'queued', NOW()
    )
    RETURNING id::TEXT
  `, [
    ctx.orderId, ctx.legId, ctx.pairType, ctx.initiatorRole,
    ctx.initiatorUserId, ctx.counterpartyUserId,
    ctx.initiatorPhone, ctx.counterpartyPhone,
    'exotel',
  ])
  return row!.id
}

export async function attachProviderCallSid(sessionId: string, sid: string): Promise<void> {
  await query(
    `UPDATE order_call_sessions SET provider_call_sid = $2 WHERE id = $1::BIGINT`,
    [sessionId, sid]
  )
}

export async function markCallFailed(sessionId: string): Promise<void> {
  await query(
    `UPDATE order_call_sessions
     SET call_status = 'failed', ended_at = NOW()
     WHERE id = $1::BIGINT`,
    [sessionId]
  )
}

/**
 * Apply a provider status webhook.
 *
 * Matched on the provider's call SID, which is UNIQUE — providers retry these
 * on any non-2xx, so the same event arriving twice must update the same row
 * rather than create a second one. Returns the session id when a row matched,
 * null when the SID is unknown (a stray or replayed webhook), which the route
 * should ignore rather than error on.
 */
export async function applyCallStatusEvent(event: CallStatusEvent): Promise<string | null> {
  const row = await queryOne<{ id: string }>(`
    UPDATE order_call_sessions
    SET call_status      = COALESCE($2, call_status),
        duration_seconds = COALESCE($3::INTEGER, duration_seconds),
        ended_at = CASE
          WHEN $2 IN ('completed','failed','busy','no-answer','canceled') THEN NOW()
          ELSE ended_at
        END
    WHERE provider_call_sid = $1
    RETURNING id::TEXT
  `, [event.providerCallSid, event.status, event.durationSeconds])

  return row?.id ?? null
}

// ── Inbound redial ──────────────────────────────────────────────────────────

export interface RedialMatch {
  sessionId:      string
  orderId:        string
  orderPublicId:  string
  pairType:       CallPairType
  legId:          string | null
  /** Who this caller was talking to — the number to reconnect them with. */
  reconnectPhone: string
}

/**
 * Find who a caller was recently speaking to, so an inbound call to the
 * virtual number can be reconnected rather than dropped.
 *
 * People redial: the customer misses the call, sees the platform number in
 * their log and rings it back. Without this they reach dead air.
 *
 * The match is deliberately re-validated against live authorization by the
 * caller — a recent session is a hint about who they wanted, not a standing
 * permission to reach that person forever.
 */
export async function findRedialMatch(
  callerPhone: string,
  windowMinutes: number
): Promise<RedialMatch | null> {
  if (windowMinutes <= 0) return null

  return queryOne<RedialMatch>(`
    SELECT cs.id::TEXT        AS "sessionId",
           cs.order_id::TEXT  AS "orderId",
           o.public_id::TEXT  AS "orderPublicId",
           cs.pair_type       AS "pairType",
           cs.leg_id::TEXT    AS "legId",
           CASE WHEN RIGHT(regexp_replace(cs.initiator_phone, '\D', '', 'g'), 10) = $1
                THEN cs.counterparty_phone
                ELSE cs.initiator_phone
           END                AS "reconnectPhone"
    FROM order_call_sessions cs
    INNER JOIN orders o ON o.id = cs.order_id
    -- Compared on the last ten digits, not literally. Stored numbers and
    -- inbound caller ID reach us in different shapes (+91…, 0…, bare), and an
    -- exact match would miss every legitimate redial without erroring.
    WHERE (
        RIGHT(regexp_replace(cs.initiator_phone,    '\D', '', 'g'), 10) = $1
     OR RIGHT(regexp_replace(cs.counterparty_phone, '\D', '', 'g'), 10) = $1
    )
      AND cs.created_at > NOW() - make_interval(mins => $2::INTEGER)
    ORDER BY cs.created_at DESC
    LIMIT 1
  `, [callerPhone, windowMinutes])
}

/**
 * Log an inbound call that we reconnected.
 *
 * Without this the call log would only show calls the platform placed, and an
 * inbound leg's status webhook would arrive carrying a SID matching no row —
 * so a customer ringing back would simply be missing from the order's history.
 *
 * The SID is known upfront here, unlike the outbound path: the provider sends
 * it in the routing request before the call is connected.
 */
export async function createInboundCallSession(params: {
  match:        RedialMatch
  callerPhone:  string
  calleePhone:  string
  providerCallSid: string | null
}): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO order_call_sessions (
      order_id, leg_id, pair_type, initiated_by_role,
      initiator_phone, counterparty_phone,
      provider, provider_call_sid, call_status, started_at
    ) VALUES (
      $1::BIGINT, $2::BIGINT, $3,
      -- Which persona rang back isn't knowable from a phone number alone
      -- without another lookup, and nothing downstream needs it: the pair and
      -- the two numbers already say who spoke to whom.
      'customer',
      $4, $5,
      'exotel', $6, 'in-progress', NOW()
    )
    ON CONFLICT (provider_call_sid) DO NOTHING
    RETURNING id::TEXT
  `, [
    params.match.orderId, params.match.legId, params.match.pairType,
    params.callerPhone, params.calleePhone, params.providerCallSid,
  ])

  return row?.id ?? ''
}
