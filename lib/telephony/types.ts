// lib/telephony/types.ts
//
// The vocabulary of a masked call, provider-agnostic. Nothing in here mentions
// Exotel — that belongs in the adapter, so swapping providers later is one
// file rather than a sweep through every route that places a call.
//
// Pure and client-safe: no DB, no secrets, no network.

export type CallPairType = 'customer_delivery' | 'customer_laundry'

export type CallRole = 'customer' | 'delivery' | 'laundry'

/**
 * Call lifecycle states. These mirror the vocabulary every major telephony
 * provider uses (Exotel, Twilio and Plivo all speak the same set), and they
 * are the values the CHECK constraint on order_call_sessions.call_status
 * accepts — an adapter for a provider with different names maps into these
 * rather than widening the column.
 */
export type CallStatus =
  | 'queued'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer'
  | 'canceled'

export const TERMINAL_CALL_STATUSES: readonly CallStatus[] =
  ['completed', 'failed', 'busy', 'no-answer', 'canceled']

export function isTerminalCallStatus(status: CallStatus | null): boolean {
  return status != null && TERMINAL_CALL_STATUSES.includes(status)
}

/** One leg of a bridge, as the provider needs it. */
export interface BridgeRequest {
  /** Dialled first — always the person who pressed the button. */
  from: string
  /** Dialled once `from` answers. */
  to: string
  /** The virtual number both parties see. */
  callerId: string
  record: boolean
  timeLimitSeconds: number
  ringTimeoutSeconds: number
  /**
   * Audio played before the two are connected. Required whenever `record` is
   * true — recording without notice is the thing this exists to prevent.
   */
  announcementUrl?: string | null
  /**
   * Opaque correlation string echoed back on the status webhook. Capped low
   * because providers impose their own limit (Exotel: 128 chars), so callers
   * put an order reference here, never a payload.
   */
  correlationId?: string
  statusCallbackUrl: string
}

export interface BridgeResult {
  providerCallSid: string
  status: CallStatus | null
}

export interface CallDetails {
  providerCallSid: string
  status: CallStatus | null
  durationSeconds: number | null
  /** Provider-hosted URL. Pull it into our own storage before it expires. */
  recordingUrl: string | null
  startedAt: string | null
  endedAt: string | null
}

/** Normalised shape of a provider's status webhook. */
export interface CallStatusEvent {
  providerCallSid: string
  status: CallStatus | null
  durationSeconds: number | null
  recordingUrl: string | null
  correlationId: string | null
}

export type TelephonyErrorCode =
  | 'not_configured'   // no active config, or missing credentials
  | 'unauthorized'     // provider rejected our credentials
  | 'rate_limited'     // provider throttled us — back off, don't retry hot
  | 'invalid_request'  // bad number, bad parameter
  | 'provider_error'   // provider fault or unreachable

export class TelephonyError extends Error {
  constructor(
    readonly code: TelephonyErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'TelephonyError'
  }

  /** Safe to show a partner standing at a door. Never leaks provider detail. */
  get userMessage(): string {
    switch (this.code) {
      case 'rate_limited':  return 'Too many calls right now — try again in a moment'
      case 'invalid_request': return 'That number could not be dialled'
      case 'not_configured':
      case 'unauthorized':
      case 'provider_error':
      default:              return 'Calling is unavailable right now'
    }
  }
}
