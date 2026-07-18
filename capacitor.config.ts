import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.laundrease.customer',
  appName: 'Laundrease',
  webDir: 'www',
  server: {
    url: 'https://laundrease.in',
    androidScheme: 'https',
    // Keep PayU's hosted checkout inside the app's WebView instead of
    // handing off to the system browser — the browser has its own cookie
    // jar, so a hand-off here means the payment redirect lands in a
    // different (or logged-out) session than the one that started checkout.
    allowNavigation: ['payu.in', '*.payu.in'],
  },
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'LIGHT',
      backgroundColor: '#2563eb',
    },
  },
};

export default config;
