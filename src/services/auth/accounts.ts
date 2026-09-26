import 'server-only';
import { and, desc, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { checkPasswordPolicy, dummyPasswordWork, hashPassword, verifyPassword } from '@/lib/auth/password';
import { portalForRole, type Role } from '@/lib/auth/permissions';
import { randomBytes } from 'node:crypto';
import { appUrl, selfRegistrationEnabled } from '@/lib/env';
import { humanize } from '@/lib/utils';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, checkRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';
import { sendTransactionalEmail } from '@/services/notifications/dispatcher';
import { getProviders } from '@/services/notifications/providers';
import {
  inviteEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verifyEmailEmail,
} from '@/services/notifications/templates';
import { consumeToken, issueToken, TOKEN_TTL_MINUTES } from './tokens';

/**
 * ACCOUNT SERVICE
 * ---------------------------------------------------------------------------
 * Every way an account comes into existence or changes its credentials:
 * sign-in, self-registration, invitation, email verification, password reset,
 * password change and session management. Route handlers only validate input
 * and translate results; the rules live here.
 *
 * Invariants:
 *  - Responses never reveal whether an email has an account (sign-in failure,
 *    reset request and registration all answer uniformly).
 *  - Every credential change bumps `session_epoch`, which invalidates every
 *    session issued before it on the next request.
 *  - Tokens are single-use, hashed at rest, and consumed in the same
 *    transaction as the change they authorise.
 *  - The tenant always comes from the account or the AuthContext, never from
 *    the request body (registration picks a college from a public list, and
 *    that choice is validated against the college's own policy).
 */

export interface RequestMeta {
  ipAddress: string | null;
  userAgent: string | null;
}

const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;

/* =============================== sign-in ================================== */

export type AuthResult =
  | {
      ok: true;
      user: { id: string; institutionId: string; role: string; sessionEpoch: number };
      redirectTo: string;
      mustChangePassword: boolean;
    }
  | { ok: false; status: number; code: string; message: string; hint?: string };

const INVALID: AuthResult = {
  ok: false,
  status: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'That email and password combination is not correct.',
  hint: 'Check your details, or use “Forgot password” to reset.',
};

export async function authenticate(input: {
  email: string;
  password: string;
  institutionSlug?: string;
  meta: RequestMeta;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();

  // Throttle before doing any expensive work: per IP (spraying many accounts)
  // and per account (guessing one account from many IPs).
  const ipLimit = await checkRateLimit(keyFor('login:ip', input.meta.ipAddress), RATE_LIMITS.loginPerIp);
  const acctLimit = await checkRateLimit(keyFor('login:acct', email), RATE_LIMITS.loginPerAccount);
  if (!ipLimit.allowed || !acctLimit.allowed) {
    const wait = Math.max(ipLimit.retryAfter, acctLimit.retryAfter);
    return {
      ok: false,
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts.',
      hint: `Wait about ${Math.max(1, Math.ceil(wait / 60))} minutes, or reset your password.`,
    };
  }

  const rows = await db
    .select({
      id: t.users.id,
      institutionId: t.users.institutionId,
      passwordHash: t.users.passwordHash,
      role: t.users.role,
      status: t.users.status,
      sessionEpoch: t.users.sessionEpoch,
      failedLoginAttempts: t.users.failedLoginAttempts,
      lockedUntil: t.users.lockedUntil,
      mustChangePassword: t.users.mustChangePassword,
      emailVerifiedAt: t.users.emailVerifiedAt,
      institutionSlug: t.institutions.slug,
      institutionActive: t.institutions.isActive,
    })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(and(eq(t.users.email, email), isNull(t.users.deletedAt)))
    .limit(5);

  const candidate = input.institutionSlug
    ? rows.find((r) => r.institutionSlug === input.institutionSlug)
    : rows[0];

  if (!candidate || !candidate.passwordHash) {
    await dummyPasswordWork();
    return INVALID;
  }

  if (candidate.lockedUntil && candidate.lockedUntil > new Date()) {
    const minutes = Math.ceil((candidate.lockedUntil.getTime() - Date.now()) / 60000);
    return {
      ok: false,
      status: 423,
      code: 'ACCOUNT_LOCKED',
      message: `Too many failed attempts. This account is locked for ${minutes} more minute${minutes === 1 ? '' : 's'}.`,
      hint: 'Wait for the lock to expire, or reset your password — a reset also clears the lock.',
    };
  }

  const valid = await verifyPassword(input.password, candidate.passwordHash);
  if (!valid) {
    const attempts = candidate.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await db
      .update(t.users)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
      })
      .where(eq(t.users.id, candidate.id));
    await recordAudit(
      { userId: candidate.id, institutionId: candidate.institutionId, role: candidate.role },
      {
        action: 'USER_LOGIN_FAILED',
        entityType: 'user',
        entityId: candidate.id,
        reason: lock ? 'Account locked after repeated failures' : 'Invalid password',
        ...input.meta,
      },
    );
    return INVALID;
  }

  // Correct password from here on: it is safe to explain account state.
  if (candidate.status === 'PENDING') {
    return candidate.emailVerifiedAt
      ? {
          ok: false,
          status: 403,
          code: 'REGISTRATION_PENDING',
          message: 'Your registration is waiting for approval from your institution.',
          hint: 'You will get an email as soon as an administrator approves it.',
        }
      : {
          ok: false,
          status: 403,
          code: 'EMAIL_NOT_VERIFIED',
          message: 'Please confirm your email address first.',
          hint: 'Open the confirmation link we emailed you. You can request a new one below.',
        };
  }
  if (candidate.status !== 'ACTIVE') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_INACTIVE',
      message: 'This account is not active.',
      hint: 'Contact your institution administrator.',
    };
  }
  if (!candidate.institutionActive) {
    return {
      ok: false,
      status: 403,
      code: 'INSTITUTION_INACTIVE',
      message: 'This institution’s CampusOS access is currently inactive.',
      hint: 'Contact your administrator.',
    };
  }

  await db
    .update(t.users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(t.users.id, candidate.id));

  await recordAudit(
    { userId: candidate.id, institutionId: candidate.institutionId, role: candidate.role },
    { action: 'USER_LOGIN', entityType: 'user', entityId: candidate.id, ...input.meta },
  );

  return {
    ok: true,
    user: {
      id: candidate.id,
      institutionId: candidate.institutionId,
      role: candidate.role,
      sessionEpoch: candidate.sessionEpoch,
    },
    redirectTo: candidate.mustChangePassword ? '/account/security?required=1' : `/${portalForRole(candidate.role)}`,
    mustChangePassword: candidate.mustChangePassword,
  };
}

