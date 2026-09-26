import 'server-only';
import { and, asc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { strToU8, zipSync } from 'fflate';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { track } from '@/services/product-events';
import { committeeStatus } from '@/services/grievance-committee';

/**
 * CAMPUS EVIDENCE (CAMPUSOS-014)
 * ---------------------------------------------------------------------------
 * The single source for institutional numbers. The evidence pack, Campus
 * Insights and the operator metrics all call these functions, so a number
 * never differs between the dashboard and the export (tests/evidence-pack
 * reconciles them). Aggregates by default; individual-level rows only with
 * `data:export`, and every export is audited.
 *
 * Section names are generic on purpose: mapping to specific NAAC criteria is
 * not verified yet (strategy §10a) and is left to the college's IQAC.
 */

export interface Range {
  from: Date;
  to: Date;
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

/* ------------------------------ communication ----------------------------- */

export interface CommunicationSummary {
  published: number;
  requiringAck: number;
  /** Recipients of notices that required acknowledgement. */
  ackRecipients: number;
  acknowledged: number;
  /** Pooled: acknowledged ÷ recipients, over notices that required it. */
  ackRate: number | null;
  recipients: number;
  read: number;
  readRate: number | null;
  outstanding: number;
  notices: { reference: string; title: string; publishedAt: Date | null; requiresAck: boolean; recipients: number; read: number; acknowledged: number; deadline: Date | null }[];
}

/**
 * Counted from each recipient's own row (not denormalised counters), so the
 * numbers equal what the sender sees on the notice's receipts.
 */
export async function communicationSummary(institutionId: string, range: Range): Promise<CommunicationSummary> {
  const rows = (
    await db.execute(sql`
      SELECT a.reference, a.title, a.published_at AS "publishedAt", a.requires_acknowledgement AS "requiresAck",
             a.acknowledgement_deadline AS deadline,
             count(r.id)::int AS recipients, count(r.read_at)::int AS read, count(r.acknowledged_at)::int AS acknowledged
      FROM announcements a
      LEFT JOIN announcement_recipients r ON r.announcement_id = a.id
      WHERE a.institution_id = ${institutionId} AND a.deleted_at IS NULL
        AND a.status IN ('PUBLISHED', 'EXPIRED')
        AND a.published_at >= ${range.from} AND a.published_at < ${range.to}
      GROUP BY a.id
      ORDER BY a.published_at`)
  ).rows as { reference: string; title: string; publishedAt: Date | string | null; requiresAck: boolean; deadline: Date | string | null; recipients: number; read: number; acknowledged: number }[];

  const toDate = (v: Date | string | null) => (v === null ? null : v instanceof Date ? v : new Date(v));
  const notices = rows.map((r) => ({ ...r, publishedAt: toDate(r.publishedAt), deadline: toDate(r.deadline), recipients: Number(r.recipients), read: Number(r.read), acknowledged: Number(r.acknowledged) }));
  const ack = notices.filter((n) => n.requiresAck);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const ackRecipients = sum(ack.map((n) => n.recipients));
  const acknowledged = sum(ack.map((n) => n.acknowledged));
  const recipients = sum(notices.map((n) => n.recipients));
  const read = sum(notices.map((n) => n.read));
  return {
    published: notices.length,
    requiringAck: ack.length,
    ackRecipients,
    acknowledged,
    ackRate: pct(acknowledged, ackRecipients),
    recipients,
    read,
    readRate: pct(read, recipients),
    outstanding: ackRecipients - acknowledged,
    notices,
  };
}

/* -------------------------------- grievances ------------------------------ */

export interface GrievanceSummary {
  opened: number;
  resolved: number;
  medianResolutionHours: number | null;
  /** Resolved cases that had a statutory date, and how many met it. */
  statutoryEligible: number;
  withinStatutory: number;
  withinStatutoryRate: number | null;
  slaBreached: number;
  appeals: number;
  appealsDecided: number;
  appealsDecidedWithin30Days: number;
  byCategory: { category: string; opened: number; resolved: number }[];
}

export async function grievanceSummary(institutionId: string, range: Range): Promise<GrievanceSummary> {
  const [g] = (
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE created_at >= ${range.from} AND created_at < ${range.to})::int AS opened,
        count(*) FILTER (WHERE resolved_at >= ${range.from} AND resolved_at < ${range.to})::int AS resolved,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM resolved_at - created_at) / 3600)
          FILTER (WHERE resolved_at >= ${range.from} AND resolved_at < ${range.to}) AS median_hours,
        count(*) FILTER (WHERE resolved_at >= ${range.from} AND resolved_at < ${range.to} AND statutory_due_at IS NOT NULL)::int AS statutory_eligible,
        count(*) FILTER (WHERE resolved_at >= ${range.from} AND resolved_at < ${range.to} AND statutory_due_at IS NOT NULL
                          AND coalesce(appealed_at, resolved_at) <= statutory_due_at)::int AS within_statutory,
        count(*) FILTER (WHERE created_at >= ${range.from} AND created_at < ${range.to} AND is_sla_breached)::int AS breached,
        count(*) FILTER (WHERE appealed_at >= ${range.from} AND appealed_at < ${range.to})::int AS appeals,
        count(*) FILTER (WHERE appealed_at >= ${range.from} AND appealed_at < ${range.to} AND status IN ('RESOLVED', 'CLOSED'))::int AS appeals_decided,
        count(*) FILTER (WHERE appealed_at >= ${range.from} AND appealed_at < ${range.to} AND status IN ('RESOLVED', 'CLOSED')
                          AND updated_at <= ombudsperson_due_at)::int AS appeals_on_time
      FROM grievances WHERE institution_id = ${institutionId}`)
  ).rows as Record<string, unknown>[];

  const byCategory = (
    await db.execute(sql`
      SELECT c.name AS category,
        count(*) FILTER (WHERE g.created_at >= ${range.from} AND g.created_at < ${range.to})::int AS opened,
        count(*) FILTER (WHERE g.resolved_at >= ${range.from} AND g.resolved_at < ${range.to})::int AS resolved
      FROM grievances g JOIN grievance_categories c ON c.id = g.category_id
      WHERE g.institution_id = ${institutionId}
      GROUP BY c.name
      HAVING count(*) FILTER (WHERE g.created_at >= ${range.from} AND g.created_at < ${range.to}) > 0
          OR count(*) FILTER (WHERE g.resolved_at >= ${range.from} AND g.resolved_at < ${range.to}) > 0
      ORDER BY c.name`)
  ).rows as { category: string; opened: number; resolved: number }[];

  const n = (k: string) => Number(g?.[k] ?? 0);
  const median = g?.median_hours;
  return {
    opened: n('opened'),
    resolved: n('resolved'),
    medianResolutionHours: median === null || median === undefined ? null : Math.round(Number(median) * 10) / 10,
    statutoryEligible: n('statutory_eligible'),
    withinStatutory: n('within_statutory'),
    withinStatutoryRate: pct(n('within_statutory'), n('statutory_eligible')),
    slaBreached: n('breached'),
    appeals: n('appeals'),
    appealsDecided: n('appeals_decided'),
    appealsDecidedWithin30Days: n('appeals_on_time'),
    byCategory: byCategory.map((r) => ({ category: r.category, opened: Number(r.opened), resolved: Number(r.resolved) })),
  };
}

/* ------------------------------- attendance ------------------------------- */

export interface AttendanceRow {
  program: string;
  section: string | null;
  students: number;
  subjectRecords: number;
  averagePct: number | null;
  studentsBelowMinimum: number;
}

/** Programme/section summary from the current attendance summaries (a snapshot "as of" the export). */
export async function attendanceByProgramme(institutionId: string): Promise<AttendanceRow[]> {
  const rows = (
    await db.execute(sql`
      SELECT p.name AS program, s.code AS section,
        count(DISTINCT a.student_id)::int AS students,
        count(*)::int AS subject_records,
        round(avg(a.percentage_bp) / 100.0, 1) AS average_pct,
        count(DISTINCT a.student_id) FILTER (WHERE a.is_below_threshold)::int AS below
      FROM attendance_summaries a
      JOIN course_offerings o ON o.id = a.offering_id
      LEFT JOIN sections s ON s.id = o.section_id
      LEFT JOIN programs p ON p.id = s.program_id
      WHERE a.institution_id = ${institutionId} AND a.held_sessions > 0
      GROUP BY p.name, s.code
      ORDER BY p.name NULLS LAST, s.code NULLS LAST`)
  ).rows as { program: string | null; section: string | null; students: number; subject_records: number; average_pct: string | null; below: number }[];
  return rows.map((r) => ({
    program: r.program ?? 'Unassigned',
    section: r.section,
    students: Number(r.students),
    subjectRecords: Number(r.subject_records),
    averagePct: r.average_pct === null ? null : Number(r.average_pct),
    studentsBelowMinimum: Number(r.below),
  }));
}

/* ----------------------------- events & growth ---------------------------- */

export interface ParticipationSummary {
  eventsHeld: number;
  registrations: number;
  attended: number;
  uniqueAttendees: number;
  opportunitiesPublished: number;
  studentsTrackingOpportunities: number;
  studentsWithCareerGoal: number;
}

export async function participationSummary(institutionId: string, range: Range): Promise<ParticipationSummary> {
  const [r] = (
    await db.execute(sql`
      SELECT
        (SELECT count(*)::int FROM events e WHERE e.institution_id = ${institutionId} AND e.status IN ('SCHEDULED', 'COMPLETED') AND e.starts_at >= ${range.from} AND e.starts_at < ${range.to}) AS events_held,
        (SELECT count(*)::int FROM event_registrations er JOIN events e ON e.id = er.event_id WHERE e.institution_id = ${institutionId} AND e.starts_at >= ${range.from} AND e.starts_at < ${range.to} AND er.cancelled_at IS NULL) AS registrations,
        (SELECT count(*)::int FROM event_registrations er JOIN events e ON e.id = er.event_id WHERE e.institution_id = ${institutionId} AND e.starts_at >= ${range.from} AND e.starts_at < ${range.to} AND er.attended_at IS NOT NULL) AS attended,
        (SELECT count(DISTINCT er.user_id)::int FROM event_registrations er JOIN events e ON e.id = er.event_id WHERE e.institution_id = ${institutionId} AND e.starts_at >= ${range.from} AND e.starts_at < ${range.to} AND er.attended_at IS NOT NULL) AS unique_attendees,
        (SELECT count(*)::int FROM opportunities o WHERE o.institution_id = ${institutionId} AND o.status = 'PUBLISHED' AND o.created_at >= ${range.from} AND o.created_at < ${range.to}) AS opps,
        (SELECT count(DISTINCT ot.user_id)::int FROM opportunity_tracking ot WHERE ot.institution_id = ${institutionId} AND ot.created_at >= ${range.from} AND ot.created_at < ${range.to}) AS tracking,
        (SELECT count(DISTINCT cg.student_id)::int FROM career_goals cg WHERE cg.institution_id = ${institutionId} AND cg.is_primary) AS career_goal`)
  ).rows as Record<string, unknown>[];
  const n = (k: string) => Number(r?.[k] ?? 0);
  return {
    eventsHeld: n('events_held'),
    registrations: n('registrations'),
    attended: n('attended'),
    uniqueAttendees: n('unique_attendees'),
    opportunitiesPublished: n('opps'),
    studentsTrackingOpportunities: n('tracking'),
    studentsWithCareerGoal: n('career_goal'),
  };
}

/* ------------------------------ the pack ---------------------------------- */

export interface EvidencePack {
  institution: string;
  range: Range;
  generatedAt: Date;
  communication: CommunicationSummary;
  grievances: GrievanceSummary;
  attendance: AttendanceRow[];
  participation: ParticipationSummary;
  committee: { checks: { label: string; done: boolean }[]; attestedAt: string | null };
}

export function assertEvidenceAccess(ctx: AuthContext, individual: boolean) {
  if (!ctx.permissions.has('report:generate')) throw new ForbiddenError('Evidence packs need report access.');
  if (individual && !ctx.permissions.has('data:export')) throw new ForbiddenError('Individual-level exports need data export permission.');
}

export function parseRange(from?: string | null, to?: string | null): Range {
  const now = new Date();
  const toDate = to ? new Date(`${to}T23:59:59.999+05:30`) : now;
  const fromDate = from ? new Date(`${from}T00:00:00+05:30`) : new Date(toDate.getTime() - 180 * 86_400_000);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate >= toDate) {
    throw new AppError('Choose a valid date range.', 422, 'BAD_RANGE');
  }
  if (toDate.getTime() - fromDate.getTime() > 400 * 86_400_000) throw new AppError('Choose a range of at most about a year.', 422, 'BAD_RANGE');
  return { from: fromDate, to: toDate };
}

export async function buildEvidencePack(ctx: AuthContext, range: Range): Promise<EvidencePack> {
  assertEvidenceAccess(ctx, false);
  const [communication, grievances, attendance, participation] = await Promise.all([
    communicationSummary(ctx.institutionId, range),
    grievanceSummary(ctx.institutionId, range),
    attendanceByProgramme(ctx.institutionId),
    participationSummary(ctx.institutionId, range),
  ]);
  const committee = ctx.permissions.has('grievance:configure') || ctx.permissions.has('grievance:view_all')
    ? await committeeStatus(ctx)
    : { checks: [], attestedAt: null };
  return {
    institution: ctx.institutionName,
    range,
    generatedAt: new Date(),
    communication,
    grievances,
    attendance,
    participation,
    committee: { checks: committee.checks.map((c) => ({ label: c.label, done: c.done })), attestedAt: committee.attestedAt },
  };
}

/* --------------------------------- files ---------------------------------- */

function cell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const s = value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s; // no spreadsheet formulas
  return `"${safe.replace(/"/g, '""')}"`;
}
export function toCsv(headers: string[], rows: unknown[][]): string {
  return `${[headers.map(cell).join(','), ...rows.map((r) => r.map(cell).join(','))].join('\r\n')}\r\n`;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (v: number | null, suffix = '') => (v === null ? '—' : `${v}${suffix}`);
const day = (d: Date) => d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });

