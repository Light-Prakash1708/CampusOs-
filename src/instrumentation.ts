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