/* ============================ password reset ============================== */

/**
 * Always resolves the same way, whether or not the address has an account, so
 * the endpoint cannot be used to discover who studies where.
 */
export async function requestPasswordReset(input: {
  email: string;
  institutionSlug?: string;
  meta: RequestMeta;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  await enforceRateLimit(keyFor('reset:ip', input.meta.ipAddress), RATE_LIMITS.passwordResetPerIp, 'Too many reset requests.');
  const perAccount = await checkRateLimit(keyFor('reset:acct', email), RATE_LIMITS.passwordResetPerAccount);
  if (!perAccount.allowed) return; // silently: do not reveal that the account exists

  const rows = await db
    .select({
      id: t.users.id,
      institutionId: t.users.institutionId,
      firstName: t.users.firstName,
      role: t.users.role,
      status: t.users.status,
      institutionName: t.institutions.name,
      institutionSlug: t.institutions.slug,
    })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(and(eq(t.users.email, email), isNull(t.users.deletedAt), eq(t.users.status, 'ACTIVE')))
    .limit(5);

  const targets = input.institutionSlug ? rows.filter((r) => r.institutionSlug === input.institutionSlug) : rows;

  for (const user of targets) {
    const { raw } = await issueToken({
      institutionId: user.institutionId,
      userId: user.id,
      purpose: 'PASSWORD_RESET',
      sentTo: email,
    });
    await sendTransactionalEmail({
      institutionId: user.institutionId,
      userId: user.id,
      message: passwordResetEmail({
        to: email,
        firstName: user.firstName,
        institutionName: user.institutionName,
        url: appUrl(`/reset-password?token=${raw}`),
        expiresMinutes: TOKEN_TTL_MINUTES.PASSWORD_RESET,
      }),
    });
    await recordAudit(
      { userId: user.id, institutionId: user.institutionId, role: user.role },
      { action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id, ...input.meta },
    );
  }

  if (targets.length === 0) await dummyPasswordWork();
}

function assertPolicy(password: string) {
  const policy = checkPasswordPolicy(password);
  if (!policy.valid) {
    throw new AppError(policy.errors[0] ?? 'Choose a stronger password.', 422, 'WEAK_PASSWORD', policy.errors,
      'Use at least 10 characters with upper- and lower-case letters and a number.');
  }
}

const INVALID_LINK = new AppError(
  'This link is invalid or has expired.',
  400,
  'INVALID_TOKEN',
  undefined,
  'Links work once and expire. Request a new one and use the most recent email.',
);

export async function resetPassword(input: { token: string; password: string; meta: RequestMeta }): Promise<void> {
  assertPolicy(input.password);
  const hash = await hashPassword(input.password);

  const user = await db.transaction(async (tx) => {
    const token = await consumeToken(input.token, 'PASSWORD_RESET', tx);
    if (!token) throw INVALID_LINK;

    const [u] = await tx
      .update(t.users)
      .set({
        passwordHash: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
        sessionEpoch: sql`${t.users.sessionEpoch} + 1`,
        // Clicking an emailed link proves control of the address.
        emailVerifiedAt: sql`COALESCE(${t.users.emailVerifiedAt}, now())`,
      })
      .where(
        and(
          eq(t.users.id, token.userId),
          eq(t.users.institutionId, token.institutionId),
          eq(t.users.email, token.sentTo),
          eq(t.users.status, 'ACTIVE'),
          isNull(t.users.deletedAt),
        ),
      )
      .returning({ id: t.users.id, institutionId: t.users.institutionId, role: t.users.role, email: t.users.email, firstName: t.users.firstName });
    // Email changed or account deactivated since the link was sent.
    if (!u) throw INVALID_LINK;

    await tx.update(t.sessions).set({ revokedAt: new Date() }).where(and(eq(t.sessions.userId, u.id), isNull(t.sessions.revokedAt)));
    return u;
  });

  await recordAudit(
    { userId: user.id, institutionId: user.institutionId, role: user.role },
    { action: 'PASSWORD_RESET', entityType: 'user', entityId: user.id, reason: 'Reset via emailed link; all sessions revoked', ...input.meta },
  );
  const [inst] = await db.select({ name: t.institutions.name }).from(t.institutions).where(eq(t.institutions.id, user.institutionId));
  await sendTransactionalEmail({
    institutionId: user.institutionId,
    userId: user.id,
    message: passwordChangedEmail({ to: user.email, firstName: user.firstName, institutionName: inst?.name ?? 'Your institution' }),
  });
}

/* ============================ change password ============================= */

/**
 * Changes the password of the signed-in user. Every session — including the
 * current one — is invalidated; the caller issues a fresh session for this
 * device afterwards. Returns the new epoch for that purpose.
 */
export async function changePassword(
  ctx: AuthContext,
  input: { currentPassword: string; newPassword: string; meta: RequestMeta },
): Promise<{ sessionEpoch: number }> {
  const [row] = await db
    .select({ hash: t.users.passwordHash, email: t.users.email, firstName: t.users.firstName })
    .from(t.users)
    .where(and(eq(t.users.id, ctx.userId), eq(t.users.institutionId, ctx.institutionId)))
    .limit(1);
  if (!row?.hash || !(await verifyPassword(input.currentPassword, row.hash))) {
    throw new AppError('Your current password is not correct.', 400, 'INVALID_CURRENT_PASSWORD');
  }
  if (input.currentPassword === input.newPassword) {
    throw new AppError('Choose a password different from your current one.', 422, 'PASSWORD_UNCHANGED');
  }
  assertPolicy(input.newPassword);
  const hash = await hashPassword(input.newPassword);

  const [updated] = await db.transaction(async (tx) => {
    await tx.update(t.sessions).set({ revokedAt: new Date() }).where(and(eq(t.sessions.userId, ctx.userId), isNull(t.sessions.revokedAt)));
    return tx
      .update(t.users)
      .set({
        passwordHash: hash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        sessionEpoch: sql`${t.users.sessionEpoch} + 1`,
      })
      .where(eq(t.users.id, ctx.userId))
      .returning({ sessionEpoch: t.users.sessionEpoch });
  });

  await recordAudit(ctx, { action: 'PASSWORD_CHANGED', entityType: 'user', entityId: ctx.userId, reason: 'All other sessions revoked', ...input.meta });
  await sendTransactionalEmail({
    institutionId: ctx.institutionId,
    userId: ctx.userId,
    message: passwordChangedEmail({ to: row.email, firstName: row.firstName, institutionName: ctx.institutionName }),
  });
  return { sessionEpoch: updated!.sessionEpoch };
}

/* ========================== email verification ============================ */

async function sendVerification(user: { id: string; institutionId: string; email: string; firstName: string; institutionName: string }) {
  const { raw } = await issueToken({ institutionId: user.institutionId, userId: user.id, purpose: 'EMAIL_VERIFY', sentTo: user.email });
  return sendTransactionalEmail({
    institutionId: user.institutionId,
    userId: user.id,
    message: verifyEmailEmail({
      to: user.email,
      firstName: user.firstName,
      institutionName: user.institutionName,
      url: appUrl(`/verify-email?token=${raw}`),
      expiresHours: TOKEN_TTL_MINUTES.EMAIL_VERIFY / 60,
    }),
  });
}

/** Re-sends the verification email for an unverified account identified by email (uniform response). */
export async function resendVerification(input: { email: string; meta: RequestMeta }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  await enforceRateLimit(keyFor('verify:ip', input.meta.ipAddress), RATE_LIMITS.passwordResetPerIp, 'Too many requests.');
  const allowed = await checkRateLimit(keyFor('verify:acct', email), RATE_LIMITS.verifyResendPerUser);
  if (!allowed.allowed) return;
  const [user] = await db
    .select({ id: t.users.id, institutionId: t.users.institutionId, email: t.users.email, firstName: t.users.firstName, institutionName: t.institutions.name })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .where(and(eq(t.users.email, email), isNull(t.users.emailVerifiedAt), isNull(t.users.deletedAt), ne(t.users.status, 'INVITED')))
    .limit(1);
  if (user) await sendVerification(user);
}

export type VerifyOutcome = 'ACTIVE' | 'AWAITING_APPROVAL' | 'ALREADY_ACTIVE';

export async function verifyEmail(input: { token: string; meta: RequestMeta }): Promise<VerifyOutcome> {
  const result = await db.transaction(async (tx) => {
    const token = await consumeToken(input.token, 'EMAIL_VERIFY', tx);
    if (!token) throw INVALID_LINK;

    const [row] = await tx
      .select({
        id: t.users.id,
        email: t.users.email,
        status: t.users.status,
        role: t.users.role,
        institutionId: t.users.institutionId,
        policy: t.institutions.registrationPolicy,
      })
      .from(t.users)
      .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
      .where(and(eq(t.users.id, token.userId), eq(t.users.institutionId, token.institutionId)))
      .limit(1);
    if (!row || row.email !== token.sentTo) throw INVALID_LINK;

    let outcome: VerifyOutcome = 'ALREADY_ACTIVE';
    let status = row.status;
    if (row.status === 'PENDING') {
      if (row.policy.mode === 'EMAIL_DOMAIN') {
        status = 'ACTIVE';
        outcome = 'ACTIVE';
      } else {
        outcome = 'AWAITING_APPROVAL';
      }
    }
    await tx.update(t.users).set({ emailVerifiedAt: new Date(), status }).where(eq(t.users.id, row.id));
    return { outcome, user: row };
  });

  await recordAudit(
    { userId: result.user.id, institutionId: result.user.institutionId, role: result.user.role },
    { action: 'EMAIL_VERIFIED', entityType: 'user', entityId: result.user.id, after: { outcome: result.outcome }, ...input.meta },
  );
  return result.outcome;
}

/* ============================ registration ================================ */

export interface RegistrationInput {
  institutionSlug: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  departmentId: string;
  programId: string;
  sectionId?: string | null;
  year: number;
  studentId: string;
  meta: RequestMeta;
}

export function emailDomainAllowed(email: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return false;
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return allowed.some((d) => {
    const want = d.toLowerCase().replace(/^@/, '');
    return domain === want || domain.endsWith(`.${want}`);
  });
}

/** Uniform message returned whether the address was new or already registered. */
export const REGISTRATION_ACCEPTED =
  'Check your inbox. If this address can be registered, we have sent a confirmation link.';

export async function registerStudent(input: RegistrationInput): Promise<{ message: string }> {
  await enforceRateLimit(keyFor('register:ip', input.meta.ipAddress), RATE_LIMITS.registerPerIp, 'Too many registration attempts.');
  assertPolicy(input.password);
  const email = input.email.trim().toLowerCase();

  const [inst] = await db
    .select({ id: t.institutions.id, name: t.institutions.name, policy: t.institutions.registrationPolicy, isActive: t.institutions.isActive, isListed: t.institutions.isListed })
    .from(t.institutions)
    .where(and(eq(t.institutions.slug, input.institutionSlug), isNull(t.institutions.deletedAt)))
    .limit(1);
  if (!inst || !inst.isActive || !inst.isListed || inst.policy.mode === 'DISABLED') {
    throw new AppError('This college does not accept self-registration on CampusOS.', 403, 'REGISTRATION_CLOSED', undefined,
      'Ask your college to send you an invitation instead.');
  }
  if (inst.policy.mode === 'EMAIL_DOMAIN' && !emailDomainAllowed(email, inst.policy.allowedDomains)) {
    const domains = (inst.policy.allowedDomains ?? []).map((d) => `@${d.replace(/^@/, '')}`).join(', ');
    throw new AppError('Use your college email address to register.', 422, 'EMAIL_DOMAIN_NOT_ALLOWED', undefined,
      domains ? `${inst.name} accepts addresses ending in ${domains}.` : undefined);
  }

  // The academic placement must be internally consistent and belong to THIS college.
  const [program] = await db
    .select({ id: t.programs.id, departmentId: t.programs.departmentId, duration: t.programs.durationYears })
    .from(t.programs)
    .where(and(eq(t.programs.id, input.programId), eq(t.programs.institutionId, inst.id), isNull(t.programs.deletedAt)))
    .limit(1);
  if (!program || program.departmentId !== input.departmentId) {
    throw new AppError('Choose a programme offered by the selected department.', 422, 'BAD_PROGRAM');
  }
  if (input.year < 1 || input.year > program.duration) {
    throw new AppError(`Year must be between 1 and ${program.duration} for this programme.`, 422, 'BAD_YEAR');
  }
  if (input.sectionId) {
    const [section] = await db
      .select({ id: t.sections.id })
      .from(t.sections)
      .where(and(eq(t.sections.id, input.sectionId), eq(t.sections.institutionId, inst.id), eq(t.sections.programId, program.id), isNull(t.sections.deletedAt)))
      .limit(1);
    if (!section) throw new AppError('That section does not belong to the selected programme.', 422, 'BAD_SECTION');
  }

  const [existing] = await db
    .select({ id: t.users.id, firstName: t.users.firstName })
    .from(t.users)
    .where(and(eq(t.users.institutionId, inst.id), eq(t.users.email, email)))
    .limit(1);
  if (existing) {
    // Do not reveal the account exists. The real owner can use password reset.
    await dummyPasswordWork();
    return { message: REGISTRATION_ACCEPTED };
  }

  const passwordHash = await hashPassword(input.password);
  const semester = input.year * 2 - 1;

  const created = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(t.users)
      .values({
        institutionId: inst.id,
        email,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: 'STUDENT',
        status: 'PENDING',
        departmentId: input.departmentId,
        passwordChangedAt: new Date(),
      })
      .returning({ id: t.users.id });
    await tx.insert(t.studentProfiles).values({
      institutionId: inst.id,
      userId: user!.id,
      rollNumber: input.studentId.trim().toUpperCase(),
      programId: program.id,
      sectionId: input.sectionId ?? null,
      currentYear: input.year,
      currentSemester: semester,
    });
    return user!;
  }).catch((error: unknown) => {
    const pg = pgErrorOf(error);
    if (pg.code === '23505' && pg.constraint === 'student_profiles_roll_uq') {
      throw new ConflictError('That student ID is already registered at this college.', undefined,
        'If it is yours, sign in or reset your password. Otherwise contact your college office.');
    }
    throw error;
  });

  await recordAudit(
    { userId: created.id, institutionId: inst.id, role: 'STUDENT' },
    { action: 'USER_REGISTERED', entityType: 'user', entityId: created.id, after: { mode: inst.policy.mode }, ...input.meta },
  );
  await sendVerification({ id: created.id, institutionId: inst.id, email, firstName: input.firstName.trim(), institutionName: inst.name });
  return { message: REGISTRATION_ACCEPTED };
}

