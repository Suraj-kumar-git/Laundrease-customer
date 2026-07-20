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
    SplashScreen: {
      // Stays up (with a spinner) until the web app explicitly hides it,
      // once laundrease.in has actually loaded over the network — see
      // components/capacitor-splash.tsx.
      launchAutoHide: false,
      backgroundColor: '#ffffffff',
      // Default is FIT_XY, which stretches the image to fill the screen
      // non-uniformly (distorting a wide rectangular logo). CENTER_INSIDE
      // scales it down to fit entirely on-screen preserving its aspect
      // ratio — the whole logo stays visible and undistorted, with the
      // matching white backgroundColor filling the padding around it.
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: true,
      spinnerColor: '#2563eb',
      androidSpinnerStyle: 'large',
    },
  },
};

export default config;
