import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry';

describe('withRetry()', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { attempts: 3, delay: 100 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries and succeeds on the second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { attempts: 2, delay: 100 });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    // Run timers concurrently with the promise so rejections are always attached
    const [result] = await Promise.allSettled([
      withRetry(fn, { attempts: 2, delay: 50 }),
      vi.runAllTimersAsync(),
    ]);

    expect(result.status).toBe('rejected');
    expect((result as PromiseRejectedResult).reason.message).toBe('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('does not retry when attempts = 0', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('no retry'));

    await expect(withRetry(fn, { attempts: 0, delay: 100 })).rejects.toThrow('no retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff delays', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { attempts: 2, delay: 100, backoff: 'exponential' });
    await vi.runAllTimersAsync();
    await promise;

    expect(delays[0]).toBe(100); // 100 * 2^0
    expect(delays[1]).toBe(200); // 100 * 2^1
  });

  it('uses linear backoff delays', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { attempts: 2, delay: 100, backoff: 'linear' });
    await vi.runAllTimersAsync();
    await promise;

    expect(delays[0]).toBe(100); // 100 * 1
    expect(delays[1]).toBe(200); // 100 * 2
  });

  it('uses constant delay when no backoff is set', async () => {
    const delays: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: any, ms?: number) => {
      if (ms !== undefined && ms > 0) delays.push(ms);
      return originalSetTimeout(fn, 0) as any;
    });

    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const promise = withRetry(fn, { attempts: 2, delay: 150 });
    await vi.runAllTimersAsync();
    await promise;

    expect(delays[0]).toBe(150);
    expect(delays[1]).toBe(150);
  });
});
