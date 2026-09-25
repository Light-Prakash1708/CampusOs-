import { z } from 'zod';
import { withAuth, ok, parseBody } from '@/lib/api';
import { checkSlotConflicts } from '@/services/timetable/conflicts';

const Body = z.object({
  versionId: z.string().uuid(),
  timeSlotId: z.string().uuid(),
  sectionId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  facultyId: z.string().uuid().nullable().optional(),
  excludeEntryId: z.string().uuid().nullable().optional(),
  requiredRoomType: z.string().max(40).nullable().optional(),
});

/**
 * Dry-run conflict check. The editor calls this BEFORE committing a move, so
 * the admin sees the clash, who it affects, and workable alternatives instead
 * of a failed save.
 */
export const POST = withAuth('timetable:view_all', async (request, { user }) => {
  const input = await parseBody(request, Body);
  const result = await checkSlotConflicts({
    institutionId: user.institutionId,
    versionId: input.versionId,
    timeSlotId: input.timeSlotId,
    sectionId: input.sectionId,
    roomId: input.roomId ?? null,
    facultyId: input.facultyId ?? null,
    excludeEntryId: input.excludeEntryId ?? null,
    requiredRoomType: input.requiredRoomType ?? null,
  });
  return ok(result);
});
