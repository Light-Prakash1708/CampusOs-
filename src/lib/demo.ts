/**
 * The public sales demo (CAMPUSOS-015). One isolated tenant (plus fictional
 * partner colleges for event discovery), recreated by `npm run demo:reset`.
 * "Try the demo" signs visitors into fixed demo accounts without a password.
 */
export const DEMO_SLUG = 'demo-university';

/** The demo tenant's slug (overridable for tests and alternative demo builds). */
export function demoSlug(): string {
  return process.env.DEMO_TENANT_SLUG?.trim() || DEMO_SLUG;
}

export const DEMO_ACCOUNTS = {
  student: 'student@demo.campusos.local',
  faculty: 'faculty@demo.campusos.local',
  admin: 'registrar@demo.campusos.local',
} as const;

export type DemoRole = keyof typeof DEMO_ACCOUNTS;

/** Off unless explicitly switched on for this deployment. */
export function demoSignInEnabled(): boolean {
  return process.env.DEMO_TENANT_ENABLED === 'true';
}
