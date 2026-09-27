import { requirePermission } from '@/lib/auth/context';
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { currentSubscription, listInvoices, PLANS, type Plan } from '@/services/billing';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plan & invoices · CampusOS' };

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The college's own plan and invoices (read-only). CAMPUSOS-020. */
export default async function CollegeBillingPage() {
  const user = await requirePermission('institution:manage');
  const [sub, invoices] = await Promise.all([currentSubscription(user, user.institutionId), listInvoices(user, user.institutionId)]);

  return (
    <div>
      <PageHeader title="Plan & invoices" description="Your CampusOS plan and invoices. For changes, contact the CampusOS team." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Plan" />
          <CardBody className="space-y-1.5 text-[13.5px]">
            {sub ? (
              <>
                <p><span className="text-muted">Plan:</span> <strong>{PLANS[sub.plan as Plan]?.label ?? sub.plan}</strong> <Badge tone="neutral">{sub.status.toLowerCase()}</Badge></p>
                <p><span className="text-muted">Students:</span> {sub.seats.toLocaleString('en-IN')}</p>
                <p><span className="text-muted">Period:</span> {sub.periodStart} to {sub.periodEnd}</p>
              </>
            ) : (
              <p className="text-muted">No plan recorded yet.</p>
            )}
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Invoices" />
          {invoices.length === 0 ? (
            <CardBody><EmptyState title="No invoices" description="Invoices appear here when they are issued." /></CardBody>
          ) : (
            <Table>
              <thead><tr><Th>Number</Th><Th>Issued</Th><Th align="right">Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td><a href={`/api/invoices/${i.id}`} target="_blank" rel="noopener" className="font-medium text-brand hover:underline">{i.invoiceNumber}</a></Td>
                    <Td>{i.issueDate}</Td>
                    <Td align="right" className="tabular">{inr(i.totalPaise)}</Td>
                    <Td><Badge tone={i.status === 'PAID' ? 'success' : i.status === 'VOID' ? 'neutral' : 'warning'}>{i.status.toLowerCase()}</Badge></Td>
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
