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
    // Only the two providers we actually offer. Left at the plugin's default
    // (all four on), the APK would also carry the Apple and Twitter SDKs for
    // sign-in methods this app does not have — dead weight, and third-party
    // code in the bundle that privacy scanners will ask about. `npx cap sync`
    // reads this and regenerates the plugin's gradle.properties from it.
    SocialLogin: {
      providers: {
        google: true,
        facebook: true,
        apple: false,
        twitter: false,
      },
    },
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
      showSpinner: true,
      spinnerColor: '#2563eb',
      androidSpinnerStyle: 'large',
    },
  },
};

export default config;
