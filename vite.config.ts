import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.base.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Node's built-in test runner handles scripts/render-firestore-rules.test.mjs.
    // Do not let Vitest collect that file as an empty Vitest test suite.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    environment: 'jsdom',
    // Avoid oversubscribing jsdom and starving lazy imports on small CI hosts.
    maxWorkers: 2,
    // Includes cold jsdom/module setup. Individual UI assertions keep their
    // own shorter deadlines; this prevents setup time from consuming them.
    testTimeout: 15_000,
    globals: true,
    // Vitest 5 changed this default; retain the existing test isolation semantics.
    clearMocks: false,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
