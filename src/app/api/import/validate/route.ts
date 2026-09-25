import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { validateImport, type ImportEntity } from '@/services/import';

const Body = z.object({
  entityType: z.enum(['students', 'faculty', 'subjects', 'rooms', 'sections']),
  csv: z.string().min(1, 'The file appears to be empty.').max(8_000_000),
  columnMapping: z.record(z.string(), z.string()).optional(),
});

/** Validation only. This endpoint never writes to the database. */
export const POST = withAuth('data:import', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const result = await validateImport(
    user,
    input.entityType as ImportEntity,
    input.csv,
    input.columnMapping,
  );
  return ok(result);
});
