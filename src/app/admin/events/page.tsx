import { and, asc, eq, gte, isNull } from 'drizzle-orm';
import { CalendarDays } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Table, Td, Th } from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Events · CampusOS' };

export default async function EventsPage() {
  const user = await requireAuth();

  const rows = await db
    .select({
      id: t.events.id,
      title: t.events.title,
      startsAt: t.events.startsAt,
      endsAt: t.events.endsAt,
      status: t.events.status,
      capacity: t.events.capacity,
      speaker: t.events.speaker,
      blocksClasses: t.events.blocksClasses,
      roomCode: t.rooms.code,
      departmentCode: t.departments.code,
      organiserFirst: t.users.firstName,
      organiserLast: t.users.lastName,
    })
    .from(t.events)
    .leftJoin(t.rooms, eq(t.rooms.id, t.events.roomId))
    .leftJoin(t.departments, eq(t.departments.id, t.events.departmentId))
    .leftJoin(t.users, eq(t.users.id, t.events.organizerId))
    .where(and(eq(t.events.institutionId, user.institutionId), isNull(t.events.deletedAt)))
    .orderBy(asc(t.events.startsAt));

  return (
    <div>
      <PageHeader
        title="Events"
        description="Institutional events. Room bookings are conflict-checked against the timetable."
      />
      <Card>
        <CardHeader title="Scheduled events" />
        {rows.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No events scheduled" description="Seminars, workshops and institutional events appear here." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Event</Th>
                <Th>When</Th>
                <Th>Venue</Th>
                <Th>Organiser</Th>
                <Th align="right">Capacity</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="text-[13.5px] font-medium text-default">{e.title}</span>
                    {e.speaker ? (
                      <span className="block text-[11.5px] text-subtle">{e.speaker}</span>
                    ) : null}
                    {e.blocksClasses ? (
                      <Badge tone="warning" className="mt-1">Blocks classes</Badge>
                    ) : null}
                  </Td>
                  <Td><span className="text-[12.5px] text-muted">{formatDateTime(e.startsAt)}</span></Td>
                  <Td><span className="text-[12.5px] text-muted">{e.roomCode ? `Room ${e.roomCode}` : '—'}</span></Td>
                  <Td>
                    <span className="text-[12.5px] text-muted">
                      {e.organiserFirst ? `${e.organiserFirst} ${e.organiserLast ?? ''}`.trim() : '—'}
                      {e.departmentCode ? ` · ${e.departmentCode}` : ''}
                    </span>
                  </Td>
                  <Td align="right" className="tabular text-muted">{e.capacity ?? '—'}</Td>
                  <Td><Badge tone={e.status === 'SCHEDULED' ? 'success' : 'neutral'}>{humanize(e.status)}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
