import { defineConfig, mergeConfig } from 'vite';
import base from './vite.base.config';

// Emulator-only entry point. Production builds use vite.config.ts and main.tsx.
export default mergeConfig(base, defineConfig({
  define: Object.fromEntries(Object.entries({
    API_KEY: 'demo-key', AUTH_DOMAIN: 'localhost', PROJECT_ID: 'demo-hearthfire',
    STORAGE_BUCKET: 'demo-hearthfire', MESSAGING_SENDER_ID: 'demo', APP_ID: 'demo',
  }).map(([key, value]) => ['import.meta.env.VITE_FIREBASE_' + key, JSON.stringify(value)])),
  plugins: [{ name: 'emulator-entry', transformIndexHtml: (html) => html.replace('/src/main.tsx', '/e2e/fixture.tsx') }],
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
}));
