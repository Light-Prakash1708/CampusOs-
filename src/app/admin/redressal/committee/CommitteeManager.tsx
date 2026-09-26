'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, UserPlus } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Th } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

interface Member { id: string; name: string; role: string; body: string; position: string; termEndsOn: string | null }
interface Person { id: string; name: string; role: string }

const POSITION_LABEL: Record<string, string> = {
  CHAIR: 'Chairperson',
  MEMBER: 'Member',
  STUDENT_INVITEE: 'Student special invitee',
  OMBUDSPERSON: 'Ombudsperson',
};

export function CommitteeManager({ members, staff, attestedAt }: { members: Member[]; staff: Person[]; attestedAt: string | null }) {
  const router = useRouter();
  const api = useApi<{ id?: string }>();
  const [position, setPosition] = React.useState('MEMBER');
  const [userId, setUserId] = React.useState('');
  const [rollNumber, setRollNumber] = React.useState('');
  const [termEndsOn, setTermEndsOn] = React.useState('');
  const invitee = position === 'STUDENT_INVITEE';

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = position === 'OMBUDSPERSON' ? 'OMBUDSPERSON' : 'SGRC';
    const done = await api.call('/api/admin/grievance-committee', {
      action: 'add',
      body,
      position,
      ...(invitee ? { rollNumber } : { userId }),
      termEndsOn: termEndsOn || null,
    });
    if (done) {
      setUserId('');
      setRollNumber('');
      router.refresh();
    }
  }
  async function remove(memberId: string) {
    if (await api.call('/api/admin/grievance-committee', { action: 'remove', memberId })) router.refresh();
  }
  async function attest() {
    if (await api.call('/api/admin/grievance-committee', { action: 'attest' })) router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader title="Members" description="The committee handles grievances; the Ombudsperson decides appeals." />
        {members.length === 0 ? (
          <CardBody><EmptyState title="Nobody added yet" description="Add the chairperson, four members, a student special invitee and the Ombudsperson." /></CardBody>
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Position</Th><Th>Term ends</Th><Th /></tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td>
                    <span className="block text-[13.5px] text-default">{m.name}</span>
                    <span className="block text-[11.5px] text-subtle">{m.role}</span>
                  </Td>
                  <Td><Badge tone={m.body === 'OMBUDSPERSON' ? 'brand' : 'neutral'}>{POSITION_LABEL[m.position] ?? m.position}</Badge></Td>
                  <Td><span className="text-[12.5px] text-muted">{m.termEndsOn ?? '—'}</span></Td>
                  <Td align="right">
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(m.id)} aria-label={`Remove ${m.name}`}>Remove</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Add a member" />
        <CardBody>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Position" htmlFor="cm-pos">
              <Select id="cm-pos" value={position} onChange={(e) => setPosition(e.target.value)}>
                {Object.entries(POSITION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            {invitee ? (
              <Field label="Student roll number" htmlFor="cm-roll" error={api.fieldError('rollNumber')}>
                <Input id="cm-roll" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} maxLength={60} />
              </Field>
            ) : (
              <Field label="Person" htmlFor="cm-user" hint={position === 'OMBUDSPERSON' ? 'Invite an external Ombudsperson as a Management user first.' : undefined}>
                <Select id="cm-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">Choose…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.role}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Term ends" htmlFor="cm-term" hint="Optional — usually 2 years; 1 year for the student invitee">
              <Input id="cm-term" type="date" value={termEndsOn} onChange={(e) => setTermEndsOn(e.target.value)} />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary" icon={UserPlus} loading={api.loading} disabled={invitee ? !rollNumber : !userId}>Add</Button>
            </div>
            <div className="sm:col-span-2"><ErrorBox error={api.error} /></div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Representation" description="The regulations ask for at least one woman and at least one SC/ST/OBC member on the committee." />
        <CardBody className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 flex-1 text-[13px] text-muted">
            {attestedAt ? `Confirmed by your college on ${new Date(attestedAt).toLocaleDateString('en-IN')}.` : 'Confirm once your committee meets these rules. CampusOS records only that you confirmed it.'}
          </p>
          <Button size="sm" variant={attestedAt ? 'secondary' : 'primary'} onClick={attest} loading={api.loading}>
            {attestedAt ? 'Confirm again' : 'Confirm composition'}
          </Button>
        </CardBody>
      </Card>
    </>
  );
}
