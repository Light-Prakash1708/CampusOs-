import bcrypt from 'bcryptjs';

/**
 * Password hashing.
 *
 * bcrypt with cost 12. Chosen over argon2 because it has no native build step,
 * which keeps `npm install` portable across the environments a college's IT
 * team is likely to deploy on. The cost factor is configurable so it can be
 * raised as hardware improves.
 */

const COST = Number(process.env.BCRYPT_COST ?? 12);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

/** Minimum institutional password policy. Configurable per tenant later. */
export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (password.length < 10) errors.push('Password must be at least 10 characters long.');
  if (!/[a-z]/.test(password)) errors.push('Password must include a lowercase letter.');
  if (!/[A-Z]/.test(password)) errors.push('Password must include an uppercase letter.');
  if (!/[0-9]/.test(password)) errors.push('Password must include a number.');
  const common = ['password', '12345678', 'qwerty', 'admin123', 'letmein', 'welcome'];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    errors.push('Password contains a commonly used phrase.');
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Constant-ish delay used when an email is not found, so that response timing
 * does not reveal which accounts exist.
 */
export async function dummyPasswordWork(): Promise<void> {
  await bcrypt.compare('dummy-password-for-timing', '$2a$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
}