/* ===================== independent student sign-up ======================= */

/**
 * A personal workspace has no administrator to switch modules on, so it starts
 * with the student's own tools on (tracker, career, progress, discovering
 * events other colleges open to everyone) and the modules that only make
 * sense inside a real college off (grievance desk, physical library,
 * class-wide leaderboards, the college's resource shelf).
 */
const PERSONAL_WORKSPACE_FLAGS: Record<string, boolean> = {
  personal_tracker_enabled: true,
  opportunity_hub_enabled: true,
  gamification_enabled: true,
  event_discovery_enabled: true,
  grievance_enabled: false,
  anonymous_grievance_enabled: false,
  library_enabled: false,
  leaderboards_enabled: false,
  resource_hub_enabled: false,
};

export interface IndependentRegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  meta: RequestMeta;
}

export const EMAIL_ALREADY_REGISTERED = new ConflictError(
  'An account with this email already exists.',
  undefined,
  'Sign in instead, or use “Forgot password” if you can’t remember it.',
);

/**
 * Student sign-up without a college (SELF_REGISTRATION_ENABLED).
 *
 * Every account in CampusOS belongs to exactly one tenant, and every query is
 * scoped by it. Rather than weakening that, a self-registered student gets a
 * private PERSONAL workspace of their own: an unlisted institution with one
 * placeholder department and programme ("Independent study"), which the
 * student profile requires. They see only their own records plus data other
 * colleges deliberately publish (e.g. open events). Joining a real college
 * stays the college's decision, through its invitation or registration flow.
 *
 * The role is always STUDENT: nothing in the input can choose a role, tenant
 * or user id. The account is active at once so the student can start without
 * an administrator; if an email provider is configured a confirmation link is
 * also sent.
 */