/** A printable summary (open in a browser → Print → Save as PDF). */
export function summaryHtml(p: EvidencePack): string {
  const c = p.communication;
  const g = p.grievances;
  const e = p.participation;
  const rows = (pairs: [string, string][]) => pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Evidence pack · ${esc(p.institution)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;color:#111;max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:22px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:4px}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}th{width:55%;font-weight:600}.note{color:#555;font-size:12.5px}</style></head><body>
<h1>Evidence pack — ${esc(p.institution)}</h1>
<p class="note">${esc(day(p.range.from))} to ${esc(day(p.range.to))} · generated ${esc(p.generatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }))} from CampusOS records. Each figure is counted from individual records; the CSV files in this pack contain the underlying rows. Mapping to accreditation criteria is for your IQAC to decide.</p>
<h2>Communication</h2><table>${rows([
    ['Notices published', String(c.published)],
    ['Notices that asked for acknowledgement', String(c.requiringAck)],
    ['Acknowledgement rate (acknowledged ÷ recipients)', `${fmt(c.ackRate, '%')} (${c.acknowledged} of ${c.ackRecipients})`],
    ['Opened (all notices)', `${fmt(c.readRate, '%')} (${c.read} of ${c.recipients})`],
  ])}</table>
<h2>Student grievances</h2><table>${rows([
    ['Grievances received', String(g.opened)],
    ['Grievances resolved', String(g.resolved)],
    ['Median time to resolve', g.medianResolutionHours === null ? '—' : `${g.medianResolutionHours} hours`],
    ['Resolved within the committee’s 15 working days', `${fmt(g.withinStatutoryRate, '%')} (${g.withinStatutory} of ${g.statutoryEligible})`],
    ['Missed the internal resolution deadline', String(g.slaBreached)],
    ['Appeals to the Ombudsperson', String(g.appeals)],
    ['Appeals decided within 30 days', `${g.appealsDecidedWithin30Days} of ${g.appealsDecided} decided`],
  ])}</table>
