import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ironarpit.idstudio',
  appName: 'ID STUDIO',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
