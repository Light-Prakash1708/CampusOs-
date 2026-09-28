import { notFound } from 'next/navigation';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { FEATURE_FLAGS } from '@/lib/features';
import { formatDateTime } from '@/lib/utils';
import { CORE_MODULES, INSTITUTION_TYPES, isPlatformOperator, listInstitutions, ONBOARDING_MODULES } from '@/services/institutions';
import { listCollegeRequests } from '@/services/college-requests';
import { CreateInstitutionWizard } from './CreateInstitutionWizard';
import { CollegeRequestStatus } from './CollegeRequestStatus';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Institutions · CampusOS' };

/** Platform operators only; everyone else gets a plain 404. */
export default async function InstitutionsPage() {
  const user = await requireAuth();
  if (!isPlatformOperator(user)) notFound();
  const [institutions, requests] = await Promise.all([listInstitutions(user), listCollegeRequests(user)]);
  const modules = ONBOARDING_MODULES.map((f) => ({
    key: f,
    label: FEATURE_FLAGS[f].label,
    description: FEATURE_FLAGS[f].description,
    // New colleges start with the pilot core set; the rest stays available.
    defaultOn: CORE_MODULES.includes(f),
  }));

  return (
    <div>
      <PageHeader
        title="Institutions"
        description="Create a college on CampusOS and invite its first administrator. The college finishes its own setup from there."
      />
      <Section title="Requests from colleges">
        <Card>
          <CardHeader title={`${requests.length === 0 ? 'No' : requests.length} request${requests.length === 1 ? '' : 's'} from “Register your college”`} />
          {requests.length === 0 ? (
            <EmptyState title="No requests yet" description="Colleges that ask to join through the public form appear here. Check each one before creating it below." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>College</Th>
                  <Th>Contact</Th>
                  <Th align="right">Students</Th>
                  <Th>Received</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <span className="block text-[13.5px] font-medium text-default">{r.collegeName}</span>
                      <span className="block text-[11.5px] text-subtle">{[r.university, r.city, r.website].filter(Boolean).join(' · ')}</span>
                      {r.message ? <span className="mt-0.5 block max-w-[360px] text-[12px] text-muted">{r.message}</span> : null}
                    </Td>
                    <Td>
                      <span className="block text-[13px] text-default">{r.contactName} · {r.contactRole}</span>
                      <a href={`mailto:${r.contactEmail}`} className="text-[12px] font-medium text-brand hover:underline">{r.contactEmail}</a>
                    </Td>
                    <Td align="right"><span className="tabular text-[13px]">{r.studentCount ?? '—'}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{formatDateTime(r.createdAt)}</span></Td>
                    <Td><CollegeRequestStatus id={r.id} status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </Section>
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
                      <a href={`/admin/institutions/${i.id}/billing`} className="text-[11.5px] font-medium text-brand hover:underline">Billing</a>
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
