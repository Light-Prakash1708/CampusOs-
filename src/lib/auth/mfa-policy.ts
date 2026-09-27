/**
 * Who must use two-step sign-in (CAMPUSOS-018). Pure, so the API wrapper,
 * the portal layout and the services all apply the same rule.
 *
 *   MFA_REQUIRED_ROLES  comma list (default "SUPER_ADMIN")
 *   MFA_ENFORCE         "true" | "false" (default: on in production only)
 */
export function mfaEnforced(): boolean {
  const v = process.env.MFA_ENFORCE;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function mfaRequiredRoles(): string[] {
  return (process.env.MFA_REQUIRED_ROLES ?? 'SUPER_ADMIN')
    .split(',')
    .map((r) => r.trim().toUpperCase())
    .filter(Boolean);
}

export function mfaRequiredFor(role: string): boolean {
  return mfaRequiredRoles().includes(role.toUpperCase());
}

/** True when this signed-in user must finish setting up MFA before doing anything else. */
export function mfaSetupBlocking(user: { role: string; mfaEnabled?: boolean; isDemo?: boolean }): boolean {
  if (user.isDemo) return false; // shared demo accounts cannot enrol a personal authenticator
  return mfaEnforced() && mfaRequiredFor(user.role) && !user.mfaEnabled;
}

/** API paths a user blocked by MFA setup may still call. */
export const MFA_SETUP_ALLOWED_API = ['/api/account/', '/api/auth/', '/api/privacy/notice'];
