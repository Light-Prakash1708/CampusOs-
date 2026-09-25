import Link from 'next/link';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { AlertTriangle, CalendarClock, CheckCircle2, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, PageHeader, Section,
} from '@/components/ui';
import { formatDateTime, humanize, pluralize, relativeTime } from '@/lib/utils';
import { scanVersionConflicts } from '@/services/timetable/conflicts';
import { getCurrentTerm, getPublishedVersion, getSections } from '../_lib/admin';
import { TimetableWorkbench } from './TimetableWorkbench';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Timetable · CampusOS' };

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string; version?: string }>;
}) {
  const user = await requirePermission('timetable:view_all');
  const params = await searchParams;

  const term = await getCurrentTerm(user.institutionId);
  if (!term) {
    return (
      <div>
        <PageHeader title="Timetable" />
        <Alert tone="warning" icon={AlertTriangle} title="No current academic term">
          A timetable belongs to a term. Configure the current term in Settings before building one.
        </Alert>
      </div>
    );
  }

  const versions = await db
    .select()
    .from(t.timetableVersions)
    .where(
      and(
        eq(t.timetableVersions.institutionId, user.institutionId),
        eq(t.timetableVersions.termId, term.id),
      ),
    )
    .orderBy(desc(t.timetableVersions.versionNumber));

  const published = versions.find((v) => v.status === 'PUBLISHED') ?? null;
  const selected =
    versions.find((v) => v.id === params.version) ?? published ?? versions[0] ?? null;

  const sections = await getSections(user.institutionId);
  const activeSectionId = params.section ?? sections[0]?.id ?? null;

  const [slots, entries, rooms, faculty] = await Promise.all([
    db
      .select()
      .from(t.timeSlots)
      .where(eq(t.timeSlots.institutionId, user.institutionId))
      .orderBy(asc(t.timeSlots.position)),
    selected
      ? db
          .select({
            id: t.timetableEntries.id,
            timeSlotId: t.timetableEntries.timeSlotId,
            dayOfWeek: t.timetableEntries.dayOfWeek,
            sectionId: t.timetableEntries.sectionId,
            roomId: t.timetableEntries.roomId,
            facultyId: t.timetableEntries.facultyId,
            version: t.timetableEntries.version,
            subjectCode: t.subjects.code,
            subjectName: t.subjects.name,
            requiredRoomType: t.subjects.requiredRoomType,
            sectionCode: t.sections.code,
            roomCode: t.rooms.code,
            facultyFirst: t.users.firstName,
            facultyLast: t.users.lastName,
          })
          .from(t.timetableEntries)
          .innerJoin(t.courseOfferings, eq(t.courseOfferings.id, t.timetableEntries.offeringId))
          .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
          .innerJoin(t.sections, eq(t.sections.id, t.timetableEntries.sectionId))
          .leftJoin(t.rooms, eq(t.rooms.id, t.timetableEntries.roomId))
          .leftJoin(t.facultyProfiles, eq(t.facultyProfiles.id, t.timetableEntries.facultyId))
          .leftJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
          .where(eq(t.timetableEntries.versionId, selected.id))
      : Promise.resolve([]),
    db
      .select({ id: t.rooms.id, code: t.rooms.code, type: t.rooms.type, capacity: t.rooms.capacity })
      .from(t.rooms)
      .where(
        and(
          eq(t.rooms.institutionId, user.institutionId),
          eq(t.rooms.isBookable, true),
          isNull(t.rooms.deletedAt),
        ),
      )
      .orderBy(asc(t.rooms.code)),
    db
      .select({
        id: t.facultyProfiles.id,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
      })
      .from(t.facultyProfiles)
      .innerJoin(t.users, eq(t.users.id, t.facultyProfiles.userId))
      .where(eq(t.facultyProfiles.institutionId, user.institutionId))
      .orderBy(asc(t.users.firstName)),
  ]);

  const conflicts = selected
    ? await scanVersionConflicts(user.institutionId, selected.id)
    : { total: 0, items: [] };

  const report = (selected?.solverReport ?? null) as
    | { placedCount?: number; unplacedCount?: number; qualityScore?: number; durationMs?: number }
    | null;

  return (
    <div>
      <PageHeader
        title="Timetable"
        description={`${term.name} · ${versions.length} version${versions.length === 1 ? '' : 's'}`}
        action={
          conflicts.total > 0 ? (
            <Button asChild variant="secondary" icon={AlertTriangle}>
              <Link href="/admin/timetable/conflicts">
                {pluralize(conflicts.total, 'conflict')}
              </Link>
            </Button>
          ) : null
        }
      />

      {selected && selected.status !== 'PUBLISHED' ? (
        <Alert
          tone="info"
          className="mb-4"
          title={`You are viewing a ${selected.status.toLowerCase()} version`}
        >
          Students and faculty still see{' '}
          {published ? `“${published.name}”` : 'no timetable'}. Publishing is a separate,
          audited step.
        </Alert>
      ) : null}

      {conflicts.total > 0 ? (
        <Alert
          tone="danger"
          className="mb-4"
          icon={AlertTriangle}
          title={`${pluralize(conflicts.total, 'conflict')} in this version`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/timetable/conflicts">Resolve</Link>
            </Button>
          }
        >
          {conflicts.items[0]?.message}
        </Alert>
      ) : selected ? (
        <Alert tone="success" className="mb-4" icon={CheckCircle2} title="No conflicts">
          Every room, faculty member and section is clash-free in this version.
        </Alert>
      ) : null}

      <TimetableWorkbench
        termId={term.id}
        versions={versions.map((v) => ({
          id: v.id,
          name: v.name,
          status: v.status,
          versionNumber: v.versionNumber,
          generatedBy: v.generatedBy,
          createdAt: v.createdAt.toISOString(),
          publishedAt: v.publishedAt?.toISOString() ?? null,
        }))}
        selectedVersionId={selected?.id ?? null}
        canGenerate={user.permissions.has('timetable:generate')}
        canEdit={user.permissions.has('timetable:edit')}
        canPublish={user.permissions.has('timetable:publish')}
        sections={sections.map((s) => ({ id: s.id, code: s.code, programCode: s.programCode }))}
        activeSectionId={activeSectionId}
        slots={slots.map((s) => ({
          id: s.id,
          day: s.dayOfWeek,
          position: s.position,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          kind: s.kind,
        }))}
        entries={entries.map((e) => ({
          id: e.id,
          timeSlotId: e.timeSlotId,
          day: e.dayOfWeek,
          sectionId: e.sectionId,
          sectionCode: e.sectionCode,
          roomId: e.roomId,
          roomCode: e.roomCode,
          facultyId: e.facultyId,
          facultyName: e.facultyFirst ? `${e.facultyFirst} ${e.facultyLast ?? ''}`.trim() : null,
          subjectCode: e.subjectCode,
          subjectName: e.subjectName,
          requiredRoomType: e.requiredRoomType,
          version: e.version,
        }))}
        rooms={rooms}
        faculty={faculty.map((f) => ({
          id: f.id,
          name: `${f.firstName} ${f.lastName}`,
        }))}
      />

      {report ? (
        <Section title="Solver report" className="mt-6">
          <Card>
            <CardBody className="grid gap-4 sm:grid-cols-4">
              <ReportStat label="Sessions placed" value={report.placedCount ?? 0} />
              <ReportStat
                label="Unplaced"
                value={report.unplacedCount ?? 0}
                tone={(report.unplacedCount ?? 0) > 0 ? 'danger' : 'success'}
              />
              <ReportStat label="Quality score" value={`${report.qualityScore ?? 0}/100`} />
              <ReportStat
                label="Solve time"
                value={`${((report.durationMs ?? 0) / 1000).toFixed(1)}s`}
              />
            </CardBody>
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-default';
  return (
    <div>
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular ${color}`}>{value}</p>
    </div>
  );
}
