import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { currentSubscription, issueInvoice, listInvoices, PLANS, setSubscription, SUBSCRIPTION_STATUSES } from '@/services/billing';

/** Operator billing for one college (CAMPUSOS-020). Authorisation in the service. */
export const GET = withAuth(null, async (_request, { user, params }) => {
  const id = idParam(params.id, 'That institution');
  return ok({ subscription: await currentSubscription(user, id), invoices: await listInvoices(user, id) });
});

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const Body = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('subscription'),
    plan: z.enum(Object.keys(PLANS) as [keyof typeof PLANS, ...(keyof typeof PLANS)[]]),
    status: z.enum(SUBSCRIPTION_STATUSES),
    seats: z.number().int().min(0).max(1_000_000),
    pricePerSeatRupees: z.number().min(0).max(100_000),
    periodStart: iso,
    periodEnd: iso,
    billingName: z.string().trim().max(200).nullish(),
    billingAddress: z.string().trim().max(500).nullish(),
    gstin: z.string().trim().max(15).nullish(),
    placeOfSupply: z.string().trim().max(60).nullish(),
    notes: z.string().trim().max(1000).nullish(),
  }),
  z.object({
    action: z.literal('invoice'),
    taxRatePercent: z.number().min(0).max(28).optional(),
    sacCode: z.string().trim().max(10).nullish(),
    dueInDays: z.number().int().min(0).max(120).optional(),
    description: z.string().trim().max(300).nullish(),
  }),
]);

export const POST = withAuth(null, async (request, { user, params }) => {
  const id = idParam(params.id, 'That institution');
  const input = await parseBody(request, Body);
  const meta = metaFrom(request);
  if (input.action === 'subscription') {
    const { action: _a, ...rest } = input;
    return ok(await setSubscription(user, id, rest, meta));
  }
  const { action: _a, ...rest } = input;
  const invoice = await issueInvoice(user, id, rest, meta);
  return ok({ id: invoice.id, invoiceNumber: invoice.invoiceNumber });
});
