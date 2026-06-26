// lib/payment/types.ts

export interface GatewayOrderParams {
  amount: number          // in INR (NOT paise — we convert internally)
  currency: string        // 'INR'
  receipt: string         // order_number
  notes?: Record<string, string>
}

export interface GatewayOrder {
  gatewayOrderId: string  // Razorpay order_id / Cashfree cf_order_id
  amount: number          // in paise/smallest unit (as returned by gateway)
  currency: string
  // Razorpay: key_id needed on frontend for checkout modal
  clientKey?: string
  // Cashfree: payment_session_id needed on frontend
  paymentSessionId?: string
  // PayU / generic hosted checkout
  checkoutUrl?: string
  checkoutMethod?: 'GET' | 'POST'
  checkoutFormFields?: Record<string, string>
}

export interface PaymentVerificationParams {
  gatewayOrderId: string
  gatewayPaymentId: string
  signature: string
  // Extra params some gateways need
  extra?: Record<string, string>
}

export interface PaymentVerificationResult {
  verified: boolean
  gatewayPaymentId: string
  gatewayOrderId: string
}

export interface WebhookVerificationParams {
  rawBody: string
  signature: string
  provider: string
}

export interface RefundParams {
  gatewayOrderId:   string  // PayU: txnid. Cashfree: cf_order_id (merchant order id also works).
  gatewayPaymentId: string  // PayU: mihpayid. Cashfree: cf_payment_id.
  merchantRefundId: string  // our own unique id for this refund attempt
  amount:           number  // INR
}

export interface RefundResult {
  // 'completed' is rare on initiation — most gateways return 'processing' and confirm async.
  status:           'processing' | 'completed' | 'failed'
  gatewayRefundId:  string | null
  rawResponse:      Record<string, unknown>
  failureReason?:   string
}

export interface RefundStatusParams {
  gatewayOrderId:    string
  merchantRefundId:  string
  gatewayRefundId:   string | null
}

export interface RefundStatusResult {
  status:       'processing' | 'completed' | 'failed'
  rawResponse:  Record<string, unknown>
}

/**
 * Common interface all payment gateway adapters must implement.
 */
export interface PaymentGatewayAdapter {
  readonly provider: string

  /** Create a gateway order. Returns data needed by the frontend checkout. */
  createOrder(params: GatewayOrderParams): Promise<GatewayOrder>

  /** Verify payment signature after frontend completes payment. */
  verifyPayment(params: PaymentVerificationParams): Promise<PaymentVerificationResult>

  /** Verify webhook signature. */
  verifyWebhook(params: WebhookVerificationParams): boolean

  /** Initiate a refund to the original payment method. Not all adapters implement this. */
  initiateRefund?(params: RefundParams): Promise<RefundResult>

  /** Poll the gateway for a refund's current status. Not all adapters implement this. */
  checkRefundStatus?(params: RefundStatusParams): Promise<RefundStatusResult>
}

export interface GatewayConfig {
  apiKey: string
  apiSecret: string
  webhookSecret: string | null
  sandbox: boolean
  currency: string
  extra: Record<string, any>
}
