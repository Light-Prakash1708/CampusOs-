import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { commitImport, type ImportEntity } from '@/services/import';

const Body = z.object({
  entityType: z.enum(['students', 'faculty', 'subjects', 'rooms', 'sections']),
  fileName: z.string().max(300),
  rows: z.array(z.record(z.string(), z.string())).min(1).max(20_000),
});

export const POST = withAuth('data:import', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const result = await commitImport(
    user,
    input.entityType as ImportEntity,
    input.rows,
    input.fileName,
  );
  return ok(result);
});