export async function registerIndependentStudent(
  input: IndependentRegistrationInput,
): Promise<{ user: { id: string; institutionId: string; role: string; sessionEpoch: number }; redirectTo: string }> {
  if (!selfRegistrationEnabled()) {
    throw new AppError('Student sign-up is not open on this CampusOS server.', 403, 'REGISTRATION_CLOSED', undefined,
      'If your college uses CampusOS, ask the college office for an invitation.');
  }
  await enforceRateLimit(keyFor('register:ip', input.meta.ipAddress), RATE_LIMITS.registerPerIp, 'Too many registration attempts.');
  assertPolicy(input.password);
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const passwordHash = await hashPassword(input.password);

  const created = await db.transaction(async (tx) => {
    // Serialise sign-ups for the same address so two requests can't both pass
    // the duplicate check.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`campusos:personal-signup:${email}`}))`);
    const [existing] = await tx
      .select({ id: t.users.id })
      .from(t.users)
      .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
      .where(and(eq(t.users.email, email), eq(t.institutions.kind, 'PERSONAL'), isNull(t.users.deletedAt)))
      .limit(1);
    if (existing) return null;

    const suffix = randomBytes(6).toString('hex');
    const [inst] = await tx
      .insert(t.institutions)
      .values({
        slug: `personal-${suffix}`,
        name: `${firstName} ${lastName}`.trim(),
        shortName: 'Personal',
        kind: 'PERSONAL',
        isListed: false,
        registrationPolicy: { mode: 'DISABLED' },
        featureFlags: PERSONAL_WORKSPACE_FLAGS,
        setupCompletedAt: new Date(),
      })
      .returning({ id: t.institutions.id, name: t.institutions.name });
    const [dept] = await tx
      .insert(t.departments)
      .values({ institutionId: inst!.id, name: 'Independent study', code: 'IND' })
      .returning({ id: t.departments.id });
    const [program] = await tx
      .insert(t.programs)
      .values({ institutionId: inst!.id, departmentId: dept!.id, name: 'Independent study', code: 'IND', durationYears: 4, totalSemesters: 8 })
      .returning({ id: t.programs.id });
    const [user] = await tx
      .insert(t.users)
      .values({
        institutionId: inst!.id,
        email,
        passwordHash,
        firstName,
        lastName,
        role: 'STUDENT',
        status: 'ACTIVE',
        departmentId: dept!.id,
        passwordChangedAt: new Date(),
      })
      .returning({ id: t.users.id, sessionEpoch: t.users.sessionEpoch });
    await tx.insert(t.studentProfiles).values({
      institutionId: inst!.id,
      userId: user!.id,
      rollNumber: `SELF-${suffix.toUpperCase()}`,
      programId: program!.id,
      currentYear: 1,
      currentSemester: 1,
    });
    return { id: user!.id, sessionEpoch: user!.sessionEpoch, institutionId: inst!.id, institutionName: inst!.name };
  });

  if (!created) {
    await dummyPasswordWork();
    throw EMAIL_ALREADY_REGISTERED;
  }

  await recordAudit(
    { userId: created.id, institutionId: created.institutionId, role: 'STUDENT' },
    { action: 'USER_REGISTERED', entityType: 'user', entityId: created.id, after: { mode: 'PERSONAL' }, ...input.meta },
  );
  // Confirming the address is optional here; offer it only when email can be delivered.
  if (getProviders().email.delivers) {
    await sendVerification({ id: created.id, institutionId: created.institutionId, email, firstName, institutionName: 'CampusOS' }).catch(() => undefined);
  }

  return {
    user: { id: created.id, institutionId: created.institutionId, role: 'STUDENT', sessionEpoch: created.sessionEpoch },
    redirectTo: `/${portalForRole('STUDENT')}?welcome=1`,
  };
}

