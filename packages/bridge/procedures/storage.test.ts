import { describe, expect, it } from 'vitest';
import { storageProcedures } from './storage';

describe('storageProcedures', () => {
  it('local.get is a query', () => {
    expect(storageProcedures.local.get._meta.type).toBe('query');
    expect(typeof storageProcedures.local.get.handler).toBe('function');
  });

  it('local.set is a mutation', () => {
    expect(storageProcedures.local.set._meta.type).toBe('mutation');
  });

  it('local.remove is a mutation', () => {
    expect(storageProcedures.local.remove._meta.type).toBe('mutation');
  });

  it('local.clear is a mutation', () => {
    expect(storageProcedures.local.clear._meta.type).toBe('mutation');
  });

  it('sync.get is a query', () => {
    expect(storageProcedures.sync.get._meta.type).toBe('query');
  });

  it('sync.set is a mutation', () => {
    expect(storageProcedures.sync.set._meta.type).toBe('mutation');
  });

  it('sync.remove is a mutation', () => {
    expect(storageProcedures.sync.remove._meta.type).toBe('mutation');
  });

  it('sync.clear is a mutation', () => {
    expect(storageProcedures.sync.clear._meta.type).toBe('mutation');
  });

  it('onChanged is a subscription', () => {
    expect(storageProcedures.onChanged._meta.type).toBe('subscription');
    expect(typeof storageProcedures.onChanged.handler).toBe('function');
  });
});
