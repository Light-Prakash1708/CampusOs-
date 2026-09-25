'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Loader2, Send, Sparkles, X,
} from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input,
  Select, Textarea,
} from '@/components/ui';
import { cn, formatTime, humanize, pluralize } from '@/lib/utils';

/* ------------------------------- types ---------------------------------- */

interface Slot {
  id: string; day: string; position: number; label: string;
  startTime: string; endTime: string; kind: string;
}
interface Entry {
  id: string; timeSlotId: string; day: string; sectionId: string; sectionCode: string;
  roomId: string | null; roomCode: string | null; facultyId: string | null;
  facultyName: string | null; subjectCode: string; subjectName: string;
  requiredRoomType: string | null; version: number;
}
interface Version {
  id: string; name: string; status: string; versionNumber: number;
  generatedBy: string; createdAt: string; publishedAt: string | null;
}
interface Conflict { severity: string; kind: string; message: string; affected: { students: number } }
interface Alternative {
  kind: string; roomId?: string; roomLabel?: string;
  timeSlotId?: string; timeLabel?: string; note: string; score: number;
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

/**
 * The admin timetable workbench.
 *
 * Editing is deliberately a two-step flow: choose a change, see the conflict
 * check and its human impact, then confirm with a reason. Nothing is written
 * until the reason exists, because the reason is what every affected student
 * will be shown.
 */
export function TimetableWorkbench({
  termId, versions, selectedVersionId, canGenerate, canEdit, canPublish,
  sections, activeSectionId, slots, entries, rooms, faculty,
}: {
  termId: string;
  versions: Version[];
  selectedVersionId: string | null;
  canGenerate: boolean;
  canEdit: boolean;
  canPublish: boolean;
  sections: { id: string; code: string; programCode: string }[];
  activeSectionId: string | null;
  slots: Slot[];
  entries: Entry[];
  rooms: { id: string; code: string; type: string; capacity: number }[];
  faculty: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [sectionId, setSectionId] = React.useState(activeSectionId ?? '');
  const [editing, setEditing] = React.useState<Entry | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [genResult, setGenResult] = React.useState<null | {
    versionId: string;
    report: { placedCount: number; unplacedCount: number; qualityScore: number; durationMs: number };
    unplaced: { subjectCode: string; subjectName: string; reason: string; suggestions: string[] }[];
    interpretedConstraints: string[];
    unrecognisedRequirements: string[];
  }>(null);
  const [genError, setGenError] = React.useState<string | null>(null);
  const [requirements, setRequirements] = React.useState('');
  const [showGenerator, setShowGenerator] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [publishReason, setPublishReason] = React.useState('');
  const [showPublish, setShowPublish] = React.useState(false);
  const [publishResult, setPublishResult] = React.useState<string | null>(null);
  const [publishError, setPublishError] = React.useState<string | null>(null);

  const teachingSlots = slots.filter((s) => s.kind === 'TEACHING');
  const positions = [...new Set(slots.map((s) => s.position))].sort((a, b) => a - b);
  const sectionEntries = entries.filter((e) => e.sectionId === sectionId);

  function cellEntry(day: string, position: number): Entry | undefined {
    const slot = slots.find((s) => s.day === day && s.position === position);
    if (!slot) return undefined;
    return sectionEntries.find((e) => e.timeSlotId === slot.id);
  }

  function slotFor(day: string, position: number): Slot | undefined {
    return slots.find((s) => s.day === day && s.position === position);
  }

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setGenResult(null);
    try {
      const res = await fetch('/api/timetable/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termId, requirements: requirements.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.ok) {
        setGenError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setGenResult(json.data);
      router.refresh();
    } catch {
      setGenError('Could not reach the server. Check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (!selectedVersionId) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch('/api/timetable/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId: selectedVersionId, reason: publishReason }),
      });
      const json = await res.json();
      if (!json.ok) {
        setPublishError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setPublishResult(
        `Published. ${json.data.moved.length} class${json.data.moved.length === 1 ? '' : 'es'} moved, ${json.data.added} added, ${json.data.removed} removed. Affected students and faculty have been notified.`,
      );
      setShowPublish(false);
      setPublishReason('');
      router.refresh();
    } catch {
      setPublishError('Could not reach the server.');
    } finally {
      setPublishing(false);
    }
  }

  const selectedVersion = versions.find((v) => v.id === selectedVersionId);

