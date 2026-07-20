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
  // @capacitor/status-bar and @capacitor/splash-screen are not installed —
  // their published Swift source (status-bar@8.0.3, splash-screen@8.0.2,
  // including the latest nightly) fails to compile against the resolved
  // Capacitor core (bridge.webView/viewController, PluginConfig.getString,
  // CAPPluginCall.reject, and single-arg getInt/getBool all reported
  // missing by the Swift compiler) — a real upstream incompatibility, not
  // a version we could pin around. Status bar falls back to iOS's default
  // (UIViewControllerBasedStatusBarAppearance, already set in Info.plist);
  // the LaunchScreen storyboard still shows and self-dismisses on first
  // frame per standard iOS behavior, just without an explicit JS-driven
  // hide. Revisit once this is fixed upstream or can be debugged on a Mac.
}

export default config
