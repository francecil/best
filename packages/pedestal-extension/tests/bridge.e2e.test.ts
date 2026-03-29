/**
 * Bridge E2E Tests
 *
 * 这些测试模拟真实的浏览器环境，验证 Bridge 的所有功能
 * 使用 vitest + puppeteer 来自动化测试
 */

import type { BrowserContext, Page } from 'playwright';
import { resolve as pathResolve } from 'node:path';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

interface WithTestClient {
  testClient?: {
    extensions?: {
      onChanged?: {
        subscribe: (cb: () => void) => () => void;
      };
    };
  };
}

describe('Bridge E2E Tests', () => {
  let context: BrowserContext;
  let page: Page;
  let extensionId: string;

  const EXTENSION_PATH = pathResolve(__dirname, '../.output/chrome-mv3');
  const TEST_URL = 'http://127.0.0.1:8765/bridge-test.html';

  beforeAll(async () => {
    // 启动 Chromium 并加载扩展
    context = await chromium.launchPersistentContext('', {
      headless: false, // 扩展需要有头模式
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    // 获取扩展 ID
    const serviceWorkerPage = await context.waitForEvent('page', {
      predicate: p => p.url().includes('chrome-extension://'),
      timeout: 10000,
    }).catch(() => null);

    if (serviceWorkerPage) {
      const url = new URL(serviceWorkerPage.url());
      extensionId = url.hostname;
      console.log(`Extension loaded with ID: ${extensionId}`);
    }

    // 打开测试页面
    page = await context.newPage();
    await page.goto(TEST_URL);

    // 等待页面加载完成
    await page.waitForLoadState('networkidle');

    // 等待 Bridge 连接
    await page.waitForFunction(() => {
      const dot = document.getElementById('connection-dot');
      return dot?.classList.contains('connected');
    }, { timeout: 10000 });

    console.log('Bridge connected successfully');
  }, 30000);

  afterAll(async () => {
    await context?.close();
  });

  describe('Connection and Initialization', () => {
    it('should connect to bridge successfully', async () => {
      const connectionStatus = await page.textContent('#connection-text');
      expect(connectionStatus).toBe('已连接');
    });

    it('should show green connection indicator', async () => {
      const dot = page.locator('#connection-dot');
      const classes = await dot.getAttribute('class');
      expect(classes).toContain('connected');
    });
  });

  describe('P0 Critical Fixes', () => {
    it('Test 1: Multi-client subscription isolation', async () => {
      // 点击测试按钮
      await page.click('button[onclick="testMultiClientSubscription()"]');

      // 等待测试完成
      await page.waitForFunction(() => {
        const status = document.getElementById('status-p0-1')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 10000 });

      // 检查测试结果
      const status = await page.textContent('#status-p0-1');
      expect(status).toContain('✓ 通过');
    });

    it('Test 2: Subscription limit enforcement', async () => {
      await page.click('button[onclick="testSubscriptionLimit()"]');

      await page.waitForFunction(() => {
        const status = document.getElementById('status-p0-2')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 15000 });

      const status = await page.textContent('#status-p0-2');
      expect(status).toContain('✓ 通过');
    });
  });

  describe('P1 High Priority Fixes', () => {
    it('Test 3: Event buffering during subscription', async () => {
      await page.click('button[onclick="testEventBuffering()"]');

      await page.waitForFunction(() => {
        const status = document.getElementById('status-p1-1')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 10000 });

      const status = await page.textContent('#status-p1-1');
      expect(status).toContain('✓ 通过');
    });

    it('Test 4: Subscription error handling', async () => {
      await page.click('button[onclick="testSubscriptionErrorHandling()"]');

      await page.waitForFunction(() => {
        const status = document.getElementById('status-p1-2')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 5000 });

      const status = await page.textContent('#status-p1-2');
      expect(status).toContain('✓ 通过');
    });
  });

  describe('Basic Functionality', () => {
    it('Test 5: Query operation', async () => {
      await page.click('button[onclick="testQuery()"]');

      await page.waitForFunction(() => {
        const status = document.getElementById('status-basic-1')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 5000 });

      const status = await page.textContent('#status-basic-1');
      expect(status).toContain('✓ 通过');

      // 验证结果显示扩展列表
      const result = await page.textContent('#result-basic-1');
      expect(result).toContain('成功查询到');
      expect(result).toMatch(/\d+ 个扩展/);
    });
  });

  describe('Performance Tests', () => {
    it('Test 7: Concurrent queries performance', async () => {
      await page.click('button[onclick="testConcurrentQueries()"]');

      await page.waitForFunction(() => {
        const status = document.getElementById('status-perf-1')?.textContent;
        return status?.includes('通过') || status?.includes('失败');
      }, { timeout: 30000 });

      const status = await page.textContent('#status-perf-1');
      expect(status).toContain('✓ 通过');

      // 验证性能指标
      const result = await page.textContent('#result-perf-1');
      expect(result).toContain('100');
      expect(result).toContain('queries/sec');
    });
  });

  describe('Run All Tests', () => {
    it('should run all automated tests successfully', async () => {
      // 清空之前的测试结果
      await page.click('button[onclick="clearLogs()"]');
      await page.waitForTimeout(500);

      // 运行所有测试
      await page.click('button[onclick="runAllTests()"]');

      // 等待所有测试完成（最多 60 秒）
      await page.waitForFunction(() => {
        const logs = document.getElementById('log-container')?.textContent || '';
        return logs.includes('所有自动化测试完成');
      }, { timeout: 60000 });

      // 检查统计数据
      const passed = await page.textContent('#stat-passed');
      const failed = await page.textContent('#stat-failed');
      const total = await page.textContent('#stat-total');

      console.log(`Test Results: ${passed}/${total} passed, ${failed} failed`);

      // 至少应该有 6 个测试通过（Test 6 需要手动触发，可能不会通过）
      expect(Number.parseInt(passed || '0')).toBeGreaterThanOrEqual(6);
      expect(Number.parseInt(failed || '0')).toBeLessThanOrEqual(1);
    }, 70000);
  });

  describe('Logs and Debugging', () => {
    it('should display logs correctly', async () => {
      const logContainer = await page.textContent('#log-container');
      expect(logContainer).toBeTruthy();
      expect(logContainer?.length || 0).toBeGreaterThan(0);
    });

    it('should show console logs from Bridge', async () => {
      const consoleLogs: string[] = [];

      page.on('console', (msg) => {
        consoleLogs.push(msg.text());
      });

      // 触发一个查询
      await page.evaluate(() => {
        (globalThis as { testQuery?: () => void }).testQuery?.();
      });

      await page.waitForTimeout(2000);

      // 应该有 Bridge 相关的日志
      const hasClientLogs = consoleLogs.some(log => log.includes('[Client]'));
      expect(hasClientLogs).toBe(true);
    });
  });

  describe('Connection Resilience', () => {
    it('should handle page reload gracefully', async () => {
      // 重新加载页面
      await page.reload();

      // 等待重新连接
      await page.waitForFunction(() => {
        const dot = document.getElementById('connection-dot');
        return dot?.classList.contains('connected');
      }, { timeout: 10000 });

      const status = await page.textContent('#connection-text');
      expect(status).toBe('已连接');
    });
  });

  describe('Memory and Resource Management', () => {
    it('should handle multiple subscription cleanup cycles', async () => {
      const runCleanupCycle = async () => {
        await page.evaluate(() => {
          function runSubscriptionCleanupBatch(): Promise<void> {
            return new Promise((resolve) => {
              const unsubscribers: Array<() => void> = [];
              const bridge = (globalThis as WithTestClient).testClient;

              for (let i = 0; i < 10; i++) {
                const unsub = bridge?.extensions?.onChanged?.subscribe(() => {});
                if (unsub) {
                  unsubscribers.push(unsub);
                }
              }

              setTimeout(() => {
                unsubscribers.forEach(unsub => unsub());
                resolve();
              }, 100);
            });
          }

          return runSubscriptionCleanupBatch();
        });
        await page.waitForTimeout(500);
      };

      await runCleanupCycle();
      await runCleanupCycle();
      await runCleanupCycle();

      // 验证页面仍然连接
      const status = await page.textContent('#connection-text');
      expect(status).toBe('已连接');
    });
  });
});
