import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { recordToolOpen } from '@/services/tools';
import { track } from '@/services/product-events';

const Body = z.object({ tool: z.string().min(1).max(64) });

/** Counts one open of a tool for the signed-in user (drives personal ordering). */
export const POST = withAuth(null, async (request, { user }) => {
  const { tool } = await parseBody(request, Body);
  const result = await recordToolOpen(user, tool);
  if (tool === 'attendance-planner') await track(user, 'attendance_planner_used', { surface: 'student' });
  return ok(result);
});
