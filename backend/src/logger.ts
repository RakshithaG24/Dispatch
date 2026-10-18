type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...meta });
  (level === 'error' ? console.error : console.log)(line);
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
