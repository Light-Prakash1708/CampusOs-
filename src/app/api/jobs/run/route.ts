import { z } from 'zod';
import { and, eq, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { ok, fail, AppError } from '@/lib/api';
import { getCurrentUser } from '@/lib/auth/context';
import { runEscalationSweep } from '@/services/grievance';

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

const Body = z.object({
  jobs: z.array(z.enum(['escalate_grievances', 'publish_scheduled', 'expire_announcements'])).optional(),
});

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = request.headers.get('x-cron-secret');
    const authorisedByCron = !!secret && provided === secret;

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
    const selected = jobs ?? ['escalate_grievances', 'publish_scheduled', 'expire_announcements'];

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

    return ok({ ranAt: new Date().toISOString(), tenants: institutionIds.length, results });
  } catch (error) {
    return fail(error);
  }
}
