import { z } from 'zod';
import { idParam, ok, parseBody, withAuth } from '@/lib/api';
import { metaFrom } from '@/lib/http';
import { getInvoice, invoicePdf, setInvoiceStatus } from '@/services/billing';

/**
 * GET → the invoice as PDF (operators, or the college's own administrators).
 * POST → mark PAID or VOID (operators only). CAMPUSOS-020.
 */
export const GET = withAuth(null, async (_request, { user, params }) => {
  const invoice = await getInvoice(user, idParam(params.id, 'That invoice'));
  const bytes = await invoicePdf(invoice);
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${invoice.invoiceNumber.replace(/[^A-Za-z0-9-]/g, '_')}.pdf"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});

const Body = z.object({
  status: z.enum(['PAID', 'VOID']),
  reference: z.string().trim().max(120).nullish(),
  reason: z.string().trim().max(300).nullish(),
});

export const POST = withAuth(null, async (request, { user, params }) => {
  const input = await parseBody(request, Body);
  await setInvoiceStatus(user, idParam(params.id, 'That invoice'), input, metaFrom(request));
  return ok({ status: input.status });
});
