import type { CapacitorConfig } from '@capacitor/cli'

// Thin native shell — the WKWebView loads the live production site directly.
// No local web assets are bundled; webDir only needs to exist for `cap add`
// to have something to copy in as an initial fallback screen.
const config: CapacitorConfig = {
  appId: 'in.laundrease.customer',
  appName: 'Laundrease',
  webDir: 'public',
  server: {
    url: 'https://laundrease.in',
    // Payment gateways navigate the WKWebView away from our own origin
    // (PayU: hidden-form POST redirect; Cashfree: SDK checkout with
    // redirectTarget: '_self') or load a third-party script (Razorpay,
    // Cashfree). Our own callback routes (/api/customer/payments/*) stay
    // on laundrease.in and don't need an entry here.
    allowNavigation: [
      'checkout.razorpay.com',
      'api.razorpay.com',
      '*.razorpay.com',
      'sdk.cashfree.com',
      '*.cashfree.com',
      'secure.payu.in',
      'test.payu.in',
      'info.payu.in',
      '*.payu.in',
    ],
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#ffffff',
    },
  },
}

export default config
