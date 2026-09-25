import { BarChart3, DoorOpen, Gauge, Megaphone, TrendingUp, Users } from 'lucide-react';
import { requireAnyPermission } from '@/lib/auth/context';
import {
  Alert, Badge, Card, CardBody, CardHeader, PageHeader, Progress, Section, Stat, Table, Td, Th,
} from '@/components/ui';
import { humanize, minutesToHuman, num, pluralize } from '@/lib/utils';
import {
  computeAttendanceHealth, computeCommunicationHealth, computeGrievanceHealth,
  computeProductivityScore, computeRoomUtilization, computeTimeSaved, computeWorkloadBalance,
} from '@/services/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Analytics · CampusOS' };

/**
 * Institutional analytics.
 *
 * Every metric here is computed from records at request time. The composite
 * productivity score is shown with its dimensions exposed and an explicit
 * statement that it is an internal product metric, not a standard.
 */
export default async function AnalyticsPage() {
  const user = await requireAnyPermission([
    'analytics:view_institution',
    'analytics:view_department',
  ]);

  const [productivity, rooms, workload, attendance, comms, grievance, timeSaved] =
    await Promise.all([
      computeProductivityScore(user.institutionId),
      computeRoomUtilization(user.institutionId),
      computeWorkloadBalance(user.institutionId),
      computeAttendanceHealth(user.institutionId),
      computeCommunicationHealth(user.institutionId),
      computeGrievanceHealth(user.institutionId),
      computeTimeSaved(user.institutionId),
    ]);

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Computed live from institutional records. Nothing here is a stored estimate unless labelled as one."
      />

      {/* ---------------- Productivity composite ---------------- */}
      <Section title="Campus productivity">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-start gap-8">
              <div>
                <p className="text-5xl font-semibold tabular tracking-[-0.03em] text-default">
                  {productivity.score}
                </p>
                <p className="text-[13px] text-muted">out of 100</p>
              </div>
              <div className="min-w-[280px] flex-1 space-y-3">
                {productivity.dimensions.map((d) => (
                  <div key={d.label}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] font-medium text-default">{d.label}</span>
                      <span className="tabular text-[12.5px] text-muted">
                        {d.score} · weight {Math.round(d.weight * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={d.score}
                      tone={d.score > 75 ? 'success' : d.score > 50 ? 'warning' : 'danger'}
                      className="mt-1"
                    />
                    <p className="mt-0.5 text-[11.5px] text-subtle">{d.basis}</p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-5 border-t border-[hsl(var(--border))] pt-3 text-[12px] leading-relaxed text-subtle">
              {productivity.disclaimer}
            </p>
          </CardBody>
        </Card>
      </Section>

      {/* ---------------- Room utilisation ---------------- */}
      <Section title="Room utilisation">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Overall utilisation"
            value={`${rooms.overallUtilizationPercent}%`}
            icon={DoorOpen}
            tone={rooms.overallUtilizationPercent < 35 ? 'warning' : 'neutral'}
            sublabel={`${rooms.totalTeachingSlots} teaching periods per week`}
          />
          <Stat
            label="Under-used rooms"
            value={rooms.underusedRooms.length}
            tone={rooms.underusedRooms.length > 2 ? 'warning' : 'success'}
            sublabel="below 40% utilisation"
          />
          <Stat label="Rooms tracked" value={rooms.rooms.length} />
        </div>

        {rooms.consolidationHint ? (
          <Alert tone="warning" className="mb-3" icon={TrendingUp} title="Consolidation opportunity">
            {rooms.consolidationHint}
          </Alert>
        ) : null}

        <Card>
          <Table>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th>Type</Th>
                <Th align="right">Capacity</Th>
                <Th align="right">Periods used</Th>
                <Th>Utilisation</Th>
                <Th align="right">Avg spare seats</Th>
              </tr>
            </thead>
            <tbody>
              {rooms.rooms.map((r) => (
                <tr key={r.id} className="hover:bg-surface-sunken">
                  <Td><span className="font-medium text-default">{r.code}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{humanize(r.type)}</span></Td>
                  <Td align="right" className="tabular text-muted">{r.capacity}</Td>
                  <Td align="right" className="tabular">{r.occupiedSlots}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={r.utilizationPercent}
                        tone={
                          r.utilizationPercent > 75 ? 'success'
                            : r.utilizationPercent > 40 ? 'brand' : 'warning'
                        }
                        className="w-24"
                      />
                      <span className="tabular text-[12px] text-muted">{r.utilizationPercent}%</span>
                    </div>
                  </Td>
                  <Td align="right" className="tabular text-muted">{r.averageSpareSeats}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      {/* ---------------- Attendance ---------------- */}
      <Section title="Attendance">
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Stat
            label="Overall attendance"
            value={`${attendance.overallPercent}%`}
            icon={Users}
            tone={attendance.overallPercent < 75 ? 'warning' : 'success'}
          />
          <Stat
            label="Students below requirement"
            value={attendance.studentsBelowThreshold}
            tone={attendance.studentsBelowThreshold > 0 ? 'danger' : 'success'}
            sublabel={`of ${attendance.totalTrackedStudents} tracked`}
          />
          <Stat label="Subjects tracked" value={attendance.worstSubjects.length ? '—' : '0'} sublabel="lowest shown below" />
        </div>

        <Card>
          <CardHeader title="Lowest attendance by subject" />
          <CardBody className="space-y-3">
            {attendance.worstSubjects.map((s) => (
              <div key={s.subject}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-default">{s.subject}</span>
                  <span className="tabular text-[12.5px] text-muted">
                    {s.percent}% · {pluralize(s.belowCount, 'student')} at risk
                  </span>
                </div>
                <Progress
                  value={s.percent}
                  tone={s.percent < 70 ? 'danger' : s.percent < 80 ? 'warning' : 'success'}
                  className="mt-1"
                />
              </div>
            ))}
          </CardBody>
        </Card>
      </Section>

      {/* ---------------- Communication + cases ---------------- */}
      <Section title="Communication and cases">
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Communication reach" icon={Megaphone} />
            <CardBody className="space-y-3">
              <MetricRow label="Notices in 30 days" value={comms.publishedLast30Days} />
              <MetricRow label="Average read rate" value={`${comms.averageReadRate}%`} />
              <MetricRow label="Average acknowledgement" value={`${comms.averageAcknowledgementRate}%`} />
              <MetricRow
                label="Outstanding acknowledgements"
                value={comms.outstandingAcknowledgements}
                tone={comms.outstandingAcknowledgements > 0 ? 'warning' : 'success'}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Case resolution" icon={BarChart3} />
            <CardBody className="space-y-3">
              <MetricRow label="Open cases" value={grievance.open} />
              <MetricRow
                label="Past SLA"
                value={grievance.breached}
                tone={grievance.breached > 0 ? 'danger' : 'success'}
              />
              <MetricRow label="Resolved in 30 days" value={grievance.resolvedLast30Days} />
              <MetricRow
                label="Average resolution time"
                value={
                  grievance.averageResolutionHours !== null
                    ? `${grievance.averageResolutionHours} hrs`
                    : '—'
                }
              />
              {grievance.byCategory.length > 0 ? (
                <div className="border-t border-[hsl(var(--border))] pt-2.5">
                  {grievance.byCategory.map((c) => (
                    <div key={c.category} className="flex items-center justify-between py-0.5 text-[12.5px]">
                      <span className="text-muted">{c.category}</span>
                      <span className="tabular text-default">
                        {c.open} open{c.breached ? ` · ${c.breached} breached` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      </Section>

      {/* ---------------- Time saved ---------------- */}
      <Section title="Estimated time saved">
        <Card>
          <CardBody>
            <p className="text-2xl font-semibold tabular tracking-[-0.02em] text-default">
              {minutesToHuman(timeSaved.totalMinutes)}
            </p>
            <div className="mt-3 space-y-2">
              {timeSaved.byActivity.map((a) => (
                <div key={a.activity} className="flex items-center justify-between text-[13px]">
                  <span className="text-muted">
                    {humanize(a.activity)}{' '}
                    <span className="text-subtle">({pluralize(a.occurrences, 'time')})</span>
                  </span>
                  <span className="tabular font-medium text-default">
                    {minutesToHuman(a.minutes)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-4 border-t border-[hsl(var(--border))] pt-3 text-[12px] leading-relaxed text-subtle">
              {timeSaved.disclaimer}
            </p>
          </CardBody>
        </Card>
      </Section>
    </div>
  );
}

function MetricRow({
  label, value, tone = 'neutral',
}: {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success' ? 'text-success'
      : tone === 'warning' ? 'text-warning'
      : tone === 'danger' ? 'text-danger' : 'text-default';
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`tabular text-[14px] font-semibold ${color}`}>{value}</span>
    </div>
  );
}
