# PayU native checkout (Android)

The Android app pays through PayU's native CheckoutPro sheet. Browsers keep the
original hosted-checkout form POST, unchanged. Both settle through the same
code.

## What actually changed

The app was never being thrown out to an external browser — `allowNavigation:
['payu.in', '*.payu.in']` in `capacitor.config.ts` already kept PayU's hosted
page inside the WebView. What changed is that customers now get a **native**
payment sheet instead of a web page rendered inside the app: UPI that
app-switches to GPay/PhonePe and back, native card entry, and no browser
chrome mid-payment.

## Why a hand-written plugin

PayU ships an official Cordova plugin (`cordova-payu-checkoutpro`, actively
maintained). It cannot be used here. Cordova plugin JS is injected from local
app assets, and this app loads a **remote** URL (`server.url`), so that
injection never happens — a known Capacitor limitation. The only Capacitor
package (`payu-checkoutpro-capacitor`) is `0.0.0-alpha.1`, pinned to Capacitor
6, and untouched since mid-2025.

So `PayUCheckoutPlugin.java` binds `in.payu:payu-checkout-pro` directly.
Capacitor plugins work fine on a remote page, because `registerPlugin()`
resolves over the injected native bridge by name — the same mechanism the
existing push, camera and splash plugins already rely on.

## The three paths

| Where | Path |
|---|---|
| Android app with the plugin | Native CheckoutPro sheet → server verifies → stays in the app |
| Android app, older APK | Hosted checkout in the WebView (unchanged) |
| Browser | Hosted checkout form POST (unchanged) |

`lib/payment-client.ts` picks at runtime and falls back on its own, so the web
deploy and the APK can ship independently — the same arrangement as native
OAuth.

## The hash endpoint, and why it is not what PayU's docs describe

PayU's documented integration is: the SDK gives you a `hashString`, your server
appends the salt, returns SHA-512. Their words: *"there is no need to know the
formula."*

**Do not implement that literally.** An endpoint that signs arbitrary strings
with the merchant salt is a signing oracle. The salt never leaks, but it does
not have to — a caller can request the *payment* hash for a ₹1 payment against
a ₹5,000 order, and PayU will honour it, because a correct signature is exactly
what PayU checks. `lib/payment/reconcile.ts` already exists because a valid
signature is not proof the right amount moved; a naive hash endpoint reopens
that hole one step earlier, before the money moves at all.

`lib/payment/payu-sdk-hash.ts` is where the rules live:

- **The payment hash is never signed from client input.** It is rebuilt from
  the `payments` row and signed only on a byte-for-byte match. Alter the
  amount, the txnid, or anything else, and the request is refused.
- **Command hashes** are matched against a closed list and shape-checked, so a
  payment string cannot be smuggled through wearing a permitted command name.
- Everything else is refused and logged. Fail-closed is the right default for
  something holding a signing key. If a legitimate SDK flow ever needs a
  command that is not on the list, add it deliberately.

Every request is also bound to the authenticated caller's own order.

## Settlement

The SDK reports the outcome to the device. That is a claim from a client we do
not control, so it settles nothing. `sdk-result/route.ts` ignores it and asks
PayU directly via `verify_payment`, then hands the answer to
`settleFromWebhook()` — the same idempotent, monotonic path the webhook uses.

This matters because both signals arrive. The SDK callback and PayU's
server-to-server webhook race each other, and whichever lands second must be a
no-op rather than a second write. Reusing the settle path is what guarantees
that, and it is also what covers the case where the app is killed mid-payment
and the SDK callback never arrives at all.

Note that a **cancelled** sheet is still verified. `onPaymentCancel` can fire
with `isTxnInitiated = true` after the money has moved; treating cancel as
"nothing happened" would strand a real payment.

## Files

| File | Role |
|---|---|
| `android/.../PayUCheckoutPlugin.java` | Native sheet; forwards hash requests to the web layer |
| `android/.../MainActivity.java` | Registers the plugin (app-module plugins are not auto-discovered) |
| `lib/payu-native.ts` | JS side: launches the sheet, brokers hashes, confirms with the server |
| `lib/payment/payu-sdk-hash.ts` | What may be signed, and what may not |
| `api/.../payu/sdk-hash/route.ts` | Signs one authorised hash |
| `api/.../payu/sdk-result/route.ts` | Verifies with PayU, settles |
| `lib/payment/payu.ts` | `buildPaymentHashPreSalt`, `signMobileSdkHash`, `fetchTransactionStatus` |

## Testing

Sandbox is driven by the gateway config's `sandbox` flag, which reaches the SDK
as `environment: '1'`. Use PayU's test cards; UPI intent cannot be tested on an
emulator without GPay/PhonePe installed, so exercise that on a real device.

Production still needs the PayU account activation listed in `To-Dos.txt`
(Business PAN, KYC, bank details). That gates real money on the web flow too —
it is not specific to the SDK.
