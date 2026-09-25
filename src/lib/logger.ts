/**
 * Structured logging.
 *
 * Production emits one JSON object per line (what Render, Railway, Vercel and
 * most log drains ingest natively); development emits readable lines. Every
 * entry can carry a requestId so a user-visible error reference can be traced.
 *
 * `reportError` is the seam for an error tracker. With SENTRY_DSN set it is the
 * single place to add the Sentry SDK (Phase 9); until then errors are logged
 * with full context and nothing pretends to have been reported elsewhere.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

const json = process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json';
const minLevel: Level = (process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'test' ? 'warn' : 'info');
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|api[-_]?key|private[-_]?key/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEYS.test(k) ? '[redacted]' : scrub(v, depth + 1),
    ]),
  );
}

function write(level: Level, event: string, fields: Fields = {}) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const entry = { level, event, time: new Date().toISOString(), ...(scrub(fields) as Fields) };
  const line = json ? JSON.stringify(entry) : `[campusos] ${level.toUpperCase()} ${event} ${Object.keys(fields).length ? JSON.stringify(scrub(fields)) : ''}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Fields) => write('debug', event, fields),
  info: (event: string, fields?: Fields) => write('info', event, fields),
  warn: (event: string, fields?: Fields) => write('warn', event, fields),
  error: (event: string, fields?: Fields) => write('error', event, fields),
};

/**
 * Log an unhandled error and, when configured, forward it to an error
 * collector. ERROR_REPORTER=webhook POSTs a small scrubbed JSON event to
 * ERROR_WEBHOOK_URL (any collector that accepts JSON: a logging service,
 * an incident tool, a Slack-compatible relay). Fire-and-forget: reporting
 * can never slow down or break the request that failed. Request bodies,
 * cookies and user data are never sent — only the error, a route and ids.
 */
export function reportError(error: unknown, context: Fields = {}): void {
  write('error', 'unhandled_error', { ...context, error });
  if (process.env.ERROR_REPORTER !== 'webhook' || !process.env.ERROR_WEBHOOK_URL) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const payload = {
    source: 'campusos',
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? null,
    time: new Date().toISOString(),
    error: { name: err.name, message: err.message.slice(0, 500), stack: err.stack?.split('\n').slice(0, 12).join('\n') },
    context: scrub(pickContext(context)),
  };
  try {
    void fetch(process.env.ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }).catch(() => undefined);
  } catch {
    /* never let reporting throw */
  }
}

/** Only routing/correlation fields leave the process. */
function pickContext(context: Fields): Fields {
  const allowed = ['requestId', 'route', 'method', 'status', 'digest', 'institutionId', 'where'];
  return Object.fromEntries(Object.entries(context).filter(([k]) => allowed.includes(k)));
}
