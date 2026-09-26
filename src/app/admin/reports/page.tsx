import Link from 'next/link';
import { BarChart3, Download, FileText } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { EvidencePackForm } from './EvidencePackForm';
import { Alert, Button, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';

export const metadata = { title: 'Evidence & Reports · CampusOS' };

const REPORTS = [
  { key: 'attendance', title: 'Attendance register', description: 'Per-student attendance across every subject, with shortage flags.' },
  { key: 'workload', title: 'Faculty workload', description: 'Weekly hours by category against contracted maximums.' },
  { key: 'utilization', title: 'Room utilisation', description: 'Period-by-period occupancy for every bookable space.' },
  { key: 'grievances', title: 'Redressal summary', description: 'Case volumes, resolution times and SLA performance.' },
  { key: 'communication', title: 'Communication reach', description: 'Notice read and acknowledgement rates.' },
];

/**
 * Report exports. Each entry links to a CSV endpoint that streams live data —
 * these are not placeholder buttons.
 */
export default async function ReportsPage() {
  const user = await requirePermission('report:generate');

  return (
    <div>
      <PageHeader
        title="Evidence & Reports"
        description="Download live data as CSV for offline analysis or institutional returns."
      />

      <Section title="Evidence pack" description="One download for a period: communication proof, grievance handling against the committee’s timelines, attendance by programme, and participation. Aggregated by default.">
        <Card>
          <CardHeader title="Campus evidence" description="A ZIP with a printable summary (open it, then Print → Save as PDF) and the CSVs behind every number." />
          <CardBody>
            <EvidencePackForm canIndividual={user.permissions.has('data:export')} />
          </CardBody>
        </Card>
      </Section>

      <Section title="Available reports">
        <div className="grid gap-3 sm:grid-cols-2">
          {REPORTS.map((r) => (
            <Card key={r.key}>
              <CardBody className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-default">{r.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{r.description}</p>
                </div>
                <Button asChild variant="secondary" size="sm" icon={Download}>
                  <a href={`/api/reports/${r.key}`} download>
                    CSV
                  </a>
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      </Section>

      <Alert tone="info" icon={FileText} title="About these exports">
        Every report is generated from the database at the moment you download it. Figures match
        Campus Insights and each notice’s receipts because they come from the same queries. Mapping
        to accreditation criteria is for your IQAC to decide; CampusOS does not claim a mapping.
      </Alert>
    </div>
  );
}
