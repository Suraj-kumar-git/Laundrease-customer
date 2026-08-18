// lib/telephony/exotel.ts
//
// Exotel implementation of TelephonyProvider.
//
// Docs: https://developer.exotel.com/docs/voice-v1/api-reference/connect-two-numbers
//
// Chosen over Twilio for the Indian market: TRAI rules make Indian voice
// numbers materially harder for foreign providers, and Exotel is what most
// Indian delivery marketplaces already run on, so the carrier and compliance
// problems are solved rather than ours.

import type { TelephonyProvider } from './provider'
import {
  TelephonyError,
  type BridgeRequest, type BridgeResult, type CallDetails,
  type CallStatus, type CallStatusEvent,
} from './types'

const REQUEST_TIMEOUT_MS   = 15_000
const RECORDING_TIMEOUT_MS = 60_000

export interface ExotelCredentials {
  apiKey:     string
  apiToken:   string
  accountSid: string
  /** api.in.exotel.com (Mumbai) or api.exotel.com (Singapore). */
  subdomain:  string
}

/**
 * Read credentials from the environment.
 *
 * Deliberately not from platform_call_config: a config row is read by ordinary
 * queries and lands in every database backup, which is the wrong home for
 * something that can place billable calls.
 */
export function exotelCredentialsFromEnv(subdomain: string): ExotelCredentials | null {
  const apiKey     = process.env.EXOTEL_API_KEY
  const apiToken   = process.env.EXOTEL_API_TOKEN
  const accountSid = process.env.EXOTEL_ACCOUNT_SID
  if (!apiKey || !apiToken || !accountSid) return null
  return { apiKey, apiToken, accountSid, subdomain }
}

export class ExotelAdapter implements TelephonyProvider {
  readonly name = 'exotel'

  constructor(private readonly creds: ExotelCredentials) {}

  // ── Bridge ────────────────────────────────────────────────────────────────

