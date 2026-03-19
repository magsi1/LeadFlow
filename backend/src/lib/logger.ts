type Level = 'debug' | 'info' | 'warn' | 'error';

function log(level: Level, message: string, context?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const json = JSON.stringify(entry);
  if (level === 'error') {
    console.error(json);
    return;
  }
  if (level === 'warn') {
    console.warn(json);
    return;
  }
  console.log(json);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>): void =>
    log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>): void =>
    log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>): void =>
    log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>): void =>
    log('error', message, context),
};
