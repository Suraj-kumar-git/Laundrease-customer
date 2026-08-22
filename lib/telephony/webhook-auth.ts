// lib/telephony/webhook-auth.ts
//
// Authenticating provider callbacks that carry no signature.
//
// Exotel sends neither an HMAC header nor any other proof of origin, so the
// usual "recompute the signature" check is unavailable and these endpoints are
// reachable by anyone who learns the URL. A secret path segment plus an
// optional IP allowlist stand in for one. Shared by both callback routes so
// the two can't drift apart — a guard that is subtly weaker on one endpoint is
// as good as no guard.

import crypto from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Constant-time comparison of the path secret.
 *
 * Both sides are hashed first so the buffers are always 32 bytes: that stops
 * timingSafeEqual throwing on a length mismatch, and means the comparison
 * can't leak the secret's length either.
 */
export function webhookSecretMatches(provided: string): boolean {
  const expected = process.env.TELEPHONY_WEBHOOK_SECRET
  if (!expected || !provided) return false

  const a = crypto.createHash('sha256').update(provided).digest()
  const b = crypto.createHash('sha256').update(expected).digest()
  return crypto.timingSafeEqual(a, b)
}

/**
 * Optional IP allowlist — set TELEPHONY_WEBHOOK_ALLOWED_IPS to the provider's
 * egress addresses, comma separated.
 *
 * Unset means "allow any", and that is the right default: a wrong allowlist
 * silently drops real calls, and a customer reaching dead air is worse than
 * the marginal risk it removes.
 */
export function webhookIpAllowed(req: NextRequest): boolean {
  const allowed = process.env.TELEPHONY_WEBHOOK_ALLOWED_IPS
  if (!allowed) return true

  const list = allowed.split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) return true

  // Left-most entry is the originating client; the rest are proxies we added.
  const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
  return !!clientIp && list.includes(clientIp)
}

/** Both guards, for callers that don't care which one failed. */
export function webhookAuthorized(req: NextRequest, secret: string): boolean {
  return webhookSecretMatches(secret) && webhookIpAllowed(req)
}

/**
 * India-only operation, so the timezone is fixed rather than configurable.
 * Returns "HH:MM:SS" in IST for comparison against the configured support
 * hours, which are stored as bare TIME values.
 */
export function nowInIst(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date())
}

/** Handles windows that wrap past midnight (e.g. 21:00 → 06:00). */
export function withinHours(now: string, start: string, end: string): boolean {
  if (start === end) return true          // configured as always-open
  if (start < end)   return now >= start && now < end
  return now >= start || now < end
}