  async bridge(req: BridgeRequest): Promise<BridgeResult> {
    if (req.record && !req.announcementUrl) {
      // A hard stop rather than a silent downgrade. Recording someone without
      // notice is the failure this whole feature is supposed to avoid, and a
      // missing audio file is an easy thing to not notice in config.
      throw new TelephonyError(
        'not_configured',
        'Refusing to record without an announcement — set the recording notice audio first'
      )
    }

    const form = new URLSearchParams()
    form.set('From',     req.from)
    form.set('To',       req.to)
    form.set('CallerId', req.callerId)
    // Transactional, not promotional: these calls are part of a service the
    // customer has already bought, and the classification affects routing.
    form.set('CallType', 'trans')
    form.set('TimeLimit', String(req.timeLimitSeconds))
    form.set('TimeOut',   String(req.ringTimeoutSeconds))

    if (req.record) {
      form.set('Record', 'true')
      form.set('RecordingFormat', 'mp3')
      // Dual channel puts each party on their own track. Costs a little more
      // storage and is worth it for the only reason we record at all — in a
      // dispute, "who said what" is the entire question.
      form.set('RecordingChannels', 'dual')
    }

    if (req.announcementUrl) {
      // Both, not just the callee: the partner is being recorded too and is
      // equally entitled to know.
      form.set('StartPlaybackToNew',    'Both')
      form.set('StartPlaybackValueNew', req.announcementUrl)
    }

    if (req.correlationId) form.set('CustomField', req.correlationId.slice(0, 128))

    form.set('StatusCallback', req.statusCallbackUrl)
    form.set('StatusCallbackContentType', 'application/json')
    // 'terminal' is the one we act on; 'answered' lets the UI stop showing
    // "ringing" without waiting for the whole call to end.
    form.set('StatusCallbackEvents[0]', 'terminal')
    form.set('StatusCallbackEvents[1]', 'answered')

    const json = await this.post('Calls/connect.json', form)
    const call = (json as any)?.Call

    if (!call?.Sid) {
      throw new TelephonyError('provider_error', 'Exotel accepted the call but returned no Sid')
    }

    return {
      providerCallSid: String(call.Sid),
      status: normaliseStatus(call.Status),
    }
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  async getCall(providerCallSid: string): Promise<CallDetails | null> {
    const json = await this.get(`Calls/${encodeURIComponent(providerCallSid)}.json`)
    const call = (json as any)?.Call
    if (!call) return null

    return {
      providerCallSid: String(call.Sid ?? providerCallSid),
      status:          normaliseStatus(call.Status),
      durationSeconds: toInt(call.Duration),
      recordingUrl:    call.RecordingUrl ?? null,
      startedAt:       call.StartTime ?? null,
      endedAt:         call.EndTime ?? null,
    }
  }

  // ── Webhook ───────────────────────────────────────────────────────────────

  parseStatusCallback(payload: Record<string, unknown>): CallStatusEvent | null {
    // Exotel posts either flat fields or nested under a wrapper depending on
    // the content type negotiated, so accept both rather than assuming.
    const body = (payload as any)?.Call ?? payload
    const sid  = body?.CallSid ?? body?.Sid
    if (!sid) return null

    return {
      providerCallSid: String(sid),
      status:          normaliseStatus(body?.Status ?? body?.CallStatus),
      // DialCallDuration is the connected time; Duration includes ring. The
      // former is what a person means by "how long was the call".
      durationSeconds: toInt(body?.DialCallDuration ?? body?.Duration),
      recordingUrl:    body?.RecordingUrl ?? null,
      correlationId:   body?.CustomField != null ? String(body.CustomField) : null,
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  async fetchRecording(recordingUrl: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await this.fetchWithTimeout(recordingUrl, {
      method:  'GET',
      headers: { Authorization: this.authHeader() },
    }, RECORDING_TIMEOUT_MS)

    if (!res.ok) {
      throw new TelephonyError('provider_error', `Recording download failed (${res.status})`, res.status)
    }

    return {
      buffer:      Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get('content-type') ?? 'audio/mpeg',
    }
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  /**
   * Basic auth via header rather than the `https://key:token@host` form the
   * docs use. Same credentials, but URL-embedded ones get written verbatim
   * into request logs, error traces and anything that echoes a failing URL.
   */
  private authHeader(): string {
    const raw = `${this.creds.apiKey}:${this.creds.apiToken}`
    return `Basic ${Buffer.from(raw).toString('base64')}`
  }

  private baseUrl(path: string): string {
    return `https://${this.creds.subdomain}/v1/Accounts/${this.creds.accountSid}/${path}`
  }

  private async post(path: string, form: URLSearchParams): Promise<unknown> {
    const res = await this.fetchWithTimeout(this.baseUrl(path), {
      method: 'POST',
      headers: {
        Authorization:  this.authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    }, REQUEST_TIMEOUT_MS)

    return this.readResponse(res)
  }

  private async get(path: string): Promise<unknown> {
    const res = await this.fetchWithTimeout(this.baseUrl(path), {
      method:  'GET',
      headers: { Authorization: this.authHeader() },
    }, REQUEST_TIMEOUT_MS)

    return this.readResponse(res)
  }

  private async readResponse(res: Response): Promise<unknown> {
    if (res.ok) {
      try { return await res.json() } catch {
        throw new TelephonyError('provider_error', 'Exotel returned a non-JSON body')
      }
    }

    const detail = await res.text().catch(() => '')
    // Truncated: provider bodies can be long, and this lands in server logs.
    const brief = detail.slice(0, 300)

    if (res.status === 401 || res.status === 403) {
      throw new TelephonyError('unauthorized', 'Exotel rejected our credentials', res.status)
    }
    if (res.status === 429) {
      // Exotel caps at 200 calls/minute across the whole account, so this is
      // shared across every persona placing calls — the caller must back off
      // rather than retry immediately.
      throw new TelephonyError('rate_limited', 'Exotel rate limit reached', res.status)
    }
    if (res.status >= 400 && res.status < 500) {
      throw new TelephonyError('invalid_request', `Exotel rejected the request: ${brief}`, res.status)
    }
    throw new TelephonyError('provider_error', `Exotel error ${res.status}: ${brief}`, res.status)
  }

  private async fetchWithTimeout(
    url: string, init: RequestInit, timeoutMs: number
  ): Promise<Response> {
    // Without this a hung provider holds the request open until the platform
    // kills it, with a partner staring at a spinner the whole time.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new TelephonyError('provider_error', 'Exotel did not respond in time')
      }
      throw new TelephonyError('provider_error', `Could not reach Exotel: ${err?.message ?? 'network error'}`)
    } finally {
      clearTimeout(timer)
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const KNOWN_STATUSES = new Set<CallStatus>([
  'queued', 'in-progress', 'completed', 'failed', 'busy', 'no-answer', 'canceled',
])

/**
 * Exotel's status vocabulary already matches ours, but it has been seen
 * sending 'no-answer' as 'no_answer' and casing inconsistently, so normalise
 * rather than trusting the wire format. Anything unrecognised becomes null —
 * better an unknown status than a value the CHECK constraint rejects, which
 * would fail the whole webhook.
 */
function normaliseStatus(raw: unknown): CallStatus | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase().replace(/_/g, '-')
  return KNOWN_STATUSES.has(value as CallStatus) ? (value as CallStatus) : null
}

function toInt(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = parseInt(String(raw), 10)
  return Number.isFinite(n) ? n : null
}
