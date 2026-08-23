import crypto from 'crypto'
import { signaturesMatch } from './signature'
import {
  PaymentGatewayAdapter, GatewayConfig, GatewayOrderParams, GatewayOrder,
  PaymentVerificationParams, PaymentVerificationResult, WebhookVerificationParams,
  RefundParams, RefundResult, RefundStatusParams, RefundStatusResult,
} from './types'

export class PayUAdapter implements PaymentGatewayAdapter {
  readonly provider = 'payu'
  private config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  private getBaseUrl(): string {
    return this.config.sandbox
      ? 'https://test.payu.in'
      : 'https://secure.payu.in'
  }

  // PayU's "Info API" (refunds, status checks) lives on a separate host
  // from the hosted-checkout host above.
  private getInfoApiUrl(): string {
    return this.config.sandbox
      ? 'https://test.payu.in/merchant/postservice?form=2'
      : 'https://info.payu.in/merchant/postservice?form=2'
  }

  private formatAmount(amount: number): string {
    return amount.toFixed(2)
  }

  private buildRequestHash(input: {
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
  }): string {
    const parts = [
      this.config.apiKey,
      input.txnid,
      input.amount,
      input.productinfo,
      input.firstname,
      input.email,
      input.udf1 ?? '',
      input.udf2 ?? '',
      input.udf3 ?? '',
      input.udf4 ?? '',
      input.udf5 ?? '',
      '',
      '',
      '',
      '',
      '',
      this.config.apiSecret,
    ]

    return crypto.createHash('sha512').update(parts.join('|')).digest('hex')
  }

  private buildResponseHash(input: {
    status: string
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
  }): string {
    const parts = [
      this.config.apiSecret,
      input.status,
      '',
      '',
      '',
      '',
      '',
      input.udf5 ?? '',
      input.udf4 ?? '',
      input.udf3 ?? '',
      input.udf2 ?? '',
      input.udf1 ?? '',
      input.email,
      input.firstname,
      input.productinfo,
      input.amount,
      input.txnid,
      this.config.apiKey,
    ]

    return crypto.createHash('sha512').update(parts.join('|')).digest('hex')
  }

  /**
   * The exact string PayU hashes for a payment, minus the trailing salt.
   *
   * Built from the same parts as buildRequestHash, because it exists to be
   * compared against what the mobile SDK asks us to sign — see
   * lib/payment/payu-sdk-hash.ts. Keeping one source for the field order means
   * the comparison cannot drift away from what we actually sign.
   */
  buildPaymentHashPreSalt(input: {
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
  }): string {
    return [
      this.config.apiKey,
      input.txnid,
      input.amount,
      input.productinfo,
      input.firstname,
      input.email,
      input.udf1 ?? '',
      input.udf2 ?? '',
      input.udf3 ?? '',
      input.udf4 ?? '',
      input.udf5 ?? '',
      '', '', '', '', '',
    ].join('|') + '|'
  }

  /**
   * Sign a string the CheckoutPro mobile SDK asked for.
   *
   * This is the raw primitive only. It must never be reached with a string
   * that has not been authorised first — see authoriseSdkHash() — because
   * signing arbitrary input with the merchant salt is equivalent to handing
   * the salt out.
   */
  signMobileSdkHash(hashStringPreSalt: string, postSalt?: string | null): string {
    const payload = `${hashStringPreSalt}${this.config.apiSecret}${postSalt ?? ''}`
    return crypto.createHash('sha512').update(payload).digest('hex')
  }

  get merchantKey(): string {
    return this.config.apiKey
  }

