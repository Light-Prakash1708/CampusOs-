import { redirect } from 'next/navigation';
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  notifications,
  grievances,
  approvals,
  submissions,
  assignments,
  courseOfferings,
} from '@/lib/db/schema';
import { requireAuth, type AuthContext } from '@/lib/auth/context';
import { isEnabled, type FeatureFlag } from '@/lib/features';
import { humanize } from '@/lib/utils';
import { AppShell, type ShellBadges } from './AppShell';
import {
  navForPortal,
  MOBILE_NAV,
  QUICK_CREATE,
  type NavGroup,
  type MobileNavItem,
  type QuickCreateItem,
} from './navigation';
import { studentProfiles, programs, sections, institutions } from '@/lib/db/schema';
import { avatarToneFor } from '@/components/campus/pixel';

/**
 * Server-side portal wrapper.
 *
 * Responsibilities:
 *   1. Enforce that the caller belongs in this portal.
 *   2. Filter navigation by permission AND tenant feature flags, so a disabled
 *      module is absent rather than present-but-broken.
 *   3. Load the small set of counts the shell displays.
 */
export async function PortalLayout({
  portal,
  children,
}: {
  portal: 'student' | 'faculty' | 'admin';
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // A user who lands in the wrong portal is redirected to their own.
  if (user.portal !== portal) redirect(`/${user.portal}`);
  // Temporary passwords (imports, admin resets) must be replaced before use.
  if (user.mustChangePassword) redirect('/account/security?required=1');

  const nav = filterNav(navForPortal(portal), user);
  const [badges, identity] = await Promise.all([loadBadges(user), loadIdentity(user)]);

  return (
    <AppShell
      user={{
        fullName: user.fullName,
        displayName: user.displayName,
        firstName: user.firstName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        avatarTone: avatarToneFor(user.userId),
        roleLabel: humanize(user.role),
        institutionName: user.institutionName,
        institutionLabel: identity.institutionLabel,
        institutionLogoUrl: user.institutionLogoUrl,
        portal,
        subtitle: identity.subtitle ?? humanize(user.role),
      }}
      nav={nav}
      badges={badges}
      mobileNav={filterMobileNav(MOBILE_NAV[portal], user)}
      quickCreate={filterQuickCreate(QUICK_CREATE[portal], user)}
      demoMode={process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production'}
    >
      {children}
    </AppShell>
  );
}

function allowed(user: AuthContext, feature?: FeatureFlag, permissions?: string[]) {
  if (feature && !isEnabled(user.featureFlags, feature)) return false;
  if (permissions && !permissions.some((p) => user.permissions.has(p as never))) return false;
  return true;
}

function filterMobileNav(items: MobileNavItem[], user: AuthContext): MobileNavItem[] {
  return items.map((item) =>
    allowed(user, item.feature) || !item.fallback ? item : { ...item, ...item.fallback, feature: undefined },
  ).filter((item) => allowed(user, item.feature));
}

function filterQuickCreate(items: QuickCreateItem[], user: AuthContext): QuickCreateItem[] {
  return items.filter((i) => allowed(user, i.feature, i.permissions));
}

/** "BBA · Year 1 · Section 2" for students; the institution's short label for the top bar. */
async function loadIdentity(user: AuthContext): Promise<{ subtitle: string | null; institutionLabel: string }> {
  const [inst] = await db
    .select({ shortName: institutions.shortName, city: institutions.city })
    .from(institutions)
    .where(eq(institutions.id, user.institutionId))
    .limit(1);
  const institutionLabel = [inst?.shortName ?? user.institutionName, inst?.city].filter(Boolean).join(', ');
  if (!user.studentProfileId) return { subtitle: null, institutionLabel };
  const [row] = await db
    .select({ program: programs.code, year: studentProfiles.currentYear, section: sections.name })
    .from(studentProfiles)
    .innerJoin(programs, eq(programs.id, studentProfiles.programId))
    .leftJoin(sections, eq(sections.id, studentProfiles.sectionId))
    .where(eq(studentProfiles.id, user.studentProfileId))
    .limit(1);
  if (!row) return { subtitle: null, institutionLabel };
  const section = row.section ? (/^section/i.test(row.section) ? row.section : `Section ${row.section}`) : null;
  return { subtitle: [row.program, `Year ${row.year}`, section].filter(Boolean).join(' · '), institutionLabel };
}

function filterNav(groups: NavGroup[], user: AuthContext): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.feature && !isEnabled(user.featureFlags, item.feature as FeatureFlag)) {
          return false;
        }
        if (item.permissions && !item.permissions.some((p) => user.permissions.has(p))) {
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}

async function loadBadges(user: AuthContext): Promise<ShellBadges> {
  const [unreadNotifications] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.userId), isNull(notifications.readAt)));

  let grievanceCount = 0;
  if (user.permissions.has('grievance:view_all')) {
    const [row] = await db
      .select({ value: count() })
      .from(grievances)
      .where(
        and(
          eq(grievances.institutionId, user.institutionId),
          inArray(grievances.status, [
            'SUBMITTED',
            'ACKNOWLEDGED',
            'ASSIGNED',
            'UNDER_REVIEW',
            'AWAITING_INFORMATION',
            'REOPENED',
          ]),
        ),
      );
    grievanceCount = row?.value ?? 0;
  } else if (user.permissions.has('grievance:view_assigned')) {
    const [row] = await db
      .select({ value: count() })
      .from(grievances)
      .where(
        and(
          eq(grievances.assignedToId, user.userId),
          inArray(grievances.status, [
            'ASSIGNED',
            'UNDER_REVIEW',
            'AWAITING_INFORMATION',
            'REOPENED',
          ]),
        ),
      );
    grievanceCount = row?.value ?? 0;
  } else if (user.permissions.has('grievance:view_own')) {
    const [row] = await db
      .select({ value: count() })
      .from(grievances)
      .where(
        and(
          eq(grievances.raisedById, user.userId),
          inArray(grievances.status, ['RESOLUTION_PROPOSED', 'AWAITING_INFORMATION']),
        ),
      );
    grievanceCount = row?.value ?? 0;
  }

  let approvalCount = 0;
  if (
    user.permissions.has('timetable:approve_change') ||
    user.permissions.has('announcement:approve') ||
    user.permissions.has('leave:approve')
  ) {
    const [row] = await db
      .select({ value: count() })
      .from(approvals)
      .where(
        and(
          eq(approvals.institutionId, user.institutionId),
          eq(approvals.status, 'PENDING'),
          or(
            isNull(approvals.assignedApproverId),
            eq(approvals.assignedApproverId, user.userId),
          ),
        ),
      );
    approvalCount = row?.value ?? 0;
  }

  let pendingGrading = 0;
  if (user.facultyProfileId) {
    const [row] = await db
      .select({ value: count() })
      .from(submissions)
      .innerJoin(assignments, eq(assignments.id, submissions.assignmentId))
      .innerJoin(courseOfferings, eq(courseOfferings.id, assignments.offeringId))
      .where(
        and(
          eq(courseOfferings.facultyId, user.facultyProfileId),
          inArray(submissions.status, ['SUBMITTED', 'LATE', 'RESUBMITTED']),
        ),
      );
    pendingGrading = row?.value ?? 0;
  }

  return {
    notifications: unreadNotifications?.value ?? 0,
    grievances: grievanceCount,
    approvals: approvalCount,
    pendingGrading,
  };
}
