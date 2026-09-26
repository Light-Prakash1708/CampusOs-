/**
 * Next.js boot hook. Validates configuration once per server process.
 *
 * Production: an invalid configuration aborts startup with every problem
 * listed, so a misconfigured deploy fails its health check instead of serving
 * broken pages. Development: problems are printed as warnings.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validateEnv } = await import('./lib/env');
  const { logger } = await import('./lib/logger');
  const result = validateEnv();
  await installProcessHandlers();
  if (result.ok) {
    logger.info('config.valid', {
      storage: result.env?.STORAGE_PROVIDER,
      email: result.env?.EMAIL_PROVIDER,
      ai: result.env?.AI_PROVIDER,
    });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    logger.error('config.invalid', { issues: result.issues });
    // Exit rather than serve 500s: the platform restarts/rolls back and the
    // deploy log shows exactly what to fix.
    setTimeout(() => process.exit(1), 100);
    throw new Error(`Invalid CampusOS configuration:\n  - ${result.issues.join('\n  - ')}`);
  }
  logger.warn('config.invalid', { issues: result.issues });
}

/**
 * Last-resort handlers so a stray rejection is reported (scrubbed, like every
 * other error) instead of vanishing. An uncaught exception leaves the process
 * in an unknown state, so it is reported and the process exits; the platform
 * restarts it. Installed once per process.
 */
async function installProcessHandlers() {
  const flag = Symbol.for('campusos.processHandlers');
  const g = globalThis as Record<symbol, boolean>;
  if (g[flag]) return;
  g[flag] = true;
  const { reportError } = await import('./lib/logger');
  process.on('unhandledRejection', (reason) => {
    reportError(reason, { where: 'unhandledRejection' });
  });
  process.on('uncaughtException', (error) => {
    reportError(error, { where: 'uncaughtException' });
    setTimeout(() => process.exit(1), 200);
  });
}

/**
 * Server-side errors during rendering, route handlers and server actions
 * (Next.js 15 hook). Forwarded to the same reporter as API errors, with only
 * routing fields — never headers, cookies or bodies.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportError } = await import('./lib/logger');
  const digest = (error as { digest?: string } | null)?.digest;
  reportError(error, { where: context.routeType ?? 'request', route: context.routePath ?? request.path.split('?')[0], method: request.method, digest });
}