${p.committee.checks.length ? `<h2>Grievance committee</h2><table>${rows(p.committee.checks.map((x) => [x.label, x.done ? 'In place' : 'Not recorded'] as [string, string]))}</table>` : ''}
<h2>Attendance (as of this export)</h2><table><tr><th>Programme · section</th><td><b>Students · average · below minimum</b></td></tr>${p.attendance
    .map((a) => `<tr><th>${esc(a.program)}${a.section ? ` · ${esc(a.section)}` : ''}</th><td>${a.students} · ${fmt(a.averagePct, '%')} · ${a.studentsBelowMinimum}</td></tr>`)
    .join('') || '<tr><td colspan="2">No attendance recorded.</td></tr>'}</table>
<h2>Participation and growth</h2><table>${rows([
    ['Events held', String(e.eventsHeld)],
    ['Event registrations · attended', `${e.registrations} · ${e.attended}`],
    ['Students who attended at least one event', String(e.uniqueAttendees)],
    ['Opportunities published', String(e.opportunitiesPublished)],
    ['Students tracking opportunities', String(e.studentsTrackingOpportunities)],
    ['Students with a career goal', String(e.studentsWithCareerGoal)],
  ])}</table>
</body></html>`;
}

/** The ZIP: summary.html plus one CSV per section. Individual rows only when asked and allowed. */
export async function exportEvidencePack(
  ctx: AuthContext,
  input: { range: Range; individual?: boolean },
  meta: { ipAddress: string | null; userAgent: string | null },
): Promise<{ filename: string; bytes: Uint8Array }> {
  const individual = !!input.individual;
  assertEvidenceAccess(ctx, individual);
  const p = await buildEvidencePack(ctx, input.range);
  const files: Record<string, Uint8Array> = {
    'summary.html': strToU8(summaryHtml(p)),
    'communication-notices.csv': strToU8(
      toCsv(['Reference', 'Title', 'Published', 'Needs acknowledgement', 'Deadline', 'Recipients', 'Opened', 'Acknowledged'],
        p.communication.notices.map((n) => [n.reference, n.title, n.publishedAt, n.requiresAck ? 'YES' : 'NO', n.deadline, n.recipients, n.read, n.requiresAck ? n.acknowledged : ''])),
    ),
    'grievances-by-category.csv': strToU8(toCsv(['Category', 'Received', 'Resolved'], p.grievances.byCategory.map((r) => [r.category, r.opened, r.resolved]))),
    'attendance-by-programme.csv': strToU8(
      toCsv(['Programme', 'Section', 'Students', 'Subject records', 'Average %', 'Students below minimum'], p.attendance.map((a) => [a.program, a.section, a.students, a.subjectRecords, a.averagePct, a.studentsBelowMinimum])),
    ),
    'participation.csv': strToU8(toCsv(['Measure', 'Value'], Object.entries(p.participation).map(([k, v]) => [k, v]))),
  };
  if (individual) {
    const rows = await db
      .select({
        roll: t.studentProfiles.rollNumber,
        first: t.users.firstName,
        last: t.users.lastName,
        section: t.sections.code,
        subject: t.subjects.code,
        held: t.attendanceSummaries.heldSessions,
        attended: t.attendanceSummaries.attendedSessions,
        bp: t.attendanceSummaries.percentageBp,
        below: t.attendanceSummaries.isBelowThreshold,
      })
      .from(t.attendanceSummaries)
      .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.attendanceSummaries.studentId))
      .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
      .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.attendanceSummaries.offeringId))
      .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
      .leftJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
      .where(eq(t.attendanceSummaries.institutionId, ctx.institutionId));
    files['individual/attendance-by-student.csv'] = strToU8(
      toCsv(['Roll number', 'Name', 'Section', 'Subject', 'Held', 'Attended', 'Percentage', 'Below minimum'], rows.map((r) => [r.roll, `${r.first} ${r.last}`, r.section, r.subject, r.held, r.attended, (r.bp / 100).toFixed(2), r.below ? 'YES' : 'NO'])),
    );
  }
  const bytes = zipSync(files, { level: 6 });
  await recordAudit(ctx, {
    action: 'EVIDENCE_PACK_EXPORTED',
    entityType: 'institution',
    entityId: ctx.institutionId,
    after: { from: input.range.from.toISOString(), to: input.range.to.toISOString(), individual, files: Object.keys(files).length },
    ...meta,
  });
  await track(ctx, 'evidence_pack_generated', { individual });
  const stamp = input.range.to.toISOString().slice(0, 10);
  return { filename: `campusos-evidence-${stamp}${individual ? '-with-individual-rows' : ''}.zip`, bytes };
}
