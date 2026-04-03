import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './__tests__/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30_000,
  retries: 1,
  use: {
    // Chrome extension testing requires headed mode or a real browser binary
    browserName: 'chromium',
    headless: true,
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
