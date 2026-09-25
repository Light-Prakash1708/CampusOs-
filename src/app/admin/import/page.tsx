import { and, desc, eq } from 'drizzle-orm';
import { Upload } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/utils';
import { ImportWizard } from './ImportWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Data import · CampusOS' };

/**
 * Data Import Centre — the "overlay mode" entry point.
 *
 * A college cannot replace its ERP overnight, so CampusOS imports the records
 * it already has and takes over workflows gradually. Import is validate-then-
 * commit: nothing is written until the admin has seen every error.
 */
export default async function ImportPage() {
  const user = await requirePermission('data:import');

  const jobs = await db
    .select({
      id: t.importJobs.id,
      entityType: t.importJobs.entityType,
      fileName: t.importJobs.fileName,
      status: t.importJobs.status,
      totalRows: t.importJobs.totalRows,
      validRows: t.importJobs.validRows,
      errorRows: t.importJobs.errorRows,
      importedRows: t.importJobs.importedRows,
      createdAt: t.importJobs.createdAt,
    })
    .from(t.importJobs)
    .where(eq(t.importJobs.institutionId, user.institutionId))
    .orderBy(desc(t.importJobs.createdAt))
    .limit(20);

  return (
    <div>
      <PageHeader
        title="Data import"
        description="Bring your existing records in. Nothing is written until you have seen every validation error."
      />

      <Alert tone="info" className="mb-5" icon={Upload} title="Overlay mode">
        CampusOS is designed to run alongside your current ERP rather than replace it on day one.
        Import students, faculty, subjects and rooms here, then move workflows across at your own
        pace.
      </Alert>

      <ImportWizard />

      <Section title="Import history" className="mt-6">
        <Card>
          {jobs.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="No imports yet"
              description="Uploaded files and their validation results appear here."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>File</Th>
                  <Th>Type</Th>
                  <Th align="right">Rows</Th>
                  <Th align="right">Valid</Th>
                  <Th align="right">Errors</Th>
                  <Th>Status</Th>
                  <Th>When</Th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.id}>
                    <Td><span className="font-mono text-[12.5px] text-muted">{j.fileName}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{humanize(j.entityType)}</span></Td>
                    <Td align="right" className="tabular">{j.totalRows}</Td>
                    <Td align="right" className="tabular text-success">{j.validRows}</Td>
                    <Td align="right" className="tabular text-danger">{j.errorRows}</Td>
                    <Td><Badge tone={j.status === 'COMPLETED' ? 'success' : j.status.includes('FAILED') ? 'danger' : 'neutral'}>{humanize(j.status)}</Badge></Td>
                    <Td><span className="text-[12px] text-muted">{formatDateTime(j.createdAt)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>
    </div>
  );
}
