import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Alert, PageHeader } from '@/components/ui';
import { isPlatformOperator } from '@/services/institutions';
import { activeStudentCount, currentSubscription, listInvoices, PLANS, sellerDetails } from '@/services/billing';
import { BillingManager } from './BillingManager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Billing · CampusOS' };

/** Operator billing for one college (CAMPUSOS-020): plan, seats, price, invoices. */
export default async function InstitutionBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth();
  if (!isPlatformOperator(user)) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [inst] = await db.select({ id: t.institutions.id, name: t.institutions.name, kind: t.institutions.kind, isDemo: t.institutions.isDemo }).from(t.institutions).where(eq(t.institutions.id, id)).limit(1);
  if (!inst) notFound();
  const [sub, invoices, students] = await Promise.all([currentSubscription(user, id), listInvoices(user, id), activeStudentCount(id)]);
  const seller = sellerDetails();

  return (
    <div>
      <PageHeader
        title={`Billing — ${inst.name}`}
        description="Plan, seats and manual invoices. No payment gateway: record payments here when they arrive."
        breadcrumb={
          <Link href="/admin/institutions" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-default">
            <ArrowLeft size={13} /> Institutions
          </Link>
        }
      />
      {!seller.gstin ? (
        <Alert tone="info" className="mb-4" title="Seller GSTIN not configured">
          Invoices are titled “Invoice”, not “Tax Invoice”, until <code>BILLING_SELLER_GSTIN</code> is set. Confirm GST treatment, rate and SAC code with your accountant before charging tax.
        </Alert>
      ) : null}
      <BillingManager
        institutionId={inst.id}
        billable={inst.kind === 'COLLEGE' && !inst.isDemo}
        activeStudents={students}
        plans={Object.entries(PLANS).map(([key, p]) => ({ key, label: p.label, note: p.note }))}
        subscription={
          sub
            ? {
                plan: sub.plan,
                status: sub.status,
                seats: sub.seats,
                pricePerSeatRupees: sub.pricePerSeatPaise / 100,
                periodStart: sub.periodStart,
                periodEnd: sub.periodEnd,
                billingName: sub.billingName,
                billingAddress: sub.billingAddress,
                gstin: sub.gstin,
                placeOfSupply: sub.placeOfSupply,
                notes: sub.notes,
              }
            : null
        }
        invoices={invoices.map((i) => ({ id: i.id, number: i.invoiceNumber, issueDate: i.issueDate, dueDate: i.dueDate, totalPaise: i.totalPaise, status: i.status, paymentReference: i.paymentReference }))}
        defaultTaxPercent={Number(process.env.BILLING_DEFAULT_GST_PERCENT ?? 0)}
      />
    </div>
  );
}
