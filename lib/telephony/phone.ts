// lib/telephony/phone.ts
//
// One phone number takes three shapes in this feature and they must not be
// compared or dialled interchangeably:
//
//   users.phone            10 digits, as the app collects it
//   what a provider dials  E.164, "+919812345678" — the connect API demands it
//   inbound caller ID      whatever the carrier sends: +91…, 0…, or bare
//
// Getting this wrong fails quietly rather than loudly. A number dialled in the
// wrong shape is rejected by the provider, and — worse — a redial lookup that
// compares "+919812345678" against "9812345678" simply finds nothing, so the
// customer ringing back reaches dead air and nobody sees an error.
//
// India only, matching the rest of the platform.

const INDIA_CC = '91'

/**
 * Last ten digits — the stable identity of an Indian mobile regardless of how
 * it was written. Used for comparison, never for dialling.
 */
export function toTenDigits(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

/**
 * E.164, for handing to the provider. Returns null when the input can't be a
 * valid Indian mobile — callers must treat that as "cannot dial" rather than
 * sending a malformed number and reading the rejection later.
 */
export function toE164India(raw: string | null | undefined): string | null {
  const ten = toTenDigits(raw)
  // Indian mobile numbers start 6-9. Anything else is a landline, a short code
  // or a typo, none of which this feature should be dialling.
  if (!/^[6-9]\d{9}$/.test(ten)) return null
  return `+${INDIA_CC}${ten}`
}
