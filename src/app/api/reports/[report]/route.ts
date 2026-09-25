import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { withAuth, AppError } from '@/lib/api';
import {
  computeCommunicationHealth, computeGrievanceHealth, computeRoomUtilization, computeWorkloadBalance,
} from '@/services/analytics';
import { recordAudit } from '@/services/audit';

/** Escapes a value for CSV, quoting when needed. */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\n');
}

/**
 * Streams a report as CSV, generated from live data at request time.
 * Every export is audited, because exports move institutional data off-platform.
 */
export const GET = withAuth('report:generate', async (_request, { user, params }) => {
  const report = params.report;
  let csv: string;
  let filename: string;

  switch (report) {
    case 'attendance': {
      const rows = await db
        .select({
          rollNumber: t.studentProfiles.rollNumber,
          firstName: t.users.firstName,
          lastName: t.users.lastName,
          section: t.sections.code,
          subject: t.subjects.code,
          subjectName: t.subjects.name,
          held: t.attendanceSummaries.heldSessions,
          attended: t.attendanceSummaries.attendedSessions,
          percentageBp: t.attendanceSummaries.percentageBp,
          below: t.attendanceSummaries.isBelowThreshold,
        })
        .from(t.attendanceSummaries)
        .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceSummaries.studentId))
        .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
        .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
        .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
        .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
        .where(eq(t.attendanceSummaries.institutionId, user.institutionId));

      csv = toCsv(
        ['Roll number', 'Name', 'Section', 'Subject code', 'Subject', 'Held', 'Attended', 'Percentage', 'Below requirement'],
        rows.map((r) => [
          r.rollNumber, `${r.firstName} ${r.lastName}`, r.section, r.subject, r.subjectName,
          r.held, r.attended, (r.percentageBp / 100).toFixed(2), r.below ? 'YES' : 'NO',
        ]),
      );
      filename = 'attendance-register.csv';
      break;
    }

    case 'workload': {
      const balance = await computeWorkloadBalance(user.institutionId);
      csv = toCsv(
        ['Faculty', 'Department', 'Total weekly hours', 'Contracted maximum', 'Utilisation %', 'Department average', 'Status'],
        balance.faculty.map((f) => [
          f.name, f.department, f.totalHours, f.contractedMax,
          f.utilizationPercent.toFixed(1), f.departmentAverage ?? '', f.status,
        ]),
      );
      filename = 'faculty-workload.csv';
      break;
    }

    case 'utilization': {
      const utilisation = await computeRoomUtilization(user.institutionId);
      csv = toCsv(
        ['Room', 'Type', 'Capacity', 'Periods occupied', 'Total periods', 'Utilisation %', 'Average spare seats'],
        utilisation.rooms.map((r) => [
          r.code, r.type, r.capacity, r.occupiedSlots, utilisation.totalTeachingSlots,
          r.utilizationPercent, r.averageSpareSeats,
        ]),
      );
      filename = 'room-utilisation.csv';
      break;
    }

    case 'grievances': {
      const rows = await db
        .select({
          caseNumber: t.grievances.caseNumber,
          category: t.grievanceCategories.name,
          subject: t.grievances.subject,
          status: t.grievances.status,
          urgency: t.grievances.urgency,
          createdAt: t.grievances.createdAt,
          resolvedAt: t.grievances.resolvedAt,
          breached: t.grievances.isSlaBreached,
          anonymous: t.grievances.isAnonymous,
        })
        .from(t.grievances)
        .innerJoin(t.grievanceCategories, eq(t.grievanceCategories.id, t.grievances.categoryId))
        .where(eq(t.grievances.institutionId, user.institutionId))
        .orderBy(desc(t.grievances.createdAt));

      // Raiser identity is deliberately excluded — an export must not become a
      // way around the anonymity guarantee.
      csv = toCsv(
        ['Case number', 'Category', 'Subject', 'Status', 'Urgency', 'Raised', 'Resolved', 'SLA breached', 'Anonymous'],
        rows.map((r) => [
          r.caseNumber, r.category, r.subject, r.status, r.urgency,
          r.createdAt.toISOString(), r.resolvedAt?.toISOString() ?? '',
          r.breached ? 'YES' : 'NO', r.anonymous ? 'YES' : 'NO',
        ]),
      );
      filename = 'readdressal-summary.csv';
      break;
    }

    case 'communication': {
      const health = await computeCommunicationHealth(user.institutionId);
      const rows = await db
        .select({
          reference: t.announcements.reference,
          title: t.announcements.title,
          category: t.announcements.category,
          priority: t.announcements.priority,
          publishedAt: t.announcements.publishedAt,
          recipients: t.announcements.recipientCount,
          read: t.announcements.readCount,
          acknowledged: t.announcements.acknowledgedCount,
          requiresAck: t.announcements.requiresAcknowledgement,
        })
        .from(t.announcements)
        .where(
          and(
            eq(t.announcements.institutionId, user.institutionId),
            eq(t.announcements.status, 'PUBLISHED'),
          ),
        )
        .orderBy(desc(t.announcements.publishedAt));

      csv = toCsv(
        ['Reference', 'Title', 'Category', 'Priority', 'Published', 'Recipients', 'Read', 'Acknowledged', 'Acknowledgement required'],
        rows.map((r) => [
          r.reference, r.title, r.category, r.priority, r.publishedAt?.toISOString() ?? '',
          r.recipients, r.read, r.acknowledged, r.requiresAck ? 'YES' : 'NO',
        ]),
      );
      filename = 'communication-reach.csv';
      break;
    }

    default:
      throw new AppError(
        `There is no report called “${report}”.`,
        404,
        'UNKNOWN_REPORT',
        undefined,
        'Choose one of the reports listed on the Reports page.',
      );
  }

  await recordAudit(user, {
    action: 'DATA_EXPORTED',
    entityType: `report:${report}`,
  });

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
