'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Table, Td, Textarea, Th } from '@/components/ui';
import { ErrorBox, useApi } from '@/components/auth/useApi';

interface Sub {
  plan: string; status: string; seats: number; pricePerSeatRupees: number; periodStart: string; periodEnd: string;
  billingName: string | null; billingAddress: string | null; gstin: string | null; placeOfSupply: string | null; notes: string | null;
}
interface Inv { id: string; number: string; issueDate: string; dueDate: string; totalPaise: number; status: string; paymentReference: string | null }

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BillingManager(props: {
  institutionId: string;
  billable: boolean;
  activeStudents: number;
  plans: { key: string; label: string; note: string }[];
  subscription: Sub | null;
  invoices: Inv[];
  defaultTaxPercent: number;
}) {
  const router = useRouter();
  const api = useApi<{ id?: string; invoiceNumber?: string; status?: string }>();
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = React.useState<Sub>(
    props.subscription ?? {
      plan: 'PILOT', status: 'PILOT', seats: props.activeStudents, pricePerSeatRupees: 0, periodStart: today,
      periodEnd: new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10),
      billingName: null, billingAddress: null, gstin: null, placeOfSupply: null, notes: null,
    },
  );
  const [tax, setTax] = React.useState(String(props.defaultTaxPercent));
  const [sac, setSac] = React.useState('');
  const set = <K extends keyof Sub>(k: K, v: Sub[K]) => setF((x) => ({ ...x, [k]: v }));
  const planNote = props.plans.find((p) => p.key === f.plan)?.note;
  const annual = f.seats * f.pricePerSeatRupees;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (await api.call(`/api/admin/institutions/${props.institutionId}/billing`, { action: 'subscription', ...f })) router.refresh();
  }
  async function invoice() {
    const r = await api.call(`/api/admin/institutions/${props.institutionId}/billing`, { action: 'invoice', taxRatePercent: Number(tax) || 0, sacCode: sac || null });
    if (r) router.refresh();
  }
  async function mark(id: string, status: 'PAID' | 'VOID') {
    const reference = status === 'PAID' ? window.prompt('Payment reference (UTR / cheque no.), optional') : null;
    const reason = status === 'VOID' ? window.prompt('Why is this invoice void?') : null;
    if (status === 'VOID' && !reason) return;
    if (await api.call(`/api/invoices/${id}`, { status, reference, reason })) router.refresh();
  }

  if (!props.billable) {
    return <Card><CardBody><EmptyState title="Not billable" description="Personal workspaces and the demo college are never billed." /></CardBody></Card>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader title="Plan" description={`${props.activeStudents} active student accounts today.`} />
        <CardBody>
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
            <Field label="Plan" htmlFor="b-plan" hint={planNote}>
              <Select id="b-plan" value={f.plan} onChange={(e) => set('plan', e.target.value)}>
                {props.plans.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Status" htmlFor="b-status">
              <Select id="b-status" value={f.status} onChange={(e) => set('status', e.target.value)}>
                {['PILOT', 'ACTIVE', 'PAST_DUE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
              </Select>
            </Field>
            <Field label="Student seats" htmlFor="b-seats" error={api.fieldError('seats')}>
              <Input id="b-seats" type="number" min={0} value={f.seats} onChange={(e) => set('seats', Math.max(0, Math.round(Number(e.target.value) || 0)))} />
            </Field>
            <Field label="Price per student for the period (₹)" htmlFor="b-price" hint="Agreed with this college — not a list price." error={api.fieldError('pricePerSeatRupees')}>
              <Input id="b-price" type="number" min={0} step="0.01" value={f.pricePerSeatRupees} onChange={(e) => set('pricePerSeatRupees', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Period starts" htmlFor="b-start"><Input id="b-start" type="date" value={f.periodStart} onChange={(e) => set('periodStart', e.target.value)} /></Field>
            <Field label="Period ends" htmlFor="b-end"><Input id="b-end" type="date" value={f.periodEnd} onChange={(e) => set('periodEnd', e.target.value)} /></Field>
            <Field label="Bill to (legal name)" htmlFor="b-name"><Input id="b-name" value={f.billingName ?? ''} onChange={(e) => set('billingName', e.target.value)} /></Field>
            <Field label="College GSTIN" htmlFor="b-gstin" hint="If the college has one" error={api.fieldError('gstin')}><Input id="b-gstin" value={f.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} /></Field>
            <Field label="Billing address" htmlFor="b-addr" className="sm:col-span-2"><Textarea id="b-addr" rows={2} value={f.billingAddress ?? ''} onChange={(e) => set('billingAddress', e.target.value)} /></Field>
            <Field label="Place of supply (state)" htmlFor="b-pos"><Input id="b-pos" value={f.placeOfSupply ?? ''} onChange={(e) => set('placeOfSupply', e.target.value)} /></Field>
            <Field label="Internal notes" htmlFor="b-notes"><Input id="b-notes" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
            <p className="text-[13px] text-muted sm:col-span-2">Period value before tax: <strong className="text-default">₹{annual.toLocaleString('en-IN')}</strong></p>
            <div className="sm:col-span-2"><ErrorBox error={api.error} /></div>
            <div><Button type="submit" variant="primary" loading={api.loading}>Save plan</Button></div>
          </form>
        </CardBody>
      </Card>

      <div className="space-y-5 lg:col-span-2">
        <Card>
          <CardHeader title="Issue an invoice" description="For the saved plan. Numbered sequentially per financial year." />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            <Field label="GST %" htmlFor="b-tax" hint="Confirm with your accountant"><Input id="b-tax" type="number" min={0} max={28} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
            <Field label="SAC code" htmlFor="b-sac" hint="Optional"><Input id="b-sac" value={sac} onChange={(e) => setSac(e.target.value)} maxLength={10} /></Field>
            <div className="sm:col-span-2"><Button variant="secondary" icon={FileText} onClick={invoice} loading={api.loading} disabled={!props.subscription}>Issue invoice</Button></div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Invoices" />
          {props.invoices.length === 0 ? (
            <CardBody><EmptyState title="No invoices yet" description="Issue one once the plan is saved." /></CardBody>
          ) : (
            <Table>
              <thead><tr><Th>Number</Th><Th align="right">Total</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {props.invoices.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <a href={`/api/invoices/${i.id}`} target="_blank" rel="noopener" className="block text-[13px] font-medium text-brand hover:underline">{i.number}</a>
                      <span className="block text-[11.5px] text-subtle">Due {i.dueDate}</span>
                    </Td>
                    <Td align="right" className="tabular">{inr(i.totalPaise)}</Td>
                    <Td><Badge tone={i.status === 'PAID' ? 'success' : i.status === 'VOID' ? 'neutral' : 'warning'}>{i.status.toLowerCase()}</Badge></Td>
                    <Td align="right">
                      {i.status === 'ISSUED' ? (
                        <span className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => mark(i.id, 'PAID')}>Paid</Button>
                          <Button size="sm" variant="ghost" onClick={() => mark(i.id, 'VOID')}>Void</Button>
                        </span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
