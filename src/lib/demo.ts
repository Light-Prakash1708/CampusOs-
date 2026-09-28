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

/**
 * Where "View demo" goes, or null to hide it. A demo server links to its own
 * /demo; a pilot college's server (demo off, by design) may point at the
 * separate demo service through PUBLIC_DEMO_URL — a link only, no shared data.
 */
export function demoEntryHref(): string | null {
  if (demoSignInEnabled()) return '/demo';
  const external = process.env.PUBLIC_DEMO_URL?.trim();
  if (!external || !/^https?:\/\//i.test(external)) return null;
  return `${external.replace(/\/+$/, '')}/demo`;
}
