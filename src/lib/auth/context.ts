import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, studentProfiles, facultyProfiles, institutions } from '@/lib/db/schema';
import { SESSION_COOKIE, verifySessionToken } from './session';
import {
  type Permission,
  type Role,
  permissionsForRoles,
  portalForRole,
} from './permissions';

/**
 * REQUEST CONTEXT
 * ---------------------------------------------------------------------------
 * `getCurrentUser()` is the single entry point for "who is asking?". It is
 * React-cached per request, so calling it in a layout and again in a page
 * costs one query.
 *
 * Every data-access helper in the app takes an `AuthContext` and derives the
 * tenant from it. No service function accepts a caller-supplied institutionId.
 */

export interface AuthContext {
  sessionId: string;
  userId: string;
  institutionId: string;
  institutionName: string;
  institutionSlug: string;
  institutionLogoUrl: string | null;
  institutionPrimaryColor: string;
  featureFlags: Record<string, boolean>;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  secondaryRoles: string[];
  permissions: Set<Permission>;
  departmentId: string | null;
  campusId: string | null;
  /** Present only for STUDENT accounts. */
  studentProfileId: string | null;
  sectionId: string | null;
  programId: string | null;
  /** Present only for FACULTY accounts. */
  facultyProfileId: string | null;
  portal: 'student' | 'faculty' | 'admin';
  locale: string;
}

export const getCurrentUser = cache(async (): Promise<AuthContext | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      role: users.role,
      secondaryRoles: users.secondaryRoles,
      departmentId: users.departmentId,
      campusId: users.campusId,
      locale: users.locale,
      institutionId: users.institutionId,
      institutionName: institutions.name,
      institutionSlug: institutions.slug,
      institutionLogoUrl: institutions.logoUrl,
      institutionPrimaryColor: institutions.primaryColor,
      featureFlags: institutions.featureFlags,
      studentProfileId: studentProfiles.id,
      sectionId: studentProfiles.sectionId,
      programId: studentProfiles.programId,
      facultyProfileId: facultyProfiles.id,
    })
    .from(users)
    .innerJoin(institutions, eq(institutions.id, users.institutionId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(facultyProfiles, eq(facultyProfiles.userId, users.id))
    .where(and(eq(users.id, payload.userId), eq(users.institutionId, payload.institutionId)))
    .limit(1);

  if (!row) return null;

  const secondary = (row.secondaryRoles ?? []) as string[];
  const fullName = `${row.firstName} ${row.lastName}`.trim();

  return {
    sessionId: payload.sid,
    userId: row.id,
    institutionId: row.institutionId,
    institutionName: row.institutionName,
    institutionSlug: row.institutionSlug,
    institutionLogoUrl: row.institutionLogoUrl,
    institutionPrimaryColor: row.institutionPrimaryColor ?? '#4F46E5',
    featureFlags: (row.featureFlags ?? {}) as Record<string, boolean>,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName,
    displayName: row.displayName ?? fullName,
    avatarUrl: row.avatarUrl,
    role: row.role as Role,
    secondaryRoles: secondary,
    permissions: permissionsForRoles(row.role, secondary),
    departmentId: row.departmentId,
    campusId: row.campusId,
    studentProfileId: row.studentProfileId,
    sectionId: row.sectionId,
    programId: row.programId,
    facultyProfileId: row.facultyProfileId,
    portal: portalForRole(row.role),
    locale: row.locale,
  };
});

/** Redirects to login when unauthenticated. Use in server components. */
export async function requireAuth(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Redirects to /forbidden when the capability is missing.
 * Server components should call this rather than hiding UI alone — hidden UI
 * is not access control.
 */
export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const user = await requireAuth();
  if (!user.permissions.has(permission)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permission)}`);
  }
  return user;
}

export async function requireAnyPermission(permissions: Permission[]): Promise<AuthContext> {
  const user = await requireAuth();
  if (!permissions.some((p) => user.permissions.has(p))) {
    redirect(`/forbidden?permission=${encodeURIComponent(permissions[0] ?? '')}`);
  }
  return user;
}

export function can(user: AuthContext | null, permission: Permission): boolean {
  return !!user?.permissions.has(permission);
}

/** Client IP + UA for audit records. */
export async function getRequestMetadata(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return {
    ipAddress: forwarded ? (forwarded.split(',')[0] ?? '').trim() || null : h.get('x-real-ip'),
    userAgent: h.get('user-agent'),
  };
}
