import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Includes starting/stopping persistent profiles; assertions retain their
  // shorter timeouts so slow synchronization still fails at its own check.
  testDir: './e2e', workers: 1, timeout: 90_000, retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4175',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: process.env.HEARTHFIRE_CHROMIUM_ARGS ? JSON.parse(process.env.HEARTHFIRE_CHROMIUM_ARGS) : [],
    },
    trace: 'retain-on-failure',
  },
  webServer: { command: 'npx vite --config vite.sync.config.ts', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
