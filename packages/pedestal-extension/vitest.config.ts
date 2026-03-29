import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'pedestal-extension-e2e',
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    hookTimeout: 30000,
    include: ['tests/**/*.e2e.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    globalSetup: ['./tests/global-setup.ts'],
  },
});