/* ============================== invitations =============================== */

/** Roles an administrator without `role:manage` may invite. */
const ORDINARY_INVITE_ROLES: Role[] = ['STUDENT', 'FACULTY', 'CLUB_ADMIN', 'EVENT_ORGANIZER', 'CAMPUS_REP'];

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  departmentId?: string | null;
  programId?: string | null;
  sectionId?: string | null;
  year?: number | null;
  rollNumber?: string | null;
  employeeCode?: string | null;
  designation?: string | null;
  meta: RequestMeta;
}

export async function inviteUser(ctx: AuthContext, input: InviteInput): Promise<{ userId: string; emailSent: boolean }> {
  if (!ctx.permissions.has('user:invite')) throw new ForbiddenError();
  if (!ORDINARY_INVITE_ROLES.includes(input.role) && !ctx.permissions.has('role:manage')) {
    throw new ForbiddenError(`Only a super administrator can invite someone as ${humanize(input.role)}.`);
  }
  await enforceRateLimit(keyFor('invite', ctx.userId), RATE_LIMITS.invitePerAdmin, 'Invitation limit reached for this hour.');
  const email = input.email.trim().toLowerCase();

  // Validate placement against THIS tenant.
  if (input.departmentId) {
    const [d] = await db.select({ id: t.departments.id }).from(t.departments)
      .where(and(eq(t.departments.id, input.departmentId), eq(t.departments.institutionId, ctx.institutionId))).limit(1);
    if (!d) throw new AppError('That department does not exist at your institution.', 422, 'BAD_DEPARTMENT');
  }
  let programDept: string | null = null;
  if (input.role === 'STUDENT') {
    if (!input.programId || !input.rollNumber) {
      throw new AppError('Students need a programme and a student ID.', 422, 'MISSING_FIELDS');
    }
    const [p] = await db.select({ id: t.programs.id, departmentId: t.programs.departmentId }).from(t.programs)
      .where(and(eq(t.programs.id, input.programId), eq(t.programs.institutionId, ctx.institutionId))).limit(1);
    if (!p) throw new AppError('That programme does not exist at your institution.', 422, 'BAD_PROGRAM');
    programDept = p.departmentId;
    if (input.sectionId) {
      const [s] = await db.select({ id: t.sections.id }).from(t.sections)
        .where(and(eq(t.sections.id, input.sectionId), eq(t.sections.programId, p.id), eq(t.sections.institutionId, ctx.institutionId))).limit(1);
      if (!s) throw new AppError('That section does not belong to the programme.', 422, 'BAD_SECTION');
    }
  }
  if (input.role === 'FACULTY' && (!input.departmentId || !input.employeeCode)) {
    throw new AppError('Faculty need a department and an employee code.', 422, 'MISSING_FIELDS');
  }

  const [existing] = await db
    .select({ id: t.users.id, status: t.users.status, firstName: t.users.firstName })
    .from(t.users)
    .where(and(eq(t.users.institutionId, ctx.institutionId), eq(t.users.email, email)))
    .limit(1);

  let userId: string;
  if (existing) {
    if (existing.status !== 'INVITED') {
      throw new ConflictError('An account with that email already exists at this institution.');
    }
    userId = existing.id; // re-send
  } else {
    userId = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(t.users)
        .values({
          institutionId: ctx.institutionId,
          email,
          passwordHash: null,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          role: input.role,
          status: 'INVITED',
          departmentId: input.departmentId ?? programDept,
        })
        .returning({ id: t.users.id });
      if (input.role === 'STUDENT') {
        const year = input.year ?? 1;
        await tx.insert(t.studentProfiles).values({
          institutionId: ctx.institutionId,
          userId: user!.id,
          rollNumber: input.rollNumber!.trim().toUpperCase(),
          programId: input.programId!,
          sectionId: input.sectionId ?? null,
          currentYear: year,
          currentSemester: year * 2 - 1,
        });
      }
      if (input.role === 'FACULTY') {
        await tx.insert(t.facultyProfiles).values({
          institutionId: ctx.institutionId,
          userId: user!.id,
          employeeCode: input.employeeCode!.trim().toUpperCase(),
          designation: input.designation?.trim() || 'Assistant Professor',
          departmentId: input.departmentId!,
        });
      }
      return user!.id;
    });
  }

  const { raw } = await issueToken({ institutionId: ctx.institutionId, userId, purpose: 'INVITE', sentTo: email, createdById: ctx.userId });
  const sent = await sendTransactionalEmail({
    institutionId: ctx.institutionId,
    userId,
    message: inviteEmail({
      to: email,
      firstName: existing?.firstName ?? input.firstName.trim(),
      institutionName: ctx.institutionName,
      inviterName: ctx.fullName,
      roleLabel: humanize(input.role).toLowerCase(),
      url: appUrl(`/invite?token=${raw}`),
      expiresDays: TOKEN_TTL_MINUTES.INVITE / 60 / 24,
    }),
  });
  await recordAudit(ctx, {
    action: 'USER_INVITED',
    entityType: 'user',
    entityId: userId,
    after: { email, role: input.role, resent: !!existing, emailSent: sent.sent },
    ...input.meta,
  });
  return { userId, emailSent: sent.sent };
}

