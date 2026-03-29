/**
 * E2E Test Setup
 *
 * 确保测试环境就绪
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll } from 'vitest';

beforeAll(() => {
  // 检查扩展是否已构建
  const extensionPath = resolve(__dirname, '../.output/chrome-mv3');

  if (!existsSync(extensionPath)) {
    throw new Error(
      'Extension not built! Please run "pnpm build" before running E2E tests.',
    );
  }

  // 检查测试服务器（这个检查是可选的，测试会自动等待）
  console.log('✓ Extension build found at:', extensionPath);
  console.log('✓ E2E test environment ready');
});
