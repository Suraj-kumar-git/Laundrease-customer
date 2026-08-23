// lib/payu-native.ts
//
// Drives the native PayU CheckoutPro sheet from the web layer.
//
// registerPlugin() talks to the plugin registered in MainActivity.java over
// Capacitor's injected bridge, by name. That is the whole reason this app can
// use a native payment sheet at all: PayU's own Cordova plugin needs its JS
// injected from local app assets, which never happens for a page loaded from a
// remote server.url.
//
// Flow:
//   1. The caller already has checkout_form_fields from
//      POST /api/customer/orders/[id]/pay — server-built, server-signed values.
//   2. Those become the SDK's payment params. Nothing is invented here.
//   3. While the sheet is open the SDK asks for hashes; each request goes to
//      /api/customer/payments/payu/sdk-hash, which signs only what it can
//      verify against the order. The salt never reaches the device.
//   4. On any terminal outcome we ask the server what really happened rather
//      than believing the sheet — see sdk-result.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface PayUCheckoutResult {
  event: 'success' | 'failure' | 'cancel' | 'error'
  payload?: string
  isTxnInitiated?: boolean
  errorCode?: string | number | null
  errorMessage?: string
}

interface PayUHashRequest {
  hashName: string
  hashString: string
  postSalt?: string
}

interface PayUCheckoutPlugin {
  openCheckout(options: { params: Record<string, unknown> }): Promise<PayUCheckoutResult>
  provideHash(options: { hashName: string; hash: string }): Promise<void>
  addListener(
    eventName: 'payuHashRequired',
    listener: (request: PayUHashRequest) => void
  ): Promise<PluginListenerHandle>
}

const PayUCheckout = registerPlugin<PayUCheckoutPlugin>('PayUCheckout')

/** The subset of checkout_form_fields the SDK needs. */
export interface PayUCheckoutFields {
  key: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  phone: string
  surl: string
  furl: string
  udf1?: string
  udf2?: string
  udf3?: string
  udf4?: string
  udf5?: string
}

export interface PayUSettlement {
  settled: boolean
  payment_status: 'paid' | 'failed' | 'pending'
  order_id: string
  order_number: string
}

/** Whether the native sheet is actually available on this build. */
export function isNativePayUAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PayUCheckout')
}

/**
 * Run the native sheet for an order, then report what the *server* says
 * happened.
 *
 * Resolving does not mean the payment succeeded — check `settled`. A cancelled
 * sheet still resolves, because a cancel after the transaction was initiated
 * can still turn out to be a completed payment, and only the server can tell.
 */
export async function payWithNativePayU(params: {
  orderPublicId: string
  fields: PayUCheckoutFields
  sandbox: boolean
}): Promise<PayUSettlement> {
  const { orderPublicId, fields, sandbox } = params

  // Each request is answered by the server; the salt stays there. Registered
  // before the sheet opens, since the SDK asks for hashes immediately.
  const listener = await PayUCheckout.addListener('payuHashRequired', (request) => {
    void (async () => {
      try {
        const response = await fetch('/api/customer/payments/payu/sdk-hash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: orderPublicId,
            hashName: request.hashName,
            hashString: request.hashString,
            postSalt: request.postSalt,
          }),
        })

        if (!response.ok) {
          // Nothing to hand back. The SDK surfaces its own error and the
          // checkout call resolves via onError.
          console.error('[payu-native] hash request refused', request.hashName, response.status)
          return
        }

        const json = await response.json()
        await PayUCheckout.provideHash({
          hashName: request.hashName,
          hash: json.data.hash,
        })
      } catch (error) {
        console.error('[payu-native] hash round trip failed', error)
      }
    })()
  })

  const udfEntries = ([1, 2, 3, 4, 5] as const)
    .map((n) => [`udf${n}`, fields[`udf${n}` as const] ?? ''] as const)
    .filter(([, value]) => value !== '')
  const udfParams = udfEntries.length > 0 ? Object.fromEntries(udfEntries) : null

  try {
    await PayUCheckout.openCheckout({
      params: {
        payUPaymentParams: {
          key: fields.key,
          transactionId: fields.txnid,
          amount: fields.amount,
          productInfo: fields.productinfo,
          firstName: fields.firstname,
          email: fields.email,
          phone: fields.phone,
          // The SDK's param set has no plain surl/furl — only these. Still
          // needed: some bank pages redirect to them inside the SDK's own web
          // view, and they point at the same routes the browser flow uses, so
          // a payment that finishes that way settles identically.
          android_surl: fields.surl,
          android_furl: fields.furl,
          environment: sandbox ? '1' : '0',
          // Identifies the payer to PayU for saved cards.
          userCredential: `${fields.key}:${fields.email}`,
          // Only non-empty UDFs. The server rebuilds the payment hash with
          // whatever it holds for this order (see payu-sdk-hash.ts) and refuses
          // to sign a string that does not match, so sending an empty udf the
          // SDK would then hash differently is a needless way to fail.
          ...(udfParams ? { additionalParam: udfParams } : {}),
        },
        payUCheckoutProConfig: {
          merchantName: 'Laundrease',
          showExitConfirmationOnCheckoutScreen: true,
        },
      },
    })
  } finally {
    await listener.remove()
  }

  // Deliberately unconditional. Whatever the sheet reported — success,
  // failure, or a cancel that may have happened after the money moved — the
  // server is the one that decides, by asking PayU.
  return confirmWithServer(orderPublicId)
}

async function confirmWithServer(orderPublicId: string): Promise<PayUSettlement> {
  const response = await fetch('/api/customer/payments/payu/sdk-result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderPublicId }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'Could not confirm payment')
  }

  const json = await response.json()
  return json.data as PayUSettlement
}
