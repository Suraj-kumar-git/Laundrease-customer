// lib/telephony/index.ts
//
// Resolves the configured telephony provider. Every route that places a call
// goes through here, so "which provider" and "is masking switched on" are
// answered in exactly one place.
//
// Server-only: reads platform_call_config and the credential environment.

import { queryOne } from '@/lib/db'
import type { TelephonyProvider } from './provider'
import { ExotelAdapter, exotelCredentialsFromEnv } from './exotel'
import { TelephonyError } from './types'

export * from './types'
export type { TelephonyProvider } from './provider'

export interface CallConfig {
  is_active:                     boolean
  provider:                      string
  api_subdomain:                 string
  exophone:                      string | null
  record_calls:                  boolean
  announcement_url:              string | null
  call_time_limit_seconds:       number
  ring_timeout_seconds:          number
  inbound_redial_window_minutes: number
  support_forward_number:        string | null
  support_hours_start:           string
  support_hours_end:             string
}

export async function loadCallConfig(): Promise<CallConfig | null> {
  return queryOne<CallConfig>(`
    SELECT is_active, provider, api_subdomain, exophone,
           record_calls, announcement_url,
           call_time_limit_seconds, ring_timeout_seconds,
           inbound_redial_window_minutes,
           support_forward_number,
           support_hours_start::TEXT, support_hours_end::TEXT
    FROM platform_call_config WHERE id = 1
  `)
}

export interface ResolvedTelephony {
  provider: TelephonyProvider
  config:   CallConfig
  /** Non-null and validated, so callers don't re-check it. */
  exophone: string
}

/**
 * The configured provider, or null when masked calling is not usable.
 *
 * Returns null rather than throwing for the ordinary "switched off" cases —
 * an admin who hasn't finished setup, or a deliberate kill switch during a
 * provider outage. Callers turn that into a friendly "calling is unavailable"
 * instead of a 500.
 *
 * Throws only when the configuration is actively wrong: masking enabled but
 * credentials missing, or a provider name nothing implements. Those are
 * mistakes someone needs to see, not silent no-ops.
 */
export async function resolveTelephony(): Promise<ResolvedTelephony | null> {
  const config = await loadCallConfig()
  if (!config || !config.is_active) return null
  if (!config.exophone) return null

  switch (config.provider) {
    case 'exotel': {
      const creds = exotelCredentialsFromEnv(config.api_subdomain)
      if (!creds) {
        throw new TelephonyError(
          'not_configured',
          'Masked calling is switched on but EXOTEL_API_KEY / EXOTEL_API_TOKEN / EXOTEL_ACCOUNT_SID are not set'
        )
      }
      return { provider: new ExotelAdapter(creds), config, exophone: config.exophone }
    }
    default:
      throw new TelephonyError(
        'not_configured',
        `No adapter for telephony provider "${config.provider}"`
      )
  }
}
