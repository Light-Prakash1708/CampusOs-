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
import { navForPortal, MOBILE_NAV, type NavGroup } from './navigation';

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

  const nav = filterNav(navForPortal(portal), user);
  const badges = await loadBadges(user);

  return (
    <AppShell
      user={{
        fullName: user.fullName,
        displayName: user.displayName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        roleLabel: humanize(user.role),
        institutionName: user.institutionName,
        institutionLogoUrl: user.institutionLogoUrl,
        portal,
        subtitle: humanize(user.role),
      }}
      nav={nav}
      badges={badges}
      mobileNav={MOBILE_NAV[portal]}
      demoMode={process.env.DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production'}
    >
      {children}
    </AppShell>
  );
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
