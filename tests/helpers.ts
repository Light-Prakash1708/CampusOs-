import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { permissionsForRoles, portalForRole, type Role } from '@/lib/auth/permissions';
import { hashPassword } from '@/lib/auth/password';
import { setProviders, type EmailMessage } from '@/services/notifications/providers';
import { purgeTenant } from '../scripts/lib/purge';

/**
 * Integration-test fixtures. Each suite creates its OWN throwaway tenant so
 * tests never depend on (or damage) the demo seed, and so cross-tenant checks
 * have a real second college to try to reach.
 */

export const TEST_PASSWORD = 'Campus!Test2026';

export interface TestTenant {
  id: string;
  slug: string;
  name: string;
  departmentId: string;
  programId: string;
  sectionId: string;
}

export async function createTenant(opts: { mode?: 'DISABLED' | 'EMAIL_DOMAIN' | 'ADMIN_APPROVAL'; domains?: string[] } = {}): Promise<TestTenant> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [inst] = await db
    .insert(t.institutions)
    .values({
      slug,
      name: `Test College ${slug}`,
      city: 'Kolkata',
      state: 'West Bengal',
      isListed: true,
      registrationPolicy: { mode: opts.mode ?? 'DISABLED', allowedDomains: opts.domains ?? [] },
    })
    .returning();
  const [dept] = await db.insert(t.departments).values({ institutionId: inst!.id, name: 'Management', code: 'MGT' }).returning();
  const [program] = await db
    .insert(t.programs)
    .values({ institutionId: inst!.id, departmentId: dept!.id, name: 'BBA', code: 'BBA', durationYears: 3, totalSemesters: 6 })
    .returning();
  const [section] = await db
    .insert(t.sections)
    .values({ institutionId: inst!.id, programId: program!.id, name: 'Section 2', code: 'BBA-1-2', year: 1, semester: 1 })
    .returning();
  return { id: inst!.id, slug, name: inst!.name, departmentId: dept!.id, programId: program!.id, sectionId: section!.id };
}

export async function createUser(
  tenant: TestTenant,
  opts: { role?: Role; email?: string; status?: 'ACTIVE' | 'INVITED' | 'PENDING'; student?: boolean } = {},
) {
  const role = opts.role ?? 'STUDENT';
  const email = opts.email ?? `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@${tenant.slug}.edu`;
  const [user] = await db
    .insert(t.users)
    .values({
      institutionId: tenant.id,
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      firstName: 'Test',
      lastName: role,
      role,
      status: opts.status ?? 'ACTIVE',
      departmentId: tenant.departmentId,
      emailVerifiedAt: new Date(),
    })
    .returning();
  if (role === 'STUDENT' || opts.student) {
    await db.insert(t.studentProfiles).values({
      institutionId: tenant.id,
      userId: user!.id,
      rollNumber: `R-${randomUUID().slice(0, 8)}`,
      programId: tenant.programId,
      sectionId: tenant.sectionId,
    });
  }
  return user!;
}

/** Builds the same AuthContext `getCurrentUser()` would, straight from the DB. */
export async function ctxFor(userId: string, sessionId = randomUUID()): Promise<AuthContext> {
  const [row] = await db
    .select({ u: t.users, inst: t.institutions, sp: t.studentProfiles, fp: t.facultyProfiles })
    .from(t.users)
    .innerJoin(t.institutions, eq(t.institutions.id, t.users.institutionId))
    .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
    .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.userId, t.users.id))
    .where(and(eq(t.users.id, userId)))
    .limit(1);
  const u = row!.u;
  return {
    sessionId,
    userId: u.id,
    institutionId: u.institutionId,
    institutionName: row!.inst.name,
    institutionSlug: row!.inst.slug,
    institutionLogoUrl: null,
    institutionPrimaryColor: '#4F46E5',
    featureFlags: (row!.inst.featureFlags ?? {}) as Record<string, boolean>,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    fullName: `${u.firstName} ${u.lastName}`,
    displayName: `${u.firstName} ${u.lastName}`,
    avatarUrl: null,
    role: u.role as Role,
    secondaryRoles: (u.secondaryRoles ?? []) as string[],
    permissions: permissionsForRoles(u.role, (u.secondaryRoles ?? []) as string[]),
    departmentId: u.departmentId,
    campusId: null,
    studentProfileId: row!.sp?.id ?? null,
    sectionId: row!.sp?.sectionId ?? null,
    programId: row!.sp?.programId ?? null,
    facultyProfileId: row!.fp?.id ?? null,
    portal: portalForRole(u.role),
    locale: 'en',
  };
}

/** Captures outgoing email instead of printing or sending it. */
export function captureEmail() {
  const sent: EmailMessage[] = [];
  setProviders({
    email: {
      name: 'test',
      delivers: true,
      async send(m) {
        sent.push(m);
        return { ok: true, providerMessageId: `test-${sent.length}` };
      },
    },
  });
  return {
    sent,
    last: () => sent[sent.length - 1],
    /** Pulls `?token=` out of the most recent email to `to`. */
    tokenFor(to: string): string {
      const m = [...sent].reverse().find((x) => x.to === to);
      const match = m?.text.match(/token=([A-Za-z0-9_-]+)/);
      if (!match) throw new Error(`no token emailed to ${to}`);
      return match[1]!;
    },
  };
}

export async function dropTenant(id: string) {
  await purgeTenant(db, id);
}

export const meta = (ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) => ({
  ipAddress: ip,
  userAgent: 'vitest',
});