/** Re-sends an invitation to an existing INVITED account (e.g. one created by CSV import). */
export async function resendInvite(ctx: AuthContext, userId: string, meta: RequestMeta) {
  const [u] = await db
    .select({ email: t.users.email, firstName: t.users.firstName, lastName: t.users.lastName, role: t.users.role, status: t.users.status })
    .from(t.users)
    .where(and(eq(t.users.id, userId), eq(t.users.institutionId, ctx.institutionId)))
    .limit(1);
  if (!u) throw new NotFoundError('User');
  if (u.status !== 'INVITED') throw new ConflictError('This account has already been activated.');
  return inviteUser(ctx, { email: u.email, firstName: u.firstName, lastName: u.lastName, role: u.role as Role, meta });
}

export async function acceptInvite(input: { token: string; password: string; meta: RequestMeta }) {
  assertPolicy(input.password);
  const hash = await hashPassword(input.password);
  const user = await db.transaction(async (tx) => {
    const token = await consumeToken(input.token, 'INVITE', tx);
    if (!token) throw INVALID_LINK;
    const [u] = await tx
      .update(t.users)
      .set({
        passwordHash: hash,
        passwordChangedAt: new Date(),
        status: 'ACTIVE',
        mustChangePassword: false,
        emailVerifiedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      })
      .where(
        and(
          eq(t.users.id, token.userId),
          eq(t.users.institutionId, token.institutionId),
          eq(t.users.email, token.sentTo),
          eq(t.users.status, 'INVITED'),
        ),
      )
      .returning({ id: t.users.id, institutionId: t.users.institutionId, role: t.users.role, sessionEpoch: t.users.sessionEpoch });
    if (!u) throw INVALID_LINK;
    return u;
  });
  await recordAudit(
    { userId: user.id, institutionId: user.institutionId, role: user.role },
    { action: 'INVITE_ACCEPTED', entityType: 'user', entityId: user.id, ...input.meta },
  );
  return { ...user, redirectTo: `/${portalForRole(user.role)}` };
}

