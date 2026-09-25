'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Radio, Send, Users } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Textarea,
} from '@/components/ui';
import { pluralize } from '@/lib/utils';

interface Target {
  scope: string;
  departmentId?: string;
  programId?: string;
  sectionId?: string;
  year?: number;
  role?: string;
}

/**
 * Notice composer.
 *
 * The audience preview is a real server-side resolution of the targeting rules,
 * refreshed as the rules change — so the author always knows exactly how many
 * people they are about to interrupt before they send anything.
 */
export function NoticeComposer({
  canPublishOfficial,
  canEmergencyBroadcast,
  departments,
  programs,
  sections,
}: {
  canPublishOfficial: boolean;
  canEmergencyBroadcast: boolean;
  departments: { id: string; code: string; name: string }[];
  programs: { id: string; code: string; name: string }[];
  sections: { id: string; code: string; programCode: string }[];
}) {
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [category, setCategory] = React.useState('ACADEMIC');
  const [priority, setPriority] = React.useState('NORMAL');
  const [kind, setKind] = React.useState(canPublishOfficial ? 'OFFICIAL' : 'INFORMATIONAL');
  const [requiresAck, setRequiresAck] = React.useState(false);
  const [allowComments, setAllowComments] = React.useState(false);
  const [isEmergency, setIsEmergency] = React.useState(false);

  const [audienceMode, setAudienceMode] = React.useState('INSTITUTION');
  const [departmentId, setDepartmentId] = React.useState('');
  const [programId, setProgramId] = React.useState('');
  const [sectionId, setSectionId] = React.useState('');
  const [year, setYear] = React.useState('2');
  const [role, setRole] = React.useState('STUDENT');

  const [preview, setPreview] = React.useState<{
    total: number;
    breakdown: { students: number; faculty: number; staff: number };
    description: string;
  } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<{ reference: string; recipients: number; status: string } | null>(null);

  const targets: Target[] = React.useMemo(() => {
    switch (audienceMode) {
      case 'INSTITUTION': return [{ scope: 'INSTITUTION' }];
      case 'ROLE': return [{ scope: 'ROLE', role }];
      case 'DEPARTMENT': return departmentId ? [{ scope: 'DEPARTMENT', departmentId }] : [];
      case 'PROGRAM': return programId ? [{ scope: 'PROGRAM', programId }] : [];
      case 'SECTION': return sectionId ? [{ scope: 'SECTION', sectionId }] : [];
      case 'YEAR': return [{ scope: 'YEAR', year: Number(year) }];
      default: return [];
    }
  }, [audienceMode, role, departmentId, programId, sectionId, year]);

  // Live audience resolution — never guessed on the client.
  React.useEffect(() => {
    if (targets.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/announcements', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targets }),
        });
        const json = await res.json();
        if (!cancelled && json.ok) setPreview(json.data);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [targets]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, body, category, priority, kind,
          requiresAcknowledgement: requiresAck,
          allowComments,
          isEmergencyBroadcast: isEmergency,
          targets,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(
          `${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}${
            json.error.details?.length
              ? ` (${json.error.details.map((d: { message: string }) => d.message).join(' ')})`
              : ''
          }`,
        );
        return;
      }
      setSuccess(json.data);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSending(false);
    }
  }

  if (success) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <Alert
            tone="success"
            icon={CheckCircle2}
            title={success.status === 'PUBLISHED' ? 'Notice published' : `Notice ${success.status.toLowerCase().replace('_', ' ')}`}
          >
            {success.reference} reached {pluralize(success.recipients, 'person', 'people')}.
            {success.status === 'PENDING_APPROVAL'
              ? ' It is waiting for approval before it goes out.'
              : ' Acknowledgement progress is tracked on the notice page.'}
          </Alert>
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => router.push('/admin/communications')}>
              Back to communications
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSuccess(null);
                setTitle('');
                setBody('');
              }}
            >
              Write another
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const canSend = title.trim().length >= 5 && body.trim().length >= 10 && (preview?.total ?? 0) > 0;

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Notice" />
          <CardBody className="space-y-4">
            <Field label="Title" required>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Classes begin at 11:00 AM tomorrow"
              />
            </Field>
            <Field label="Message" required>
              <Textarea
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Explain what is happening, who it affects, and what people should do."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category">
                <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {['ACADEMIC','EXAMINATION','EVENT','ADMINISTRATIVE','HOLIDAY','EMERGENCY','PLACEMENT','FACILITY','GENERAL'].map((c) => (
                    <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                  <option value="CRITICAL">Critical — immediate</option>
                  <option value="IMPORTANT">Important</option>
                  <option value="NORMAL">Normal</option>
                  <option value="INFORMATIONAL">Informational</option>
                </Select>
              </Field>
              <Field
                label="Type"
                hint={canPublishOfficial ? undefined : 'Official notices need approval from your role.'}
              >
                <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="OFFICIAL">Official</option>
                  <option value="INFORMATIONAL">Informational</option>
                </Select>
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Audience" icon={Users} description="Who should see this notice" />
          <CardBody className="space-y-4">
            <Field label="Send to">
              <Select value={audienceMode} onChange={(e) => setAudienceMode(e.target.value)}>
                <option value="INSTITUTION">Everyone at the institution</option>
                <option value="ROLE">Everyone in a role</option>
                <option value="DEPARTMENT">A department</option>
                <option value="PROGRAM">A programme</option>
                <option value="YEAR">A year of study</option>
                <option value="SECTION">A single section</option>
              </Select>
            </Field>

            {audienceMode === 'ROLE' ? (
              <Field label="Role">
                <Select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="STUDENT">Students</option>
                  <option value="FACULTY">Faculty</option>
                  <option value="ADMIN">Administrators</option>
                </Select>
              </Field>
            ) : null}

            {audienceMode === 'DEPARTMENT' ? (
              <Field label="Department">
                <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                  <option value="">Choose…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {audienceMode === 'PROGRAM' ? (
              <Field label="Programme">
                <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
                  <option value="">Choose…</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {audienceMode === 'SECTION' ? (
              <Field label="Section" hint="Includes the students and the faculty who teach them.">
                <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                  <option value="">Choose…</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} · {s.programCode}</option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {audienceMode === 'YEAR' ? (
              <Field label="Year of study">
                <Select value={year} onChange={(e) => setYear(e.target.value)}>
                  {[1, 2, 3, 4].map((y) => (
                    <option key={y} value={y}>Year {y}</option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </CardBody>
        </Card>
      </div>

      {/* ------------------------ side panel ------------------------ */}
      <div className="space-y-5">
        <Card>
          <CardHeader title="Reach" icon={Users} />
          <CardBody>
            {previewing ? (
              <p className="text-[13px] text-muted">Resolving audience…</p>
            ) : preview ? (
              <>
                <p className="text-3xl font-semibold tabular tracking-[-0.02em] text-default">
                  {preview.total.toLocaleString('en-IN')}
                </p>
                <p className="text-[12.5px] text-muted">people will receive this</p>
                <div className="mt-3 space-y-1 text-[13px]">
                  <Row label="Students" value={preview.breakdown.students} />
                  <Row label="Faculty" value={preview.breakdown.faculty} />
                  <Row label="Staff" value={preview.breakdown.staff} />
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-subtle">
                  {preview.description}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-muted">Choose an audience to see the reach.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Options" />
          <CardBody className="space-y-3">
            <Toggle
              checked={requiresAck}
              onChange={setRequiresAck}
              label="Require acknowledgement"
              hint="Recipients must confirm they have read it. You will see exactly who has not."
            />
            <Toggle
              checked={allowComments}
              onChange={setAllowComments}
              label="Allow questions"
              hint="A controlled thread you can close, not an open chat."
            />
            {canEmergencyBroadcast ? (
              <Toggle
                checked={isEmergency}
                onChange={setIsEmergency}
                label="Emergency broadcast"
                hint="Bypasses quiet hours and notification preferences. Use only for genuine emergencies."
                danger
              />
            ) : null}
          </CardBody>
        </Card>

        {isEmergency ? (
          <Alert tone="danger" icon={Radio} title="Emergency broadcast">
            This will interrupt {pluralize(preview?.total ?? 0, 'person', 'people')} regardless of
            their notification settings, and the action is recorded in the audit log.
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger" icon={AlertTriangle} title="Could not send">
            {error}
          </Alert>
        ) : null}

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          icon={Send}
          loading={sending}
          disabled={!canSend}
          onClick={send}
        >
          {kind === 'OFFICIAL' && !canPublishOfficial ? 'Submit for approval' : 'Publish notice'}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular font-medium text-default">{value.toLocaleString('en-IN')}</span>
    </div>
  );
}

function Toggle({
  checked, onChange, label, hint, danger,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[hsl(var(--border-strong))] accent-[hsl(var(--brand))]"
      />
      <span>
        <span className={`block text-[13px] font-medium ${danger ? 'text-danger' : 'text-default'}`}>
          {label}
        </span>
        <span className="block text-[12px] leading-relaxed text-subtle">{hint}</span>
      </span>
    </label>
  );
}
