import { describe, expect, it } from 'vitest';
import { notificationsProcedures } from './notifications';

describe('notificationsProcedures', () => {
  it('create is a mutation', () => {
    expect(notificationsProcedures.create._meta.type).toBe('mutation');
    expect(typeof notificationsProcedures.create.handler).toBe('function');
  });

  it('update is a mutation', () => {
    expect(notificationsProcedures.update._meta.type).toBe('mutation');
  });

  it('clear is a mutation', () => {
    expect(notificationsProcedures.clear._meta.type).toBe('mutation');
  });

  it('getAll is a query', () => {
    expect(notificationsProcedures.getAll._meta.type).toBe('query');
  });

  it('onClicked is a subscription', () => {
    expect(notificationsProcedures.onClicked._meta.type).toBe('subscription');
    expect(typeof notificationsProcedures.onClicked.handler).toBe('function');
  });

  it('onClosed is a subscription', () => {
    expect(notificationsProcedures.onClosed._meta.type).toBe('subscription');
    expect(typeof notificationsProcedures.onClosed.handler).toBe('function');
  });
});
