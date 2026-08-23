// lib/payment/payu-sdk-hash.ts
//
// Decides whether a hash the PayU mobile SDK asked for may be signed.
//
// PayU's documented integration is: the SDK hands the app a hashString, the
// app posts it to the merchant server, the server appends the salt, hashes,
// and returns it. Their words are "there is no need to know the formula".
//
// Implemented literally, that endpoint is a signing oracle. The salt never
// leaves the server, but it does not need to — a caller who can get arbitrary
// strings signed can ask for the *payment* hash of a ₹1 payment against a
// ₹5,000 order and PayU will honour it, because a correct signature is exactly
// what PayU checks. lib/payment/reconcile.ts already exists because a valid
// signature is not proof the right amount moved; a naive hash endpoint would
// reopen that hole one step further upstream, before the money even moves.
//
// So nothing here is signed on trust:
//
//   * The payment hash is never signed from client input at all. It is rebuilt
//     from the payment row in the database and signed only if the caller's
//     string matches that rebuild byte for byte. A caller who alters the
//     amount, the txnid, or anything else gets a refusal, not a signature.
//
//   * Command hashes (the SDK's supporting API calls) are matched against a
//     closed list, and their shape is checked so a payment string cannot be
//     smuggled through dressed as a command.
//
// Anything unrecognised is refused. If a legitimate SDK flow ever needs a
// command that is not listed, it fails closed and the reason is logged — which
// is the right way round for something holding a signing key.

/**
 * PayU commands the CheckoutPro SDK legitimately asks the merchant to sign.
 *
 * These take the shape `key|command|var1|`, carry no amount, and cannot move
 * money on their own.
 */
const ALLOWED_SDK_COMMANDS = new Set([
  'payment_related_details_for_mobile_sdk',
  'vas_for_mobile_sdk',
  'verify_payment',
  'check_isDomestic',
  'validateVPA',
  'getEmiAmountAccordingToInterest',
  'getTransactionInfo',
  'getCheckoutDetails',
  'check_offer_status',
  'offer_key',
  'getOfferDetails',
  'getUserCards',
  'save_user_card',
  'edit_user_card',
  'delete_user_card',
])

export interface PaymentHashFields {
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  udf1?: string
  udf2?: string
  udf3?: string
  udf4?: string
  udf5?: string
}

export type HashAuthorisation =
  | { ok: true; kind: 'payment' | 'command'; preSalt: string }
  | { ok: false; reason: string }

/**
 * Authorise (or refuse) a hash request from the SDK.
 *
 * `expectedPaymentPreSalt` must come from the server's own view of the payment
 * — see the caller in app/api/customer/payments/payu/sdk-hash/route.ts — never
 * from anything the client sent alongside the request.
 */
export function authoriseSdkHash(params: {
  hashName: string
  hashString: string
  merchantKey: string
  expectedPaymentPreSalt: string
}): HashAuthorisation {
  const { hashName, hashString, merchantKey, expectedPaymentPreSalt } = params

  if (!hashName || typeof hashName !== 'string' || hashName.length > 64) {
    return { ok: false, reason: 'invalid_hash_name' }
  }
  if (!hashString || typeof hashString !== 'string' || hashString.length > 2048) {
    return { ok: false, reason: 'invalid_hash_string' }
  }

  const segments = hashString.split('|')

  // Every PayU hash string starts with the merchant key. A string that does
  // not is not ours to sign under any interpretation.
  if (segments[0] !== merchantKey) {
    return { ok: false, reason: 'merchant_key_mismatch' }
  }

  const maybeCommand = segments[1] ?? ''

  if (ALLOWED_SDK_COMMANDS.has(maybeCommand)) {
    // `key|command|var1|` — anything past var1 must be empty, so a longer
    // payment-shaped payload cannot ride in behind a permitted command name.
    const tail = segments.slice(3)
    if (tail.some((segment) => segment !== '')) {
      return { ok: false, reason: 'command_hash_has_unexpected_fields' }
    }
    if (segments.length > 5) {
      return { ok: false, reason: 'command_hash_too_long' }
    }
    return { ok: true, kind: 'command', preSalt: hashString }
  }

  // Not a known command, so the only other thing it can legitimately be is the
  // payment hash — which is authorised by equality with the server's own
  // rebuild, never by parsing the caller's version and trusting the parts.
  if (hashString !== expectedPaymentPreSalt) {
    return { ok: false, reason: 'payment_hash_does_not_match_order' }
  }

  return { ok: true, kind: 'payment', preSalt: expectedPaymentPreSalt }
}
