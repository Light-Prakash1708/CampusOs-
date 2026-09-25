import Link from 'next/link';
import { BarChart3, Download, FileText } from 'lucide-react';
import { requirePermission } from '@/lib/auth/context';
import { Alert, Button, Card, CardBody, CardHeader, PageHeader, Section } from '@/components/ui';

export const metadata = { title: 'Reports · CampusOS' };

const REPORTS = [
  { key: 'attendance', title: 'Attendance register', description: 'Per-student attendance across every subject, with shortage flags.' },
  { key: 'workload', title: 'Faculty workload', description: 'Weekly hours by category against contracted maximums.' },
  { key: 'utilization', title: 'Room utilisation', description: 'Period-by-period occupancy for every bookable space.' },
  { key: 'grievances', title: 'Readdressal summary', description: 'Case volumes, resolution times and SLA performance.' },
  { key: 'communication', title: 'Communication reach', description: 'Notice read and acknowledgement rates.' },
];

/**
 * Report exports. Each entry links to a CSV endpoint that streams live data —
 * these are not placeholder buttons.
 */
export default async function ReportsPage() {
  await requirePermission('report:generate');

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Download live data as CSV for offline analysis or institutional returns."
      />

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
        what you see in Analytics because they come from the same queries.
      </Alert>
    </div>
  );
}
