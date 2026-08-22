// lib/payment/signature.ts
//
// Constant-time comparison for gateway webhook signatures.
//
// Every adapter was comparing with `===`, which returns as soon as two bytes
// differ. Same idiom as lib/telephony/webhook-auth.ts: hash both sides to a
// fixed 32 bytes first, so timingSafeEqual can't throw on a length mismatch
// and the comparison can't leak the signature's length either.

import crypto from 'crypto'

export function signaturesMatch(expected: string, provided: string): boolean {
  if (!expected || !provided) return false
  const a = crypto.createHash('sha256').update(expected).digest()
  const b = crypto.createHash('sha256').update(provided).digest()
  return crypto.timingSafeEqual(a, b)
}