  async createOrder(params: GatewayOrderParams): Promise<GatewayOrder> {
    const txnid = params.receipt
    const amount = this.formatAmount(params.amount)

    const firstname = String(params.notes?.customer_name ?? 'Customer')
    const email = String(params.notes?.customer_email ?? 'customer@example.com')
    const phone = String(params.notes?.customer_phone ?? '')
    const productinfo = String(params.notes?.productinfo ?? `Order ${params.receipt}`)

    const udf1 = String(params.notes?.udf1 ?? '')
    const udf2 = String(params.notes?.udf2 ?? '')
    const udf3 = String(params.notes?.udf3 ?? '')
    const udf4 = String(params.notes?.udf4 ?? '')
    const udf5 = String(params.notes?.udf5 ?? '')

    const successUrl = this.config.extra?.successUrl
    const failureUrl = this.config.extra?.failureUrl

    if (!successUrl || !failureUrl) {
      throw new Error('PayU requires config.extra.successUrl and config.extra.failureUrl')
    }

    const hash = this.buildRequestHash({
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    })

    return {
      gatewayOrderId: txnid,
      amount: Math.round(params.amount * 100),
      currency: params.currency,
      checkoutUrl: `${this.getBaseUrl()}/_payment`,
      checkoutMethod: 'POST',
      checkoutFormFields: {
        key: this.config.apiKey,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        phone,
        surl: successUrl,
        furl: failureUrl,
        hash,
        service_provider: 'payu_paisa',
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
      },
    }
  }

  async verifyPayment(params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    const status = String(params.extra?.status ?? '')
    const amount =
      typeof params.extra?.amount === 'number'
        ? (params.extra.amount as number).toFixed(2)
        : String(params.extra?.amount ?? '')

    const productinfo = String(params.extra?.productinfo ?? '')
    const firstname = String(params.extra?.firstname ?? '')
    const email = String(params.extra?.email ?? '')

    const udf1 = String(params.extra?.udf1 ?? '')
    const udf2 = String(params.extra?.udf2 ?? '')
    const udf3 = String(params.extra?.udf3 ?? '')
    const udf4 = String(params.extra?.udf4 ?? '')
    const udf5 = String(params.extra?.udf5 ?? '')

    const actualSignature = String(params.signature ?? '').toLowerCase()

    if (!status || !amount || !actualSignature) {
      return {
        verified: false,
        gatewayPaymentId: String(params.gatewayPaymentId ?? params.extra?.mihpayid ?? ''),
        gatewayOrderId: String(params.gatewayOrderId ?? params.extra?.txnid ?? ''),
      }
    }

    const expectedSignature = this.buildResponseHash({
      status,
      txnid: String(params.gatewayOrderId ?? params.extra?.txnid ?? ''),
      amount,
      productinfo,
      firstname,
      email,
      udf1,
      udf2,
      udf3,
      udf4,
      udf5,
    }).toLowerCase()

    const verified =
      expectedSignature === actualSignature &&
      status.toLowerCase() === 'success'

    return {
      verified,
      gatewayPaymentId: String(params.gatewayPaymentId ?? params.extra?.mihpayid ?? ''),
      gatewayOrderId: String(params.gatewayOrderId ?? params.extra?.txnid ?? ''),
      // `amount` is one of the fields hashed above, so a verified signature
      // vouches for this figure. Reported only when the signature actually
      // verified — handing back an amount from a failed check would invite a
      // caller to trust it.
      amount: verified && amount !== '' ? Number(amount) : undefined,
    }
  }

  verifyWebhook(params: WebhookVerificationParams): boolean {
    try {
      const form = new URLSearchParams(params.rawBody)

      const status = form.get('status') ?? ''
      const txnid = form.get('txnid') ?? ''
      const amount = form.get('amount') ?? ''
      const productinfo = form.get('productinfo') ?? ''
      const firstname = form.get('firstname') ?? ''
      const email = form.get('email') ?? ''
      const udf1 = form.get('udf1') ?? ''
      const udf2 = form.get('udf2') ?? ''
      const udf3 = form.get('udf3') ?? ''
      const udf4 = form.get('udf4') ?? ''
      const udf5 = form.get('udf5') ?? ''

      const actualSignature = (form.get('hash') ?? params.signature ?? '').toLowerCase()
      if (!actualSignature) return false

      const expectedSignature = this.buildResponseHash({
        status,
        txnid,
        amount,
        productinfo,
        firstname,
        email,
        udf1,
        udf2,
        udf3,
        udf4,
        udf5,
      }).toLowerCase()

      return signaturesMatch(expectedSignature, actualSignature)
    } catch {
      return false
    }
  }

