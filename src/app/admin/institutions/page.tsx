import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/features';
import { formatDateTime } from '@/lib/utils';
import { INSTITUTION_TYPES, isPlatformOperator, listInstitutions, ONBOARDING_MODULES } from '@/services/institutions';
import { CreateInstitutionWizard } from './CreateInstitutionWizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Institutions · CampusOS' };

/** Platform operators only; everyone else gets a plain 404. */
export default async function InstitutionsPage() {
  const user = await requireAuth();
  if (!isPlatformOperator(user)) notFound();
  const institutions = await listInstitutions(user);
  const modules = ONBOARDING_MODULES.map((f) => ({
    key: f,
    label: FEATURE_FLAGS[f].label,
    description: FEATURE_FLAGS[f].description,
    defaultOn: FEATURE_FLAGS[f].defaultValue,
  }));

  return (
    <div>
      <PageHeader
        title="Institutions"
        description="Create a college on CampusOS and invite its first administrator. The college finishes its own setup from there."
      />
      <Section title="Create an institution">
        <CreateInstitutionWizard types={[...INSTITUTION_TYPES]} modules={modules} />
      </Section>
      <Section title="On this deployment">
        <Card>
          <CardHeader title={`${institutions.length} institution${institutions.length === 1 ? '' : 's'}`} />
          {institutions.length === 0 ? (
            <EmptyState title="No institutions yet" description="Create the first one above." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Institution</Th>
                  <Th>Status</Th>
                  <Th align="right">Students</Th>
                  <Th align="right">Staff</Th>
                  <Th>Created</Th>
                </tr>
              </thead>
              <tbody>
                {institutions.map((i) => (
                  <tr key={i.id}>
                    <Td>
                      <span className="block text-[13.5px] font-medium text-default">{i.name}</span>
                      <span className="block text-[11.5px] text-subtle">{i.slug}{i.city ? ` · ${i.city}` : ''}</span>
                    </Td>
                    <Td>
                      {!i.isActive ? (
                        <Badge tone="danger">Inactive</Badge>
                      ) : i.setupCompletedAt ? (
                        <Badge tone="success">Launched</Badge>
                      ) : (
                        <Badge tone="info">Setting up</Badge>
                      )}
                    </Td>
                    <Td align="right"><span className="tabular text-[13px]">{i.students}</span></Td>
                    <Td align="right"><span className="tabular text-[13px]">{i.staff}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{formatDateTime(i.createdAt)}</span></Td>
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