  return (
    <div className="space-y-5">
      {/* ------------------------- controls ------------------------- */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Version" className="min-w-[220px] flex-1">
            <Select
              value={selectedVersionId ?? ''}
              onChange={(e) => router.push(`/admin/timetable?version=${e.target.value}&section=${sectionId}`)}
            >
              {versions.length === 0 ? <option value="">No versions yet</option> : null}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} · {v.name} ({v.status.toLowerCase()})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Section" className="min-w-[180px] flex-1">
            <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.programCode}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex gap-2">
            {canGenerate ? (
              <Button
                variant="secondary"
                icon={Sparkles}
                onClick={() => setShowGenerator((v) => !v)}
              >
                Optimise
              </Button>
            ) : null}
            {canPublish && selectedVersion && selectedVersion.status !== 'PUBLISHED' ? (
              <Button variant="primary" icon={Send} onClick={() => setShowPublish(true)}>
                Publish
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      {publishResult ? (
        <Alert tone="success" icon={CheckCircle2} title="Timetable published">
          {publishResult}
        </Alert>
      ) : null}

      {/* ------------------------- generator ------------------------- */}
      {showGenerator ? (
        <Card>
          <CardHeader
            title="Generate a conflict-free timetable"
            icon={Sparkles}
            description="A constraint solver places every class. Requirements below are parsed into hard and soft constraints, and you will see exactly what was understood."
            action={
              <Button variant="ghost" size="icon" onClick={() => setShowGenerator(false)} aria-label="Close">
                <X size={16} />
              </Button>
            }
          />
          <CardBody className="space-y-3">
            <Field
              label="Scheduling requirements"
              hint="Plain English, one per line. For example: “Dr. Sharma cannot teach before 10 AM on Monday” or “BCA-3A at most 5 classes a day”."
            >
              <Textarea
                rows={4}
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="Dr. Sharma is unavailable on Wednesday.&#10;No classes for BCOM-3A after 3 PM on Friday."
              />
            </Field>

            <div className="flex items-center gap-2">
              <Button variant="primary" loading={generating} onClick={generate} icon={Sparkles}>
                {generating ? 'Solving…' : 'Generate proposal'}
              </Button>
              <p className="text-[12.5px] text-subtle">
                Creates a new proposed version. Your published timetable is untouched.
              </p>
            </div>

            {genError ? (
              <Alert tone="danger" icon={AlertTriangle} title="Generation failed">
                {genError}
              </Alert>
            ) : null}

            {genResult ? (
              <div className="space-y-3 rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <Badge tone={genResult.report.unplacedCount === 0 ? 'success' : 'warning'}>
                    {genResult.report.placedCount} placed
                  </Badge>
                  {genResult.report.unplacedCount > 0 ? (
                    <Badge tone="danger">{genResult.report.unplacedCount} unplaced</Badge>
                  ) : null}
                  <span className="text-[13px] text-muted">
                    Quality {genResult.report.qualityScore}/100 ·{' '}
                    {(genResult.report.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>

                {genResult.interpretedConstraints.length > 0 ? (
                  <div>
                    <p className="text-[12.5px] font-semibold text-default">
                      Requirements applied
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {genResult.interpretedConstraints.map((c, i) => (
                        <li key={i} className="text-[12.5px] text-muted">• {c}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {genResult.unrecognisedRequirements.length > 0 ? (
                  <Alert tone="warning" title="Not understood — these were NOT applied">
                    <ul className="mt-1 space-y-0.5">
                      {genResult.unrecognisedRequirements.map((c, i) => (
                        <li key={i} className="text-[12.5px]">• “{c}”</li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                {genResult.unplaced.length > 0 ? (
                  <div>
                    <p className="text-[12.5px] font-semibold text-danger">
                      Could not be placed
                    </p>
                    {genResult.unplaced.map((u, i) => (
                      <div key={i} className="mt-1.5 rounded-md bg-surface p-2.5">
                        <p className="text-[13px] font-medium text-default">
                          {u.subjectCode} {u.subjectName}
                        </p>
                        <p className="text-[12.5px] text-muted">{u.reason}</p>
                        {u.suggestions.length > 0 ? (
                          <ul className="mt-1 space-y-0.5">
                            {u.suggestions.map((s, j) => (
                              <li key={j} className="text-[12px] text-subtle">→ {s}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------- publish dialog ------------------------- */}
      {showPublish ? (
        <Card>
          <CardHeader
            title="Publish this timetable"
            description="Everyone affected will be notified, and the reason you give is what they will see."
            action={
              <Button variant="ghost" size="icon" onClick={() => setShowPublish(false)} aria-label="Close">
                <X size={16} />
              </Button>
            }
          />
          <CardBody className="space-y-3">
            <Field label="Reason for this change" required>
              <Input
                value={publishReason}
                onChange={(e) => setPublishReason(e.target.value)}
                placeholder="Revised to accommodate laboratory availability"
              />
            </Field>
            {publishError ? (
              <Alert tone="danger" icon={AlertTriangle}>{publishError}</Alert>
            ) : null}
            <Button
              variant="primary"
              loading={publishing}
              disabled={publishReason.trim().length < 5}
              onClick={publish}
            >
              Publish and notify
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {/* ------------------------- grid ------------------------- */}
      {!selectedVersionId ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No timetable version yet"
            description="Run the optimiser to generate a conflict-free proposal from your subjects, sections, rooms and faculty."
            action={
              canGenerate ? (
                <Button variant="primary" icon={Sparkles} onClick={() => setShowGenerator(true)}>
                  Generate one
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={sections.find((s) => s.id === sectionId)?.code ?? 'Timetable'}
            description={canEdit ? 'Select a class to move it. Conflicts are checked before anything is saved.' : undefined}
          />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-[hsl(var(--border))] bg-surface-raised px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
                    Period
                  </th>
                  {DAYS.map((day) => (
                    <th
                      key={day}
                      className="min-w-[150px] border-b border-[hsl(var(--border))] px-3 py-2 text-left text-[11.5px] font-semibold uppercase tracking-wide text-subtle"
                    >
                      {day.charAt(0) + day.slice(1, 3).toLowerCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((position) => {
                  const sample = slots.find((s) => s.position === position);
                  const isBreak = sample?.kind !== 'TEACHING';
                  return (
                    <tr key={position} className={isBreak ? 'bg-surface-sunken' : undefined}>
                      <td className="sticky left-0 z-10 border-b border-[hsl(var(--border))] bg-inherit px-3 py-2 align-top">
                        <p className="text-[12.5px] font-medium text-default">
                          {sample?.label.replace(/^\w+ /, '') ?? `P${position}`}
                        </p>
                        <p className="tabular text-[11px] text-subtle">
                          {sample ? `${formatTime(sample.startTime)}` : ''}
                        </p>
                      </td>
                      {DAYS.map((day) => {
                        const slot = slotFor(day, position);
                        const entry = cellEntry(day, position);

                        if (!slot) {
                          return (
                            <td key={day} className="border-b border-[hsl(var(--border))] px-3 py-2">
                              <span className="text-[11.5px] text-subtle">—</span>
                            </td>
                          );
                        }
                        if (slot.kind !== 'TEACHING') {
                          return (
                            <td key={day} className="border-b border-[hsl(var(--border))] px-3 py-2">
                              <span className="text-[11.5px] uppercase tracking-wide text-subtle">
                                {slot.kind.toLowerCase()}
                              </span>
                            </td>
                          );
                        }
                        if (!entry) {
                          return (
                            <td key={day} className="border-b border-[hsl(var(--border))] px-2 py-1.5 align-top">
                              <div className="h-full min-h-[52px] rounded-md border border-dashed border-[hsl(var(--border))] px-2 py-1.5 text-[11.5px] text-subtle">
                                Free
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={day} className="border-b border-[hsl(var(--border))] px-2 py-1.5 align-top">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setEditing(entry)}
                              className={cn(
                                'w-full rounded-md border border-[hsl(var(--brand-border))] bg-brand-subtle px-2 py-1.5 text-left transition-colors',
                                canEdit ? 'hover:brightness-95' : 'cursor-default',
                              )}
                            >
                              <p className="text-[12.5px] font-semibold text-brand">
                                {entry.subjectCode}
                              </p>
                              <p className="truncate text-[11.5px] text-default">
                                {entry.subjectName}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-muted">
                                {entry.roomCode ? `Room ${entry.roomCode}` : 'Room TBD'}
                                {entry.facultyName ? ` · ${entry.facultyName}` : ''}
                              </p>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && selectedVersionId ? (
        <MoveDialog
          entry={editing}
          versionId={selectedVersionId}
          slots={teachingSlots}
          rooms={rooms}
          faculty={faculty}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* --------------------------- move dialog --------------------------------- */

function MoveDialog({
  entry, versionId, slots, rooms, faculty, onClose, onDone,
}: {
  entry: Entry;
  versionId: string;
  slots: Slot[];
  rooms: { id: string; code: string; type: string; capacity: number }[];
  faculty: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [timeSlotId, setTimeSlotId] = React.useState(entry.timeSlotId);
  const [roomId, setRoomId] = React.useState(entry.roomId ?? '');
  const [facultyId, setFacultyId] = React.useState(entry.facultyId ?? '');
  const [reason, setReason] = React.useState('');
  const [checking, setChecking] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [check, setCheck] = React.useState<{
    hasConflict: boolean;
    hasBlockingConflict: boolean;
    conflicts: Conflict[];
    alternatives: Alternative[];
    impact: { students: number; faculty: number; sections: string[] };
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const changed =
    timeSlotId !== entry.timeSlotId ||
    (roomId || null) !== entry.roomId ||
    (facultyId || null) !== entry.facultyId;

  // Re-check whenever the proposed placement changes.
  React.useEffect(() => {
    if (!changed) {
      setCheck(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/timetable/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            versionId,
            timeSlotId,
            sectionId: entry.sectionId,
            roomId: roomId || null,
            facultyId: facultyId || null,
            excludeEntryId: entry.id,
            requiredRoomType: entry.requiredRoomType,
          }),
        });
        const json = await res.json();
        if (!cancelled && json.ok) setCheck(json.data);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [timeSlotId, roomId, facultyId, changed, versionId, entry]);

  async function save(acceptWarnings = false) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/timetable/entry', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryId: entry.id,
          timeSlotId,
          roomId: roomId || null,
          facultyId: facultyId || null,
          reason,
          expectedVersion: entry.version,
          acceptWarnings,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        if (json.error.details?.alternatives) {
          setCheck({
            hasConflict: true,
            hasBlockingConflict: true,
            conflicts: json.error.details.conflicts ?? [],
            alternatives: json.error.details.alternatives ?? [],
            impact: json.error.details.impact ?? { students: 0, faculty: 0, sections: [] },
          });
        }
        return;
      }
      onDone();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const blocking = check?.hasBlockingConflict ?? false;
  const warningOnly = (check?.hasConflict ?? false) && !blocking;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-[hsl(var(--border))] bg-surface shadow-lg sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-default">
              {entry.subjectCode} {entry.subjectName}
            </h2>
            <p className="text-[12.5px] text-muted">{entry.sectionCode}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4 p-5">
          <Field label="Period">
            <Select value={timeSlotId} onChange={(e) => setTimeSlotId(e.target.value)}>
              {slots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.day.charAt(0) + s.day.slice(1, 3).toLowerCase()} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Room"
            hint={entry.requiredRoomType ? `This subject expects a ${entry.requiredRoomType.toLowerCase()}.` : undefined}
          >
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              <option value="">Not assigned</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.type.toLowerCase()} · seats {r.capacity}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Faculty">
            <Select value={facultyId} onChange={(e) => setFacultyId(e.target.value)}>
              <option value="">Unassigned</option>
              {faculty.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>

          {checking ? (
            <p className="flex items-center gap-2 text-[13px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Checking for conflicts…
            </p>
          ) : null}

          {check && changed && !check.hasConflict ? (
            <Alert tone="success" icon={CheckCircle2} title="No conflict">
              The room, faculty member and section are all free in this period.
            </Alert>
          ) : null}

          {check && check.hasConflict ? (
            <Alert
              tone={blocking ? 'danger' : 'warning'}
              icon={AlertTriangle}
              title={blocking ? 'Conflict detected' : 'Warning'}
            >
              <ul className="space-y-1">
                {check.conflicts.map((c, i) => (
                  <li key={i} className="text-[13px]">{c.message}</li>
                ))}
              </ul>
              {check.impact.students > 0 ? (
                <p className="mt-1.5 text-[12.5px]">
                  Affects {pluralize(check.impact.students, 'student')}
                  {check.impact.sections.length ? ` in ${check.impact.sections.join(', ')}` : ''}.
                </p>
              ) : null}
            </Alert>
          ) : null}

          {check && check.alternatives.length > 0 ? (
            <div>
              <p className="mb-1.5 text-[12.5px] font-semibold text-default">
                Suggested alternatives
              </p>
              <div className="space-y-1.5">
                {check.alternatives.map((alt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (alt.timeSlotId) setTimeSlotId(alt.timeSlotId);
                      if (alt.roomId) setRoomId(alt.roomId);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-left hover:bg-surface-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-default">
                        {[alt.timeLabel, alt.roomLabel].filter(Boolean).join(' · ')}
                      </span>
                      <span className="block text-[12px] text-subtle">{alt.note}</span>
                    </span>
                    <ArrowRight size={14} className="shrink-0 text-subtle" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <Field
            label="Reason for this change"
            required
            hint="Shown to every affected student and faculty member, and recorded in the audit log."
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Projector failure in Room 204"
            />
          </Field>

          {error ? <Alert tone="danger" icon={AlertTriangle}>{error}</Alert> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[hsl(var(--border))] bg-surface-muted px-5 py-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant={warningOnly ? 'danger' : 'primary'}
            loading={saving}
            disabled={!changed || blocking || reason.trim().length < 5}
            onClick={() => save(warningOnly)}
          >
            {warningOnly ? 'Apply anyway' : 'Apply and notify'}
          </Button>
        </div>
      </div>
    </div>
  );
}
