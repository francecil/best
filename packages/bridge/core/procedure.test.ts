import { describe, expect, it, vi } from 'vitest';
import { mutation, query, subscription } from './procedure';

describe('procedure builders', () => {
  it('query marks meta and runs handler', async () => {
    const handler = vi.fn(async (x: number) => x * 2);
    const p = query(handler);

    expect(p._meta).toEqual({ type: 'query' });
    await expect(p.handler(21)).resolves.toBe(42);
    expect(handler).toHaveBeenCalledWith(21);
  });

  it('mutation marks meta', async () => {
    const p = mutation(async () => 'ok');
    expect(p._meta).toEqual({ type: 'mutation' });
    await expect(p.handler(undefined)).resolves.toBe('ok');
  });

  it('subscription passes emit and returns cleanup', () => {
    const emissions: string[] = [];
    const cleaned: string[] = [];
    const p = subscription<string>((emit) => {
      emit('a');
      return () => cleaned.push('done');
    });

    expect(p._meta).toEqual({ type: 'subscription' });
    const cleanup = (p.handler as (emit: (d: string) => void) => () => void)((d) => {
      emissions.push(d);
    });
    expect(emissions).toEqual(['a']);
    cleanup();
    expect(cleaned).toEqual(['done']);
  });
});
