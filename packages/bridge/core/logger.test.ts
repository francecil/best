import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogger } from './logger';

describe('createLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips debug logs when debug is false', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('T', false);

    logger.debug('hidden');
    logger.info('shown');

    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs debug when debug is true', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = createLogger('T', true);

    logger.debug('visible');

    expect(log).toHaveBeenCalledTimes(1);
  });
});
