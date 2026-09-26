import { z } from 'zod';
import { ok, parseBody, withAuth } from '@/lib/api';
import { getMyCampusInterest, recordCampusInterest } from '@/services/campus-demand';

const Body = z.object({ name: z.string().min(3).max(160), city: z.string().max(80).nullish() });

/** "My college isn't on CampusOS yet." Counts only; nobody is contacted. */
export const POST = withAuth(null, async (request, { user }) => ok(await recordCampusInterest(user, await parseBody(request, Body))));
export const GET = withAuth(null, async (_request, { user }) => ok({ interest: await getMyCampusInterest(user) }));
