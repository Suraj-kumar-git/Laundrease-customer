// lib/telephony/admin-handlers.ts
//
// Read/write handlers for the masking config and the per-order call log,
// shared by the admin and support routes. Only the authentication differs
// between the two — admin by role, support by tab grant — so everything from
// validation onward lives here rather than being copied and drifting.
//
// Same shape as lib/delivery-payout-config.ts, for the same reason.

import { query, queryOne } from '@/lib/db'
import { getCallRecordingUrl } from '@/lib/s3'
import { loadCallConfig, type CallConfig } from './index'

export type ConfigResult<T> =
  | { ok: true;  data: T }
  | { ok: false; status: number; error: string }

// ── Config ──────────────────────────────────────────────────────────────────

export interface CallConfigView extends CallConfig {
  /** Whether credentials are present, never the credentials themselves. */
  credentials_configured: boolean
  /** Everything that must be true before this can be switched on. */
  readiness: { label: string; ok: boolean }[]
}

export async function readCallConfig(): Promise<ConfigResult<CallConfigView>> {
  const config = await loadCallConfig()
  if (!config) return { ok: false, status: 404, error: 'Call configuration not found' }

  const credentialsConfigured = Boolean(
    process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN && process.env.EXOTEL_ACCOUNT_SID
  )

  return {
    ok: true,
    data: {
      ...config,
      credentials_configured: credentialsConfigured,
      // Surfaced as a checklist rather than a single "ready" boolean: when
      // masking won't turn on, the operator needs to know which piece is
      // missing, not just that something is.
      readiness: [
        { label: 'Provider credentials set',   ok: credentialsConfigured },
        { label: 'Virtual number configured',  ok: Boolean(config.exophone) },
        { label: 'Webhook URL and secret set', ok: Boolean(
            (process.env.TELEPHONY_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_CUSTOMER_URL) &&
            process.env.TELEPHONY_WEBHOOK_SECRET
          ) },
        { label: 'Recording notice audio set', ok: !config.record_calls || Boolean(config.announcement_url) },
        { label: 'Support number for inbound calls', ok: Boolean(config.support_forward_number) },
      ],
    },
  }
}

export interface CallConfigPatch {
  is_active?:                     boolean
  exophone?:                      string | null
  api_subdomain?:                 string
  record_calls?:                  boolean
  announcement_url?:              string | null
  call_time_limit_seconds?:       number
  ring_timeout_seconds?:          number
  inbound_redial_window_minutes?: number
  support_forward_number?:        string | null
  support_hours_start?:           string
  support_hours_end?:             string
}

export async function writeCallConfig(
  patch: CallConfigPatch,
  updatedBy: string
): Promise<ConfigResult<CallConfigView>> {
  const current = await loadCallConfig()
  if (!current) return { ok: false, status: 404, error: 'Call configuration not found' }

  const next = { ...current, ...patch }

  // Validated here rather than trusted from the form: these routes are reachable
  // directly, and a bad value would only surface as a failed call later.
  if (next.call_time_limit_seconds < 60 || next.call_time_limit_seconds > 14400) {
    return { ok: false, status: 400, error: 'Call time limit must be between 60 and 14400 seconds' }
  }
  if (next.ring_timeout_seconds < 10 || next.ring_timeout_seconds > 120) {
    return { ok: false, status: 400, error: 'Ring timeout must be between 10 and 120 seconds' }
  }
  if (next.inbound_redial_window_minutes < 0 || next.inbound_redial_window_minutes > 720) {
    return { ok: false, status: 400, error: 'Redial window must be between 0 and 720 minutes' }
  }

  // Two gates on switching masking ON. Both are refusals rather than warnings:
  // enabling without a number leaves both parties unable to reach each other,
  // and enabling recording without a notice starts recording people who were
  // never told.
  if (next.is_active) {
    if (!next.exophone) {
      return { ok: false, status: 400, error: 'Set the virtual number before switching masking on' }
    }
    if (next.record_calls && !next.announcement_url) {
      return {
        ok: false, status: 400,
        error: 'Recording needs a notice audio URL — callers must be told before they are recorded',
      }
    }
    if (!process.env.EXOTEL_API_KEY || !process.env.EXOTEL_API_TOKEN || !process.env.EXOTEL_ACCOUNT_SID) {
      return { ok: false, status: 400, error: 'Provider credentials are not set on the server' }
    }
  }

  await query(`
    UPDATE platform_call_config SET
      is_active                     = $2,
      exophone                      = $3,
      api_subdomain                 = $4,
      record_calls                  = $5,
      announcement_url              = $6,
      call_time_limit_seconds       = $7,
      ring_timeout_seconds          = $8,
      inbound_redial_window_minutes = $9,
      support_forward_number        = $10,
      support_hours_start           = $11::TIME,
      support_hours_end             = $12::TIME,
      updated_by                    = $1::BIGINT,
      updated_at                    = NOW()
    WHERE id = 1
  `, [
    updatedBy,
    next.is_active, next.exophone?.trim() || null, next.api_subdomain,
    next.record_calls, next.announcement_url?.trim() || null,
    next.call_time_limit_seconds, next.ring_timeout_seconds,
    next.inbound_redial_window_minutes,
    next.support_forward_number?.trim() || null,
    next.support_hours_start, next.support_hours_end,
  ])

  return readCallConfig()
}

// ── Call log ────────────────────────────────────────────────────────────────

export interface CallLogEntry {
  id:               string
  pair_type:        string
  initiated_by_role: string
  initiator_name:   string | null
  counterparty_name: string | null
  call_status:      string | null
  duration_seconds: number | null
  started_at:       string | null
  ended_at:         string | null
  recording_url:    string | null
}

/**
 * Every call placed on one order.
 *
 * Real phone numbers are deliberately not returned even though staff can see
 * them elsewhere: a call log is a browsing surface, and there is no reason for
 * a list of calls to also be a list of everyone's numbers. Names identify the
 * parties well enough to resolve a dispute.
 */
export async function readOrderCallLog(orderPublicId: string): Promise<ConfigResult<CallLogEntry[]>> {
  const order = await queryOne<{ id: string }>(
    `SELECT id::TEXT FROM orders WHERE public_id = $1`, [orderPublicId]
  )
  if (!order) return { ok: false, status: 404, error: 'Order not found' }

  const { rows } = await query<CallLogEntry & { recording_s3_key: string | null }>(`
    SELECT cs.id::TEXT,
           cs.pair_type,
           cs.initiated_by_role,
           iu.full_name AS initiator_name,
           cu.full_name AS counterparty_name,
           cs.call_status,
           cs.duration_seconds,
           cs.started_at::TEXT,
           cs.ended_at::TEXT,
           cs.recording_s3_key
    FROM order_call_sessions cs
    LEFT JOIN users iu ON iu.id = cs.initiator_user_id
    LEFT JOIN users cu ON cu.id = cs.counterparty_user_id
    WHERE cs.order_id = $1::BIGINT
    ORDER BY cs.created_at DESC
  `, [order.id])

  const entries = await Promise.all(rows.map(async row => {
    const { recording_s3_key, ...rest } = row
    return {
      ...rest,
      // Signed per request and short-lived — a recording URL that outlives the
      // page it was rendered on is a recording that can be forwarded.
      recording_url: recording_s3_key
        ? await getCallRecordingUrl(recording_s3_key).catch(() => null)
        : null,
    }
  }))

  return { ok: true, data: entries }
}
