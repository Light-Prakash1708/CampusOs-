import { z } from 'zod';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, fail, AppError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth/context';
import { runEscalationSweep } from '@/services/grievance';
import { planPendingNotifications, processDeliveryQueue } from '@/services/notifications/dispatcher';
import { sweepRateLimits } from '@/services/rate-limit';
import { sweepExpiredTokens } from '@/services/auth/tokens';
import { timingSafeEqual } from 'node:crypto';

/**
 * SCHEDULED JOB RUNNER
 * ---------------------------------------------------------------------------
 * Deliberately DB-backed and pull-based rather than depending on an external
 * broker: a college's IT team can drive it from ordinary cron with a single
 * curl, and it degrades to "nothing happened" rather than failing loudly.
 *
 *   curl -X POST https://campusos.example.edu/api/jobs/run \
 *        -H "x-cron-secret: $CRON_SECRET"
 *
 * Authorisation: either a valid CRON_SECRET header, or an authenticated
 * administrator (so it can be triggered manually from the UI).
 */

const TENANT_JOBS = ['escalate_grievances', 'publish_scheduled', 'expire_announcements'] as const;
/** Platform-wide jobs. Only the scheduler (CRON_SECRET) may run them. */
const GLOBAL_JOBS = ['plan_notifications', 'deliver_notifications', 'sweep'] as const;

const Body = z.object({
  jobs: z.array(z.enum([...TENANT_JOBS, ...GLOBAL_JOBS])).optional(),
});

function secretMatches(provided: string | null, secret: string | undefined): boolean {
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = request.headers.get('x-cron-secret');
    const authorisedByCron = secretMatches(provided, secret);

    let institutionIds: string[] = [];
    let actor = null;

    if (authorisedByCron) {
      // Cron runs across every active tenant.
      const rows = await db
        .select({ id: t.institutions.id })
        .from(t.institutions)
        .where(eq(t.institutions.isActive, true));
      institutionIds = rows.map((r) => r.id);
    } else {
      actor = await getCurrentUser();
      if (!actor || !actor.permissions.has('institution:view_settings')) {
        throw new AppError(
          'This endpoint requires the scheduler secret or an administrator session.',
          401,
          'UNAUTHENTICATED',
        );
      }
      institutionIds = [actor.institutionId];
    }

    const body = await request.json().catch(() => ({}));
    const { jobs } = Body.parse(body);
    const selected: string[] = jobs ?? (authorisedByCron ? [...TENANT_JOBS, ...GLOBAL_JOBS] : [...TENANT_JOBS]);

    const results: Record<string, unknown> = {};

    for (const institutionId of institutionIds) {
      const perTenant: Record<string, unknown> = {};

      if (selected.includes('escalate_grievances')) {
        perTenant.escalation = await runEscalationSweep(institutionId);
      }

      if (selected.includes('publish_scheduled')) {
        // Scheduled notices whose publish time has arrived.
        const due = await db
          .update(t.announcements)
          .set({ status: 'PUBLISHED', publishedAt: new Date() })
          .where(
            and(
              eq(t.announcements.institutionId, institutionId),
              eq(t.announcements.status, 'SCHEDULED'),
              lt(t.announcements.publishAt, new Date()),
            ),
          )
          .returning({ id: t.announcements.id });
        perTenant.published = due.length;
      }

      if (selected.includes('expire_announcements')) {
        const expired = await db
          .update(t.announcements)
          .set({ status: 'EXPIRED' })
          .where(
            and(
              eq(t.announcements.institutionId, institutionId),
              eq(t.announcements.status, 'PUBLISHED'),
              lt(t.announcements.expiresAt, new Date()),
            ),
          )
          .returning({ id: t.announcements.id });
        perTenant.expired = expired.length;
      }

      results[institutionId] = perTenant;
    }

    const platform: Record<string, unknown> = {};
    if (authorisedByCron) {
      if (selected.includes('plan_notifications')) platform.planned = await planPendingNotifications();
      if (selected.includes('deliver_notifications')) platform.delivered = await processDeliveryQueue();
      if (selected.includes('sweep')) {
        platform.sweep = { rateLimitBuckets: await sweepRateLimits(), authTokens: await sweepExpiredTokens() };
      }
    }

    return ok({ ranAt: new Date().toISOString(), tenants: institutionIds.length, results, platform });
  } catch (error) {
    return fail(error, request.headers.get('x-request-id'));
  }
}
