import { describe, expect, it } from 'vitest';
import { runtimeProcedures } from './runtime';

describe('runtimeProcedures', () => {
  it('getManifest is a query', () => {
    expect(runtimeProcedures.getManifest._meta.type).toBe('query');
    expect(typeof runtimeProcedures.getManifest.handler).toBe('function');
  });

  it('getURL is a query', () => {
    expect(runtimeProcedures.getURL._meta.type).toBe('query');
  });

  it('getPlatformInfo is a query', () => {
    expect(runtimeProcedures.getPlatformInfo._meta.type).toBe('query');
  });

  it('sendMessage is a mutation', () => {
    expect(runtimeProcedures.sendMessage._meta.type).toBe('mutation');
  });

  it('reload is a mutation', () => {
    expect(runtimeProcedures.reload._meta.type).toBe('mutation');
  });
});
