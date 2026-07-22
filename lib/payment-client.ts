// lib/payment-client.ts
// Client-side helpers for launching a payment-gateway checkout once the
// server has returned gateway data from POST /api/customer/orders/[id]/pay.
// Shared between the order-create flow and the payment-failure retry button
// so all three gateways (PayU, Razorpay, Cashfree) launch identically
// wherever the "Pay" action lives.

export interface GatewayCheckoutData {
  provider: 'razorpay' | 'payu' | 'cashfree'
  sandbox?: boolean
  gateway_order_id?: string | null
  amount: number
  currency: string
  client_key?: string | null
  payment_session_id?: string | null
  checkout_url?: string | null
  checkout_method?: string | null
  checkout_form_fields?: Record<string, string> | null
}

export function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve()
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.body.appendChild(s)
  })
}

export async function ensureProviderScripts(): Promise<void> {
  if (!(window as any).Razorpay) {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js')
  }
  if (!(window as any).Cashfree) {
    await loadScript('https://sdk.cashfree.com/js/ui/2.0.0/cashfree.prod.js')
  }
}

export function redirectToGatewayForm(actionUrl: string, fields: Record<string, string>) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = actionUrl

  Object.entries(fields).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = value
    form.appendChild(input)
  })

  document.body.appendChild(form)
  form.submit()
}

/**
 * Launches the right checkout UI for whichever gateway is active.
 *
 * PayU and Cashfree navigate the browser away from the app (form POST /
 * SDK redirect) — control only returns via the server-side callback
 * routes, which redirect to /customer/orders/payment/success|failure.
 *
 * Razorpay opens an in-page modal — on success, `onRazorpaySuccess` is
 * awaited (it should call /api/customer/payments/verify); on dismiss or
 * verify failure, this function rejects so the caller can react (e.g.
 * redirect to the failure page) without leaving the SPA.
 */
export async function launchGatewayCheckout(
  data: GatewayCheckoutData,
  opts: {
    orderNumber: string
    customerName?: string
    customerEmail?: string
    onRazorpaySuccess: (paymentId: string, signature: string, gatewayOrderId: string) => Promise<void>
  }
): Promise<void> {
  if (data.provider === 'payu') {
    if (!data.checkout_url || !data.checkout_form_fields) {
      throw new Error('Missing PayU checkout details')
    }
    redirectToGatewayForm(data.checkout_url, data.checkout_form_fields)
    return
  }

  if (data.provider === 'cashfree') {
    if (!data.payment_session_id) {
      throw new Error('Missing Cashfree payment session')
    }
    await ensureProviderScripts()
    const cashfree = (window as any).Cashfree({ mode: data.sandbox ? 'sandbox' : 'production' })
    await cashfree.checkout({
      paymentSessionId: data.payment_session_id,
      redirectTarget: '_self',
    })
    return
  }

  if (data.provider === 'razorpay') {
    if (!data.client_key || !data.gateway_order_id) {
      throw new Error('Missing Razorpay client key or order id')
    }
    await ensureProviderScripts()

    await new Promise<void>((resolve, reject) => {
      const rzp = new (window as any).Razorpay({
        key: data.client_key,
        order_id: data.gateway_order_id,
        amount: data.amount,
        currency: data.currency,
        name: 'Laundrease',
        description: `Order #${opts.orderNumber}`,
        prefill: { name: opts.customerName ?? '', email: opts.customerEmail ?? '' },
        theme: { color: '#7c3aed' },
        handler: async (response: any) => {
          try {
            await opts.onRazorpaySuccess(
              response.razorpay_payment_id,
              response.razorpay_signature,
              response.razorpay_order_id
            )
            resolve()
          } catch (err) {
            reject(err)
          }
        },
        modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
      })
      rzp.open()
    })
    return
  }

  throw new Error('Unsupported payment provider')
}