  // PayU's cancel_refund_transaction: hash = sha512(key|command|var1|salt)
  async initiateRefund(params: RefundParams): Promise<RefundResult> {
    const command = 'cancel_refund_transaction'
    const hash = crypto
      .createHash('sha512')
      .update(`${this.config.apiKey}|${command}|${params.gatewayPaymentId}|${this.config.apiSecret}`)
      .digest('hex')

    const body = new URLSearchParams({
      key: this.config.apiKey,
      command,
      var1: params.gatewayPaymentId,       // mihpayid
      var2: params.merchantRefundId,       // our refund reference, becomes PayU's "request_id"
      var3: this.formatAmount(params.amount),
      hash,
    })

    const response = await fetch(this.getInfoApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await response.json().catch(() => ({}))

    // PayU: status 1 = refund request accepted (still needs to settle async).
    if (response.ok && data.status === 1) {
      return { status: 'processing', gatewayRefundId: String(data.request_id ?? params.merchantRefundId), rawResponse: data }
    }

    return {
      status: 'failed',
      gatewayRefundId: null,
      rawResponse: data,
      failureReason: String(data.msg ?? data.message ?? 'PayU refund request was rejected'),
    }
  }

  /**
   * Ask PayU what actually happened to a transaction.
   *
   * The authority for the mobile-SDK flow. The SDK reports its own outcome to
   * the device, but that is a claim made by a client we do not control, so
   * nothing is settled on it — this server-to-server check is what the
   * settlement acts on. See
   * app/api/customer/payments/payu/sdk-result/route.ts.
   */
  async fetchTransactionStatus(txnid: string): Promise<{
    found: boolean
    status: string | null
    amount: number | null
    gatewayPaymentId: string | null
    raw: unknown
  }> {
    const command = 'verify_payment'
    const hash = crypto
      .createHash('sha512')
      .update(`${this.config.apiKey}|${command}|${txnid}|${this.config.apiSecret}`)
      .digest('hex')

    const response = await fetch(this.getInfoApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key: this.config.apiKey, command, var1: txnid, hash }),
    })

    const data = await response.json().catch(() => ({}))
    const details = data?.transaction_details?.[txnid]

    if (!details) {
      return { found: false, status: null, amount: null, gatewayPaymentId: null, raw: data }
    }

    const rawAmount = details.amt ?? details.amount
    const amount = rawAmount === undefined || rawAmount === null || rawAmount === ''
      ? null
      : Number(rawAmount)

    return {
      found: true,
      status: details.status ? String(details.status).toLowerCase() : null,
      amount: Number.isFinite(amount as number) ? (amount as number) : null,
      gatewayPaymentId: details.mihpayid ? String(details.mihpayid) : null,
      raw: data,
    }
  }

  // PayU doesn't push refund-completion webhooks reliably — status is
  // checked on demand via verify_payment, which includes refund_details
  // for the transaction.
  async checkRefundStatus(params: RefundStatusParams): Promise<RefundStatusResult> {
    const command = 'verify_payment'
    const hash = crypto
      .createHash('sha512')
      .update(`${this.config.apiKey}|${command}|${params.gatewayOrderId}|${this.config.apiSecret}`)
      .digest('hex')

    const body = new URLSearchParams({
      key: this.config.apiKey,
      command,
      var1: params.gatewayOrderId,
      hash,
    })

    const response = await fetch(this.getInfoApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })

    const data = await response.json().catch(() => ({}))
    const txnDetails = data?.transaction_details?.[params.gatewayOrderId]
    const refundDetails: Array<{ request_id?: string; id?: string; status?: string }> =
      txnDetails?.refund_details ?? []

    const match = params.gatewayRefundId
      ? refundDetails.find(r => String(r.request_id ?? r.id) === params.gatewayRefundId)
      : refundDetails[0]

    if (!match) {
      return { status: 'processing', rawResponse: data }
    }

    // PayU refund_details status: '0' queued, '1' success/credited, negative = error.
    const statusCode = String(match.status ?? '')
    if (statusCode === '1') return { status: 'completed', rawResponse: data }
    if (statusCode.startsWith('-')) return { status: 'failed', rawResponse: data }
    return { status: 'processing', rawResponse: data }
  }
}