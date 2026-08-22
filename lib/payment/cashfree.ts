// lib/payment/cashfree.ts
import crypto from 'crypto'
import { signaturesMatch } from './signature'
import type {
  PaymentGatewayAdapter,
  GatewayConfig,
  GatewayOrderParams,
  GatewayOrder,
  PaymentVerificationParams,
  PaymentVerificationResult,
  WebhookVerificationParams,
  RefundParams,
  RefundResult,
  RefundStatusParams,
  RefundStatusResult,
} from './types'

export class CashfreeAdapter implements PaymentGatewayAdapter {
  readonly provider = 'cashfree'
  private config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  private getBaseUrl(): string {
    return this.config.sandbox
      ? 'https://sandbox.cashfree.com/pg'
      : 'https://api.cashfree.com/pg'
  }

  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-version': '2023-08-01',
      'x-client-id': this.config.apiKey,
      'x-client-secret': this.config.apiSecret,
    }
  }

  async createOrder(params: GatewayOrderParams): Promise<GatewayOrder> {
    const response = await fetch(`${this.getBaseUrl()}/orders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        order_id: params.receipt,
        order_amount: params.amount,
        order_currency: params.currency,
        customer_details: {
          customer_id: String(params.notes?.customer_id ?? params.receipt),
          customer_name: String(params.notes?.customer_name ?? ''),
          customer_email: String(params.notes?.customer_email ?? ''),
          customer_phone: String(params.notes?.customer_phone ?? ''),
        },
        order_meta: {
          return_url: String(this.config.extra?.returnUrl ?? ''),
        },
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Cashfree createOrder failed: ${err?.message ?? response.statusText}`)
    }

    const data = await response.json()

    return {
      gatewayOrderId: data.cf_order_id,
      amount: Math.round(params.amount * 100),
      currency: params.currency,
      paymentSessionId: data.payment_session_id,
    }
  }

  async verifyPayment(params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    // Cashfree: verify by fetching the order status from their API
    const response = await fetch(
      `${this.getBaseUrl()}/orders/${params.extra?.orderId}/payments/${params.gatewayPaymentId}`,
      { headers: this.getHeaders() }
    )

    if (!response.ok) {
      return { verified: false, gatewayPaymentId: params.gatewayPaymentId, gatewayOrderId: params.gatewayOrderId }
    }

    const data = await response.json()
    const verified = data.payment_status === 'SUCCESS'

    // payment_amount comes from Cashfree's own API over a server-to-server
    // call, not from the browser redirect — so unlike a form field it cannot
    // have been touched by the payer. That makes it safe to reconcile against
    // our record (lib/payment/reconcile.ts).
    const reported = data.payment_amount ?? data.order_amount

    return {
      verified,
      gatewayPaymentId: params.gatewayPaymentId,
      gatewayOrderId: params.gatewayOrderId,
      amount: verified && reported != null ? Number(reported) : undefined,
    }
  }

  verifyWebhook(params: WebhookVerificationParams): boolean {
    if (!this.config.webhookSecret) return false
    // Cashfree signs the CONCATENATION of the x-webhook-timestamp header and
    // the raw body, base64. Hashing the body alone (what this did before)
    // never matches a real callback, so the check could only ever fail —
    // which reads as "webhooks don't work" rather than as a bug.
    if (!params.timestamp) return false
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(params.timestamp + params.rawBody)
      .digest('base64')
    return signaturesMatch(expectedSignature, params.signature)
  }

  // Cashfree refunds key off the *order* id, not the payment id.
  async initiateRefund(params: RefundParams): Promise<RefundResult> {
    const response = await fetch(`${this.getBaseUrl()}/orders/${params.gatewayOrderId}/refunds`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        refund_amount: params.amount,
        refund_id:     params.merchantRefundId,
        refund_note:   'Order cancellation refund',
      }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        status: 'failed',
        gatewayRefundId: null,
        rawResponse: data,
        failureReason: String(data?.message ?? 'Cashfree refund request failed'),
      }
    }

    const status = data.refund_status === 'SUCCESS' ? 'completed'
      : data.refund_status === 'FAILED' ? 'failed'
      : 'processing'

    return { status, gatewayRefundId: String(data.cf_refund_id ?? params.merchantRefundId), rawResponse: data }
  }

  async checkRefundStatus(params: RefundStatusParams): Promise<RefundStatusResult> {
    const response = await fetch(
      `${this.getBaseUrl()}/orders/${params.gatewayOrderId}/refunds/${params.merchantRefundId}`,
      { headers: this.getHeaders() }
    )
    const data = await response.json().catch(() => ({}))

    if (!response.ok) return { status: 'processing', rawResponse: data }

    const status = data.refund_status === 'SUCCESS' ? 'completed'
      : data.refund_status === 'FAILED' ? 'failed'
      : 'processing'

    return { status, rawResponse: data }
  }
}
