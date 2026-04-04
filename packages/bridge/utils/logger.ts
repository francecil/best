/**
 * Pretty logger — shared by core and middleware layers.
 */

const STYLES = {
  info: 'color: #3b82f6; font-weight: bold',
  success: 'color: #10b981; font-weight: bold',
  warn: 'color: #f59e0b; font-weight: bold',
  error: 'color: #ef4444; font-weight: bold',
  debug: 'color: #8b5cf6; font-weight: bold',
} as const;

const EMOJIS = {
  info: '🔵',
  success: '✅',
  warn: '⚠️',
  error: '❌',
  debug: '🔍',
} as const;

type Level = keyof typeof STYLES;

export function createLogger(prefix: string, debug: boolean) {
  const log = (level: Level, ...args: any[]) => {
    if (!debug && level === 'debug') return;
    // Resolve the console method at call time so test spies are respected.
    const fn = level === 'success' ? console.log : console[level as Exclude<Level, 'success'>];
    fn(`%c[${prefix}] ${EMOJIS[level]}`, STYLES[level], ...args);
  };

  return {
    info: (...args: any[]) => log('info', ...args),
    success: (...args: any[]) => log('success', ...args),
    warn: (...args: any[]) => log('warn', ...args),
    error: (...args: any[]) => log('error', ...args),
    debug: (...args: any[]) => log('debug', ...args),
  };
}

export type Logger = typeof createLogger;