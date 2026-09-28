import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { NotFoundError } from '@/lib/api';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { assertPlatformOperator } from '@/services/institutions';

/**
 * "REGISTER YOUR COLLEGE"
 * ---------------------------------------------------------------------------
 * A public request, not a sign-up. Submitting one creates no account, role or
 * tenant — a college is set up only by a platform operator through the
 * existing onboarding (admin/institutions), after checking the request is
 * genuine. The first administrator is then invited by email, as before.
 */

export const COLLEGE_REQUEST_STATUSES = ['NEW', 'CONTACTED', 'SET_UP', 'DECLINED'] as const;
export type CollegeRequestStatus = (typeof COLLEGE_REQUEST_STATUSES)[number];

export interface CollegeRequestInput {
  collegeName: string;
  university?: string | null;
  city: string;
  website?: string | null;
  contactName: string;
  contactEmail: string;
  contactRole: string;
  studentCount?: number | null;
  message?: string | null;
}

export async function submitCollegeRequest(input: CollegeRequestInput, meta: { ipAddress: string | null }) {
  await enforceRateLimit(keyFor('college-request:ip', meta.ipAddress), { limit: 5, windowSec: 60 * 60 }, 'Too many requests. Try again later.');
  const [row] = await db
    .insert(t.collegeRequests)
    .values({
      collegeName: input.collegeName,
      university: input.university || null,
      city: input.city,
      website: input.website || null,
      contactName: input.contactName,
      contactEmail: input.contactEmail.toLowerCase(),
      contactRole: input.contactRole,
      studentCount: input.studentCount ?? null,
      message: input.message || null,
    })
    .returning({ id: t.collegeRequests.id });
  // Nothing else: no email to the requester (the address is unverified) and
  // nothing that could be read back publicly.
  return { received: true, id: row!.id };
}

/** Operators only: the queue of requests, newest first, open ones on top. */
export async function listCollegeRequests(ctx: AuthContext) {
  assertPlatformOperator(ctx);
  return db
    .select()
    .from(t.collegeRequests)
    .orderBy(sql`CASE WHEN ${t.collegeRequests.status} IN ('NEW', 'CONTACTED') THEN 0 ELSE 1 END`, desc(t.collegeRequests.createdAt))
    .limit(100);
}

export async function setCollegeRequestStatus(ctx: AuthContext, id: string, status: CollegeRequestStatus) {
  assertPlatformOperator(ctx);
  const [row] = await db
    .update(t.collegeRequests)
    .set({ status, updatedAt: new Date() })
    .where(eq(t.collegeRequests.id, id))
    .returning({ id: t.collegeRequests.id, status: t.collegeRequests.status });
  if (!row) throw new NotFoundError('College request');
  return row;
}
