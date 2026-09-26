import 'server-only';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { appUrl } from '@/lib/env';
import { FEATURE_FLAGS, isBuilt, type FeatureFlag } from '@/lib/features';
import { recordAudit } from '@/services/audit';
import { issueToken, TOKEN_TTL_MINUTES } from '@/services/auth/tokens';
import { sendTransactionalEmail } from '@/services/notifications/dispatcher';
import { inviteEmail } from '@/services/notifications/templates';
import { enforceRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';

/**
 * INSTITUTION ONBOARDING
 * ---------------------------------------------------------------------------
 * Creating a college is the one action that crosses tenants, so it belongs to
 * a *platform operator*: an active SUPER_ADMIN whose email is listed in
 * PLATFORM_OPERATOR_EMAILS. Both conditions are required — the role can only
 * be obtained through provisioning or an invitation (never self-sign-up), and
 * the allowlist is deployment configuration. An operator can create a tenant
 * and invite its first administrator; nothing here reads another tenant's data.
 *
 * The first administrator is a SUPER_ADMIN *of the new college* (the existing
 * top role inside a tenant). The role is fixed on the invited account row; the
 * invitation link only sets a password.
 */

export const INSTITUTION_TYPES = ['University', 'College', 'Institute', 'School'] as const;

/** Modules offered at creation: built, and not delivery channels that need providers. */
export const ONBOARDING_MODULES: FeatureFlag[] = (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).filter(
  (f) => isBuilt(f) && !['email_enabled', 'push_enabled', 'sms_enabled', 'whatsapp_enabled', 'overlay_mode_enabled'].includes(f),
);

function operatorEmails(): string[] {
  return (process.env.PLATFORM_OPERATOR_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformOperator(ctx: Pick<AuthContext, 'role' | 'email'> | null): boolean {
  if (!ctx || ctx.role !== 'SUPER_ADMIN') return false;
  return operatorEmails().includes(ctx.email.trim().toLowerCase());
}

export function assertPlatformOperator(ctx: AuthContext) {
  if (!isPlatformOperator(ctx)) throw new ForbiddenError('Only the CampusOS platform team can create institutions.');
}

export interface NewInstitutionInput {
  name: string;
  shortName?: string | null;
  slug: string;
  institutionType?: string | null;
  website?: string | null;
  officialDomain?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone: string;
  /** How students can join: invitations only, or requests reviewed by the college. */
  joinPolicy: 'INVITATION_ONLY' | 'ADMIN_APPROVAL';
  idDocument: 'REQUIRED' | 'OPTIONAL';
  listed: boolean;
  modules: string[];
  admin: { firstName: string; lastName: string; email: string };
  meta: { ipAddress: string | null; userAgent: string | null };
}

export interface NewInstitutionResult {
  institutionId: string;
  slug: string;
  adminUserId: string;
  emailSent: boolean;
  /** Only when the email could not be delivered: share it privately with the administrator. */
  inviteUrl: string | null;
  expiresAt: Date;
}

export async function createInstitution(ctx: AuthContext, input: NewInstitutionInput): Promise<NewInstitutionResult> {
  assertPlatformOperator(ctx);
  await enforceRateLimit(keyFor('invite', ctx.userId), RATE_LIMITS.invitePerAdmin, 'Too many institutions created this hour.');

  const featureFlags = Object.fromEntries(
    ONBOARDING_MODULES.map((f) => [f, input.modules.includes(f)]),
  ) as Record<string, boolean>;
  const domain = input.officialDomain?.trim().toLowerCase().replace(/^@/, '') || null;
  const adminEmail = input.admin.email.trim().toLowerCase();

  const created = await db
    .transaction(async (tx) => {
      const [inst] = await tx
        .insert(t.institutions)
        .values({
          slug: input.slug,
          name: input.name.trim(),
          shortName: input.shortName?.trim() || null,
          institutionType: input.institutionType || null,
          website: input.website?.trim() || null,
          city: input.city?.trim() || null,
          state: input.state?.trim() || null,
          country: input.country?.trim() || 'India',
          timezone: input.timezone,
          contactEmail: adminEmail,
          kind: 'COLLEGE',
          isListed: input.listed,
          featureFlags,
          registrationPolicy: {
            mode: input.joinPolicy === 'ADMIN_APPROVAL' ? 'ADMIN_APPROVAL' : 'DISABLED',
            allowedDomains: domain ? [domain] : [],
            idDocument: input.idDocument,
          },
        })
        .returning({ id: t.institutions.id, name: t.institutions.name, slug: t.institutions.slug });
      const [admin] = await tx
        .insert(t.users)
        .values({
          institutionId: inst!.id,
          email: adminEmail,
          firstName: input.admin.firstName.trim(),
          lastName: input.admin.lastName.trim(),
          role: 'SUPER_ADMIN',
          status: 'INVITED',
        })
        .returning({ id: t.users.id });
      return { inst: inst!, adminId: admin!.id };
    })
    .catch((error: unknown) => {
      const pg = pgErrorOf(error);
      if (pg.code === '23505' && pg.constraint === 'institutions_slug_uq') {
        throw new ConflictError('That short web name is already taken.', undefined, 'Choose a different slug.');
      }
      throw error;
    });

  const { raw, expiresAt } = await issueToken({
    institutionId: created.inst.id,
    userId: created.adminId,
    purpose: 'INVITE',
    sentTo: adminEmail,
    createdById: null,
  });
  const url = appUrl(`/invite?token=${raw}`);
  const sent = await sendTransactionalEmail({
    institutionId: created.inst.id,
    userId: created.adminId,
    message: inviteEmail({
      to: adminEmail,
      firstName: input.admin.firstName.trim(),
      institutionName: created.inst.name,
      inviterName: 'The CampusOS team',
      roleLabel: 'administrator',
      url,
      expiresDays: TOKEN_TTL_MINUTES.INVITE / 60 / 24,
    }),
  });

  const after = { slug: created.inst.slug, name: created.inst.name, admin: adminEmail, joinPolicy: input.joinPolicy, emailSent: sent.sent };
  // In the operator's own tenant (who did it) and in the new tenant (so its history starts with its creation).
  await recordAudit(ctx, { action: 'INSTITUTION_CREATED', entityType: 'institution', entityId: created.inst.id, after, ...input.meta });
  await recordAudit(
    null,
    { action: 'INSTITUTION_CREATED', entityType: 'institution', entityId: created.inst.id, after: { ...after, by: ctx.email }, ...input.meta },
    created.inst.id,
  );
  await recordAudit(
    null,
    { action: 'USER_INVITED', entityType: 'user', entityId: created.adminId, after: { email: adminEmail, role: 'SUPER_ADMIN', by: ctx.email, emailSent: sent.sent } },
    created.inst.id,
  );

  return {
    institutionId: created.inst.id,
    slug: created.inst.slug,
    adminUserId: created.adminId,
    emailSent: sent.sent,
    inviteUrl: sent.sent ? null : url,
    expiresAt,
  };
}

/** Colleges on this deployment, for the operator's list. Personal workspaces are excluded. */
export async function listInstitutions(ctx: AuthContext) {
  assertPlatformOperator(ctx);
  return db
    .select({
      id: t.institutions.id,
      name: t.institutions.name,
      slug: t.institutions.slug,
      city: t.institutions.city,
      isActive: t.institutions.isActive,
      setupCompletedAt: t.institutions.setupCompletedAt,
      createdAt: t.institutions.createdAt,
      students: sql<number>`(SELECT count(*)::int FROM users u WHERE u.institution_id = ${t.institutions.id} AND u.role = 'STUDENT' AND u.deleted_at IS NULL)`,
      staff: sql<number>`(SELECT count(*)::int FROM users u WHERE u.institution_id = ${t.institutions.id} AND u.role <> 'STUDENT' AND u.deleted_at IS NULL)`,
    })
    .from(t.institutions)
    .where(and(eq(t.institutions.kind, 'COLLEGE'), isNull(t.institutions.deletedAt)))
    .orderBy(asc(t.institutions.name))
    .limit(200);
}

/* ============================ setup progress ============================== */

export interface SetupStep {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  href: string;
}

/**
 * The college's path from "just created" to "ready for a pilot", computed from
 * what exists — nothing to keep in sync, and it resumes wherever they left off.
 */
export async function getSetupProgress(institutionId: string) {
  const [inst] = await db
    .select({
      name: t.institutions.name,
      city: t.institutions.city,
      setupCompletedAt: t.institutions.setupCompletedAt,
      policy: t.institutions.registrationPolicy,
      flagsTouched: sql<boolean>`${t.institutions.featureFlags} <> '{}'::jsonb`,
    })
    .from(t.institutions)
    .where(eq(t.institutions.id, institutionId))
    .limit(1);
  const countOf = async (table: typeof t.departments | typeof t.programs | typeof t.sections) => {
    const [r] = await db
      .select({ n: count() })
      .from(table)
      .where(and(eq(table.institutionId, institutionId), isNull(table.deletedAt)));
    return r?.n ?? 0;
  };
  const [departments, programs, sections, people] = await Promise.all([
    countOf(t.departments),
    countOf(t.programs),
    countOf(t.sections),
    db
      .select({ role: t.users.role, status: t.users.status, n: count() })
      .from(t.users)
      .where(and(eq(t.users.institutionId, institutionId), isNull(t.users.deletedAt)))
      .groupBy(t.users.role, t.users.status),
  ]);
  const tally = (pred: (r: { role: string; status: string }) => boolean) =>
    people.filter(pred).reduce((a, r) => a + Number(r.n), 0);
  const admins = tally((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r.role) && r.status === 'ACTIVE');
  const faculty = tally((r) => r.role === 'FACULTY');
  const facultyActive = tally((r) => r.role === 'FACULTY' && r.status === 'ACTIVE');
  const students = tally((r) => r.role === 'STUDENT');

  const steps: SetupStep[] = [
    { key: 'institution', label: 'Institution profile', done: !!inst?.city, detail: inst?.city ? `${inst.name}, ${inst.city}` : 'Add your city and contact details', href: '/admin/settings' },
    { key: 'admin', label: 'Administrator', done: admins > 0, detail: `${admins} active administrator${admins === 1 ? '' : 's'}`, href: '/admin/access' },
    {
      key: 'structure',
      label: 'Academic structure',
      done: departments > 0 && programs > 0 && sections > 0,
      detail: `${departments} departments · ${programs} programmes · ${sections} sections`,
      href: '/admin/structure',
    },
    { key: 'faculty', label: 'Faculty', done: faculty > 0, detail: `${facultyActive} active · ${faculty - facultyActive} invited`, href: '/admin/access' },
    { key: 'students', label: 'Students', done: students > 0, detail: `${students} student accounts`, href: '/admin/import' },
    {
      key: 'joining',
      label: 'How students join',
      done: inst?.policy.mode !== undefined,
      detail:
        inst?.policy.mode === 'DISABLED'
          ? 'Invitations and imports only'
          : `Join requests reviewed by you${inst?.policy.idDocument === 'REQUIRED' ? ' · ID required' : ''}`,
      href: '/admin/settings',
    },
    { key: 'modules', label: 'Modules', done: !!inst?.flagsTouched, detail: 'Choose what your campus uses', href: '/admin/settings' },
  ];
  return { steps, launched: !!inst?.setupCompletedAt, ready: steps.every((s) => s.done) };
}

export async function markSetupComplete(ctx: AuthContext, meta: { ipAddress: string | null; userAgent: string | null }) {
  if (!ctx.permissions.has('institution:manage')) throw new ForbiddenError();
  const progress = await getSetupProgress(ctx.institutionId);
  if (!progress.ready) {
    throw new AppError('A few setup steps are still open.', 422, 'SETUP_INCOMPLETE', progress.steps.filter((s) => !s.done).map((s) => s.label));
  }
  await db
    .update(t.institutions)
    .set({ setupCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(t.institutions.id, ctx.institutionId), isNull(t.institutions.setupCompletedAt)));
  await recordAudit(ctx, { action: 'INSTITUTION_LAUNCHED', entityType: 'institution', entityId: ctx.institutionId, ...meta });
}
