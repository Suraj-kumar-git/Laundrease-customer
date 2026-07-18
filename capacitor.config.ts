import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.laundrease.customer',
  appName: 'Laundrease',
  webDir: 'www',
  server: {
    url: 'https://laundrease.in',
    androidScheme: 'https',
  },
};

export default config;
