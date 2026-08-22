// lib/payment/razorpay.ts
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
} from './types'

export class RazorpayAdapter implements PaymentGatewayAdapter {
  readonly provider = 'razorpay'
  private config: GatewayConfig

  constructor(config: GatewayConfig) {
    this.config = config
  }

  private getBaseUrl(): string {
    // Razorpay does not have a separate sandbox URL — sandbox is controlled by test keys
    return 'https://api.razorpay.com/v1'
  }

  private getAuthHeader(): string {
    return 'Basic ' + Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString('base64')
  }

  async createOrder(params: GatewayOrderParams): Promise<GatewayOrder> {
    const response = await fetch(`${this.getBaseUrl()}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        amount: Math.round(params.amount * 100), // INR → paise
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes ?? {},
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Razorpay createOrder failed: ${err?.error?.description ?? response.statusText}`)
    }

    const data = await response.json()

    return {
      gatewayOrderId: data.id,
      amount: data.amount,
      currency: data.currency,
      clientKey: this.config.apiKey, // Sent to frontend for Razorpay checkout modal
    }
  }

  async verifyPayment(params: PaymentVerificationParams): Promise<PaymentVerificationResult> {
    // Razorpay signature: HMAC-SHA256(key_secret, "razorpay_order_id|razorpay_payment_id")
    const payload = `${params.gatewayOrderId}|${params.gatewayPaymentId}`
    const expectedSignature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(payload)
      .digest('hex')

    const verified = expectedSignature === params.signature

    return {
      verified,
      gatewayPaymentId: params.gatewayPaymentId,
      gatewayOrderId: params.gatewayOrderId,
    }
  }

  verifyWebhook(params: WebhookVerificationParams): boolean {
    if (!this.config.webhookSecret) return false
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(params.rawBody)
      .digest('hex')
    return signaturesMatch(expectedSignature, params.signature)
  }
}
