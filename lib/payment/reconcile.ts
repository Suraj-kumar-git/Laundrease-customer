// lib/payment/reconcile.ts
//
// Does the money the gateway says it collected match the money we asked for?
//
// Every gateway callback used to be accepted on signature validity alone. A
// valid signature proves the message came from the gateway and was not altered
// in transit — it does NOT prove the gateway collected the amount the order is
// worth. Those are different claims, and treating the first as the second is
// how a ₹950 order gets settled for ₹10.
//
// For PayU and Cashfree the amount is part of the signed payload, so once the
// signature verifies the reported amount is authentic and this comparison is
// meaningful. Razorpay's signature covers only order_id|payment_id, so its
// amount cannot be recovered from the signature — see the note in
// app/api/customer/payments/verify/route.ts for how that path is bound instead.
//
// Comparison is in integer paise. Amounts reach us as strings from Postgres
// NUMERIC(10,2) and as strings from gateway form posts; comparing those as
// floats invites 949.9999999 !== 950.

export interface ReconcileResult {
  ok:            boolean
  expectedPaise: number
  reportedPaise: number | null
  /** Machine-readable reason, for logging and for the payment failure note. */
  reason:        'match' | 'mismatch' | 'missing' | 'unparseable'
  /** Human-readable, safe to log. Never shown to the payer. */
  detail:        string
}

function toPaise(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isFinite(n)) return null
  // Round rather than truncate: 9.995 * 100 is 999.4999... in binary floating
  // point, and truncating would lose a paisa on perfectly ordinary amounts.
  return Math.round(n * 100)
}

/**
 * Compare what the gateway reported against what our own record says is owed.
 *
 * Any difference fails — over as well as under. An overpayment is not a happy
 * accident, it is a signal that something is wrong with the amount binding,
 * and silently banking it hides the very defect this check exists to catch.
 *
 * @param expected amount from OUR database (rupees; string from NUMERIC is fine)
 * @param reported amount as stated by the gateway (rupees, unless `unit` says otherwise)
 */
export function reconcileAmount(
  expected: string | number,
  reported: unknown,
  opts: { unit?: 'rupees' | 'paise' } = {}
): ReconcileResult {
  const expectedPaise = toPaise(expected)

  if (expectedPaise === null) {
    return {
      ok: false, expectedPaise: 0, reportedPaise: null,
      reason: 'unparseable',
      detail: `Could not read the expected amount from our own record (${String(expected)})`,
    }
  }

  if (reported === null || reported === undefined || reported === '') {
    return {
      ok: false, expectedPaise, reportedPaise: null,
      reason: 'missing',
      detail: `Gateway reported no amount; expected ₹${(expectedPaise / 100).toFixed(2)}`,
    }
  }

  const reportedPaise = opts.unit === 'paise'
    ? (Number.isFinite(Number(reported)) ? Math.round(Number(reported)) : null)
    : toPaise(reported)

  if (reportedPaise === null) {
    return {
      ok: false, expectedPaise, reportedPaise: null,
      reason: 'unparseable',
      detail: `Gateway amount could not be parsed (${String(reported)})`,
    }
  }

  if (reportedPaise !== expectedPaise) {
    return {
      ok: false, expectedPaise, reportedPaise,
      reason: 'mismatch',
      detail:
        `Amount mismatch: gateway reported ₹${(reportedPaise / 100).toFixed(2)}, ` +
        `expected ₹${(expectedPaise / 100).toFixed(2)}`,
    }
  }

  return {
    ok: true, expectedPaise, reportedPaise,
    reason: 'match',
    detail: `Amount matched at ₹${(expectedPaise / 100).toFixed(2)}`,
  }
}

/**
 * One line, one shape, every callback — so a mismatch is greppable in logs
 * rather than being phrased differently in four places.
 */
export function logReconcileFailure(
  where: string,
  merchantTxnId: string,
  result: ReconcileResult
): void {
  console.error(
    `[payment-reconcile] REJECTED ${where} txn=${merchantTxnId} ` +
    `reason=${result.reason} expected_paise=${result.expectedPaise} ` +
    `reported_paise=${result.reportedPaise ?? 'null'} :: ${result.detail}`
  )
}
