import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.base.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // Node's built-in test runner handles scripts/render-firestore-rules.test.mjs.
    // Do not let Vitest collect that file as an empty Vitest test suite.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