/* ======================= registration approval ============================ */

export async function listPendingRegistrations(ctx: AuthContext) {
  if (!ctx.permissions.has('user:approve_registration')) throw new ForbiddenError();
  return db
    .select({
      id: t.users.id,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      email: t.users.email,
      emailVerifiedAt: t.users.emailVerifiedAt,
      createdAt: t.users.createdAt,
      rollNumber: t.studentProfiles.rollNumber,
      year: t.studentProfiles.currentYear,
      programName: t.programs.name,
      sectionName: t.sections.name,
    })
    .from(t.users)
    .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
    .leftJoin(t.programs, eq(t.programs.id, t.studentProfiles.programId))
    .leftJoin(t.sections, eq(t.sections.id, t.studentProfiles.sectionId))
    .where(and(eq(t.users.institutionId, ctx.institutionId), eq(t.users.status, 'PENDING'), isNull(t.users.deletedAt)))
    .orderBy(desc(t.users.createdAt))
    .limit(200);
}

export async function decideRegistration(
  ctx: AuthContext,
  input: { userId: string; approve: boolean; note?: string | null; meta: RequestMeta },
) {
  if (!ctx.permissions.has('user:approve_registration')) throw new ForbiddenError();
  const [u] = await db
    .update(t.users)
    .set({ status: input.approve ? 'ACTIVE' : 'ARCHIVED' })
    .where(
      and(
        eq(t.users.id, input.userId),
        eq(t.users.institutionId, ctx.institutionId),
        eq(t.users.status, 'PENDING'),
        // Only verified addresses can be approved — otherwise an admin could
        // activate an account whose owner never proved the email is theirs.
        ...(input.approve ? [sql`${t.users.emailVerifiedAt} IS NOT NULL`] : []),
      ),
    )
    .returning({ id: t.users.id, email: t.users.email, firstName: t.users.firstName });
  if (!u) {
    throw new ConflictError('This registration is no longer pending, or the student has not confirmed their email yet.');
  }
  await recordAudit(ctx, {
    action: input.approve ? 'REGISTRATION_APPROVED' : 'REGISTRATION_REJECTED',
    entityType: 'user',
    entityId: u.id,
    reason: input.note ?? null,
    ...input.meta,
  });
  return u;
}

