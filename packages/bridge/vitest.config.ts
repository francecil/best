import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'extension-bridge',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'example/**'],
    environment: 'happy-dom',
    globals: false,
    passWithNoTests: true,
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['core/**/*.ts', 'connector/**/*.ts', 'procedures/**/*.ts', 'index.ts'],
      exclude: [
        '**/*.d.ts',
        '**/*.{test,spec}.ts',
        'example/**',
        'scripts/**',
      ],
    },
  },
});
