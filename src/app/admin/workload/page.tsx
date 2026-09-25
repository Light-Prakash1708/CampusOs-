import { Gauge, TrendingDown, TrendingUp } from 'lucide-react';
import { requireAnyPermission } from '@/lib/auth/context';
import {
  Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress, Section, Stat, Table, Td, Th,
} from '@/components/ui';
import { num, pluralize } from '@/lib/utils';
import { computeWorkloadBalance } from '@/services/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Faculty workload · CampusOS' };

const STATUS_TONE = {
  BALANCED: 'success', HIGH: 'warning', CRITICAL: 'danger', UNDERLOADED: 'info',
} as const;

/**
 * Workload distribution across the institution.
 * Every total is the sum of recorded workload items — derived teaching hours
 * from the timetable plus explicitly entered duties — so any figure can be
 * traced back to its constituents.
 */
export default async function WorkloadPage() {
  const user = await requireAnyPermission(['workload:view_all', 'workload:view_department']);
  const balance = await computeWorkloadBalance(user.institutionId);

  if (balance.faculty.length === 0) {
    return (
      <div>
        <PageHeader title="Faculty workload" />
        <Card>
          <EmptyState
            icon={Gauge}
            title="No workload has been computed yet"
            description="Workload is derived from the published timetable plus recorded administrative duties. Publish a timetable to populate it."
          />
        </Card>
      </div>
    );
  }

  const heaviest = balance.faculty[0]!;
  const lightest = balance.faculty[balance.faculty.length - 1]!;

  return (
    <div>
      <PageHeader
        title="Faculty workload"
        description="Teaching, labs, assessment, administration and mentoring — measured against contracted hours."
      />

      <Section title="Distribution">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Above contracted load"
            value={balance.overloadedCount}
            icon={TrendingUp}
            tone={balance.overloadedCount > 0 ? 'warning' : 'success'}
            sublabel={`of ${balance.faculty.length} faculty`}
          />
          <Stat
            label="Significantly under-loaded"
            value={balance.underloadedCount}
            icon={TrendingDown}
            tone={balance.underloadedCount > 0 ? 'info' : 'neutral'}
          />
          <Stat
            label="Spread"
            value={`${balance.spread} hrs`}
            sublabel="standard deviation across faculty"
            tone={balance.spread > 6 ? 'warning' : 'success'}
          />
          <Stat
            label="Heaviest load"
            value={`${num(heaviest.totalHours)} hrs`}
            sublabel={heaviest.name}
            tone={heaviest.utilizationPercent > 110 ? 'danger' : 'neutral'}
          />
        </div>
      </Section>

      {balance.rebalanceHint ? (
        <Alert tone="warning" className="mb-5" icon={Gauge} title="Rebalancing opportunity">
          {balance.rebalanceHint}
        </Alert>
      ) : null}

      <Section title="By department">
        <Card>
          <CardBody className="space-y-3">
            {balance.departmentAverages.map((d) => (
              <div key={d.department}>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="font-medium text-default">{d.department}</span>
                  <span className="tabular text-muted">
                    {d.average} hrs avg · {pluralize(d.facultyCount, 'member')}
                  </span>
                </div>
                <Progress
                  value={Math.min(100, (d.average / 24) * 100)}
                  tone={d.average > 20 ? 'warning' : 'brand'}
                  className="mt-1.5"
                />
              </div>
            ))}
          </CardBody>
        </Card>
      </Section>

      <Card>
        <CardHeader
          title="Every faculty member"
          description="Sorted by total weekly hours. Utilisation is against each person's contracted maximum."
        />
        <Table>
          <thead>
            <tr>
              <Th>Faculty</Th>
              <Th>Dept</Th>
              <Th align="right">Total</Th>
              <Th align="right">Contracted</Th>
              <Th align="right">Dept avg</Th>
              <Th>Utilisation</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {balance.faculty.map((f) => (
              <tr key={f.id} className="hover:bg-surface-sunken">
                <Td><span className="text-[13.5px] font-medium text-default">{f.name}</span></Td>
                <Td><span className="text-[12.5px] text-muted">{f.department}</span></Td>
                <Td align="right" className="tabular font-medium">{num(f.totalHours)}</Td>
                <Td align="right" className="tabular text-muted">{f.contractedMax}</Td>
                <Td align="right" className="tabular text-muted">
                  {f.departmentAverage !== null ? num(f.departmentAverage) : '—'}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={Math.min(140, f.utilizationPercent)}
                      max={140}
                      tone={
                        f.utilizationPercent > 125 ? 'danger'
                          : f.utilizationPercent > 105 ? 'warning'
                          : f.utilizationPercent < 55 ? 'brand' : 'success'
                      }
                      className="w-24"
                    />
                    <span className="tabular text-[12px] text-muted">
                      {Math.round(f.utilizationPercent)}%
                    </span>
                  </div>
                </Td>
                <Td><Badge tone={STATUS_TONE[f.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
                  {f.status.charAt(0) + f.status.slice(1).toLowerCase()}
                </Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