/* =============================== sessions ================================= */

export async function listSessions(ctx: AuthContext) {
  const rows = await db
    .select({
      id: t.sessions.id,
      userAgent: t.sessions.userAgent,
      ipAddress: t.sessions.ipAddress,
      createdAt: t.sessions.createdAt,
      lastSeenAt: t.sessions.lastSeenAt,
      expiresAt: t.sessions.expiresAt,
    })
    .from(t.sessions)
    .where(and(eq(t.sessions.userId, ctx.userId), isNull(t.sessions.revokedAt), gt(t.sessions.expiresAt, new Date())))
    .orderBy(desc(t.sessions.lastSeenAt))
    .limit(50);
  return rows.map((r) => ({ ...r, current: r.id === ctx.sessionId }));
}

export async function revokeOwnSession(ctx: AuthContext, sessionId: string, meta: RequestMeta) {
  const [row] = await db
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.sessions.id, sessionId), eq(t.sessions.userId, ctx.userId), isNull(t.sessions.revokedAt)))
    .returning({ id: t.sessions.id });
  if (!row) throw new NotFoundError('Session');
  await recordAudit(ctx, { action: 'SESSION_REVOKED', entityType: 'session', entityId: sessionId, ...meta });
}

/** Signs out every other device while keeping this one. */
export async function revokeOtherSessions(ctx: AuthContext, meta: RequestMeta): Promise<number> {
  const rows = await db
    .update(t.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(t.sessions.userId, ctx.userId), ne(t.sessions.id, ctx.sessionId), isNull(t.sessions.revokedAt)))
    .returning({ id: t.sessions.id });
  await recordAudit(ctx, { action: 'SESSIONS_REVOKED_OTHERS', entityType: 'user', entityId: ctx.userId, after: { count: rows.length }, ...meta });
  return rows.length;
}
