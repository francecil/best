import { describe, expect, it } from 'vitest';
import { cookiesProcedures } from './cookies';

describe('cookiesProcedures', () => {
  it('get is a query', () => {
    expect(cookiesProcedures.get._meta.type).toBe('query');
    expect(typeof cookiesProcedures.get.handler).toBe('function');
  });

  it('getAll is a query', () => {
    expect(cookiesProcedures.getAll._meta.type).toBe('query');
  });

  it('set is a mutation', () => {
    expect(cookiesProcedures.set._meta.type).toBe('mutation');
  });

  it('remove is a mutation', () => {
    expect(cookiesProcedures.remove._meta.type).toBe('mutation');
  });

  it('onChanged is a subscription', () => {
    expect(cookiesProcedures.onChanged._meta.type).toBe('subscription');
    expect(typeof cookiesProcedures.onChanged.handler).toBe('function');
  });
});
