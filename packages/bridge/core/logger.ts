/**
 * Pretty logger
 */

export function createLogger(prefix: string, debug: boolean) {
  const styles = {
    info: 'color: #3b82f6; font-weight: bold',
    success: 'color: #10b981; font-weight: bold',
    warn: 'color: #f59e0b; font-weight: bold',
    error: 'color: #ef4444; font-weight: bold',
    debug: 'color: #8b5cf6; font-weight: bold',
  };

  const log = (level: keyof typeof styles, ...args: any[]) => {
    if (!debug && level === 'debug') {
      return;
    }

    const emoji = {
      info: '🔵',
      success: '✅',
      warn: '⚠️',
      error: '❌',
      debug: '🔍',
    }[level];

    console.log(
      `%c[${prefix}] ${emoji}`,
      styles[level],
      ...args,
    );
  };

  return {
    info: (...args: any[]) => log('info', ...args),
    success: (...args: any[]) => log('success', ...args),
    warn: (...args: any[]) => log('warn', ...args),
    error: (...args: any[]) => log('error', ...args),
    debug: (...args: any[]) => log('debug', ...args),
  };
}
