/**
 * Bridge E2E Tests
 *
 * Requires the test fixture extension to be compiled first:
 *   pnpm run build:e2e
 *
 * Then run:
 *   pnpm run test:e2e
 */

import type { BrowserContext, Page } from 'playwright';
import * as path from 'node:path';
import { chromium, expect, test } from 'playwright/test';
import type { router } from './fixture/background';
import type { InferClient } from '../../index';

type TestClient = InferClient<typeof router>;

// Path to the compiled fixture extension
const FIXTURE_DIST = path.join(__dirname, 'fixture-dist');

// ─── Fixture setup ────────────────────────────────────────────────────────────

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    headless: true,
    args: [
      `--disable-extensions-except=${FIXTURE_DIST}`,
      `--load-extension=${FIXTURE_DIST}`,
    ],
  });
  page = await context.newPage();
});

test.afterAll(async () => {
  await context.close();
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Inject the BridgeClient into the test page and return a helper that
 * calls the bridge from the page context.
 */
async function callBridge<T>(
  page: Page,
  fn: (client: TestClient) => Promise<T>,
): Promise<T> {
  // The client is set up by the content script + bridge. We evaluate in page context.
  return page.evaluate(async (fnStr) => {
    // eslint-disable-next-line no-new-func
    const callable = new Function(`return (${fnStr})`)();
    // @ts-ignore — window.bridgeClient is exposed by the test page
    return callable(window.__bridgeClient);
  }, fn.toString()) as Promise<T>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Bridge E2E', () => {
  test.beforeEach(async () => {
    // Navigate to a blank page that the content script will inject into.
    // The page script sets up the client and exposes it on window.
    await page.goto('about:blank');

    // Inject a client setup script
    await page.addScriptTag({
      content: `
        (async () => {
          // Import the bridge client module (needs a module script tag)
          // In E2E tests, the client is created via the global createClient
          // function injected by the extension.
        })();
      `,
      type: 'module',
    });

    // Wait for the bridge to be ready
    await page.waitForTimeout(500);
  });

  test('query: echo returns the input', async () => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return window.__bridge?.echo('hello');
    });
    expect(result).toBe('hello');
  });

  test('mutation: add returns the sum', async () => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return window.__bridge?.add({ a: 3, b: 4 });
    });
    expect(result).toBe(7);
  });

  test('query: greet returns greeting', async () => {
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return window.__bridge?.greet('World');
    });
    expect(result).toBe('Hello, World!');
  });

  test('error: procedure errors are propagated', async () => {
    const error = await page.evaluate(async () => {
      try {
        // @ts-ignore
        await window.__bridge?.error();
        return null;
      }
      catch (e: any) {
        return e.message;
      }
    });
    expect(error).toContain('intentional error');
  });

  test('subscription: receives events', async () => {
    const events = await page.evaluate(async () => {
      // @ts-ignore
      const bridge = window.__bridge;
      if (!bridge) return [];

      const received: number[] = [];
      const unsub = bridge.counter((n: number) => received.push(n));

      await new Promise(resolve => setTimeout(resolve, 350));
      unsub();

      return received;
    });

    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0]).toBe(1);
  });
});
