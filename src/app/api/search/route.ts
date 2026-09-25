import { and, eq, ilike, or, isNull, sql, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { withAuth, ok } from '@/lib/api';

/**
 * Global search for the command palette.
 *
 * Results are permission-filtered at the QUERY level, not after the fact:
 * a student's search simply never joins rows they cannot see. The palette is a
 * convenience, never a way to widen access.
 */
export const GET = withAuth(null, async (request, { user }) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  if (q.length < 2) return ok({ results: [] });

  const like = `%${q}%`;
  const results: {
    id: string;
    title: string;
    subtitle?: string;
    group: string;
    href: string;
  }[] = [];

  // --- Classes the caller is part of -------------------------------------
  const classRows = await db
    .select({
      id: t.courseOfferings.id,
      code: t.subjects.code,
      name: t.subjects.name,
      sectionCode: t.sections.code,
    })
    .from(t.courseOfferings)
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .where(
      and(
        eq(t.courseOfferings.institutionId, user.institutionId),
        or(ilike(t.subjects.name, like), ilike(t.subjects.code, like)),
        user.sectionId ? eq(t.courseOfferings.sectionId, user.sectionId) : sql`true`,
        user.facultyProfileId && !user.permissions.has('academic:manage_structure')
          ? eq(t.courseOfferings.facultyId, user.facultyProfileId)
          : sql`true`,
      ),
    )
    .limit(5);

  for (const row of classRows) {
    results.push({
      id: `class-${row.id}`,
      title: `${row.code} ${row.name}`,
      subtitle: `Class · ${row.sectionCode}`,
      group: 'Classes',
      href: `/${user.portal}/schedule`,
    });
  }

  // --- Announcements addressed to the caller ------------------------------
  const noticeRows = await db
    .select({
      id: t.announcements.id,
      title: t.announcements.title,
      reference: t.announcements.reference,
      category: t.announcements.category,
    })
    .from(t.announcementRecipients)
    .innerJoin(t.announcements, eq(t.announcements.id, t.announcementRecipients.announcementId))
    .where(
      and(
        eq(t.announcementRecipients.userId, user.userId),
        eq(t.announcements.status, 'PUBLISHED'),
        or(ilike(t.announcements.title, like), ilike(t.announcements.body, like)),
      ),
    )
    .orderBy(desc(t.announcements.publishedAt))
    .limit(5);

  for (const row of noticeRows) {
    results.push({
      id: `notice-${row.id}`,
      title: row.title,
      subtitle: `${row.reference} · ${row.category}`,
      group: 'Notices',
      href: `/${user.portal}/announcements/${row.id}`,
    });
  }

  // --- Resources (full-text) ----------------------------------------------
  const resourceRows = await db
    .select({
      id: t.resources.id,
      title: t.resources.title,
      topic: t.resources.topic,
    })
    .from(t.resources)
    .where(
      and(
        eq(t.resources.institutionId, user.institutionId),
        eq(t.resources.status, 'PUBLISHED'),
        isNull(t.resources.deletedAt),
        sql`${t.resources.searchVector} @@ plainto_tsquery('english', ${q})`,
      ),
    )
    .limit(5);

  for (const row of resourceRows) {
    results.push({
      id: `resource-${row.id}`,
      title: row.title,
      subtitle: row.topic ? `Resource · ${row.topic}` : 'Resource',
      group: 'Resources',
      href: `/${user.portal}/resources/${row.id}`,
    });
  }

  // --- Rooms (staff only) --------------------------------------------------
  if (user.permissions.has('room:view')) {
    const roomRows = await db
      .select({ id: t.rooms.id, code: t.rooms.code, type: t.rooms.type, capacity: t.rooms.capacity })
      .from(t.rooms)
      .where(
        and(
          eq(t.rooms.institutionId, user.institutionId),
          isNull(t.rooms.deletedAt),
          or(ilike(t.rooms.code, like), ilike(t.rooms.name, like)),
        ),
      )
      .limit(4);

    for (const row of roomRows) {
      results.push({
        id: `room-${row.id}`,
        title: `Room ${row.code}`,
        subtitle: `${row.type} · seats ${row.capacity}`,
        group: 'Rooms',
        href: `/admin/rooms`,
      });
    }
  }

  // --- People (only for roles permitted to see them) ----------------------
  if (user.permissions.has('user:view_all') || user.permissions.has('user:view_department')) {
    const peopleRows = await db
      .select({
        id: t.users.id,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        role: t.users.role,
        rollNumber: t.studentProfiles.rollNumber,
      })
      .from(t.users)
      .leftJoin(t.studentProfiles, eq(t.studentProfiles.userId, t.users.id))
      .where(
        and(
          eq(t.users.institutionId, user.institutionId),
          isNull(t.users.deletedAt),
          or(
            ilike(t.users.firstName, like),
            ilike(t.users.lastName, like),
            ilike(t.studentProfiles.rollNumber, like),
          ),
          user.permissions.has('user:view_all')
            ? sql`true`
            : eq(t.users.departmentId, user.departmentId ?? ''),
        ),
      )
      .limit(6);

    for (const row of peopleRows) {
      results.push({
        id: `person-${row.id}`,
        title: `${row.firstName} ${row.lastName}`,
        subtitle: row.rollNumber ? `Student · ${row.rollNumber}` : row.role.replace('_', ' '),
        group: 'People',
        href: row.rollNumber ? `/admin/students/${row.id}` : `/admin/faculty/${row.id}`,
      });
    }
  }

  // --- Grievance cases by number ------------------------------------------
  const caseRows = await db
    .select({
      id: t.grievances.id,
      caseNumber: t.grievances.caseNumber,
      subject: t.grievances.subject,
      status: t.grievances.status,
    })
    .from(t.grievances)
    .where(
      and(
        eq(t.grievances.institutionId, user.institutionId),
        or(ilike(t.grievances.caseNumber, like), ilike(t.grievances.subject, like)),
        user.permissions.has('grievance:view_all')
          ? sql`true`
          : or(
              eq(t.grievances.raisedById, user.userId),
              eq(t.grievances.assignedToId, user.userId),
            ),
      ),
    )
    .limit(4);

  for (const row of caseRows) {
    results.push({
      id: `case-${row.id}`,
      title: row.caseNumber,
      subtitle: `${row.subject} · ${row.status.replace('_', ' ').toLowerCase()}`,
      group: 'Cases',
      href: `/${user.portal}/redressal/${row.id}`,
    });
  }

  return ok({ results });
});
