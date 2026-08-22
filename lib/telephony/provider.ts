// lib/telephony/provider.ts
//
// The contract every telephony provider implements. Routes depend on this, not
// on Exotel — the same reasoning behind lib/payment/types.ts, where the order
// flow has never known whether it is talking to PayU or Cashfree.

import type {
  BridgeRequest, BridgeResult, CallDetails, CallStatusEvent,
} from './types'

export interface TelephonyProvider {
  readonly name: string

  /**
   * Ring `from`, then connect them to `to`, with `callerId` shown to both.
   * Returns as soon as the provider accepts the request — the call is still
   * ringing at that point, and its outcome arrives later on the status webhook.
   */
  bridge(req: BridgeRequest): Promise<BridgeResult>

  /**
   * Current state of a call. A fallback for when a webhook never arrives, not
   * the primary path — polling every call would be both slow and expensive.
   */
  getCall(providerCallSid: string): Promise<CallDetails | null>

  /**
   * Normalise a status webhook body into our vocabulary.
   *
   * Returns null when the payload isn't recognisable, which the route must
   * treat as "ignore", not "fail" — these endpoints are public and will be
   * hit by scanners.
   */
  parseStatusCallback(payload: Record<string, unknown>): CallStatusEvent | null

  /**
   * Download a recording the provider is hosting, so it can be moved into our
   * own bucket under our own retention policy.
   */
  fetchRecording(recordingUrl: string): Promise<{ buffer: Buffer; contentType: string }>
}
