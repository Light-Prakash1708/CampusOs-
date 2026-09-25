import { and, asc, eq, isNull } from 'drizzle-orm';
import { DoorOpen } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { Badge, Card, CardHeader, EmptyState, PageHeader, Progress, Table, Td, Th } from '@/components/ui';
import { humanize } from '@/lib/utils';
import { computeRoomUtilization } from '@/services/analytics';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rooms & labs · CampusOS' };

export default async function RoomsPage() {
  const user = await requirePermission('room:view');

  const [rows, utilisation] = await Promise.all([
    db
      .select({
        id: t.rooms.id,
        code: t.rooms.code,
        name: t.rooms.name,
        type: t.rooms.type,
        capacity: t.rooms.capacity,
        building: t.rooms.building,
        floor: t.rooms.floor,
        facilities: t.rooms.facilities,
        isBookable: t.rooms.isBookable,
        unavailableReason: t.rooms.unavailableReason,
      })
      .from(t.rooms)
      .where(and(eq(t.rooms.institutionId, user.institutionId), isNull(t.rooms.deletedAt)))
      .orderBy(asc(t.rooms.code)),
    computeRoomUtilization(user.institutionId),
  ]);

  const usageByRoom = new Map(utilisation.rooms.map((r) => [r.id, r.utilizationPercent]));

  return (
    <div>
      <PageHeader
        title="Rooms and laboratories"
        description={`${rows.length} spaces · ${utilisation.overallUtilizationPercent}% overall utilisation`}
      />

      <Card>
        <CardHeader title="All spaces" />
        {rows.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No rooms recorded"
            description="Import your room list from the Data Import Centre, or add rooms individually."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Room</Th>
                <Th>Type</Th>
                <Th>Location</Th>
                <Th align="right">Capacity</Th>
                <Th>Utilisation</Th>
                <Th>Facilities</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const usage = usageByRoom.get(r.id) ?? 0;
                return (
                  <tr key={r.id} className="hover:bg-surface-sunken">
                    <Td>
                      <span className="font-medium text-default">{r.code}</span>
                      {!r.isBookable ? (
                        <Badge tone="danger" className="ml-2">Not bookable</Badge>
                      ) : null}
                      {r.unavailableReason ? (
                        <span className="block pt-0.5 text-[11.5px] text-warning">
                          {r.unavailableReason}
                        </span>
                      ) : null}
                    </Td>
                    <Td><Badge tone={r.type === 'LAB' ? 'info' : 'neutral'}>{humanize(r.type)}</Badge></Td>
                    <Td>
                      <span className="text-[12.5px] text-muted">
                        {[r.building, r.floor ? `Floor ${r.floor}` : null].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </Td>
                    <Td align="right" className="tabular">{r.capacity}</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={usage}
                          tone={usage > 75 ? 'success' : usage > 40 ? 'brand' : 'warning'}
                          className="w-20"
                        />
                        <span className="tabular text-[12px] text-muted">{usage}%</span>
                      </div>
                    </Td>
                    <Td>
                      <span className="text-[11.5px] text-subtle">
                        {(r.facilities ?? []).length ? (r.facilities as string[]).join(', ') : '—'}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
