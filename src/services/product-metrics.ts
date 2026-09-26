import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ForbiddenError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isPlatformOperator } from '@/services/institutions';
import { ACTIVATION_EVENTS, FEATURE_EVENTS } from './product-events';

/**
 * Operator-only product metrics (CAMPUSOS-003). Every figure is a plain
 * count over product_events / product_active_days or the source tables —
 * no modelled or estimated numbers. Definitions live in docs/ANALYTICS.md
 * and are shown on the page next to each number.
 */

type Row = Record<string, unknown>;
async function rows<T extends Row>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}
/** Allowlisted event names only (letters and _), as a Postgres text[] literal. */
const textArray = (items: string[]) => `{${items.filter((i) => /^[a-z_]+$/.test(i)).join(',')}}`;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

export interface PlatformMetrics {
  windowDays: number;
  acquisition: { signups: number; joinRequests: number; verified: number; weeklySignups: { week: string; count: number }[] };
  activation: { cohort: number; activated: number; rate: number | null; medianHoursToFirstAction: number | null };
  engagement: { dau: number; wau: number; mau: number; wauStudents: number; activeStudentAccounts: number; wauPerStudent: number | null };
  institutional: {
    activeColleges: number;
    activeFaculty7d: number;
    activeStudents7d: number;
    noticesPublished: number;
    ackRequiredRecipients: number;
    ackReceived: number;
    ackRate: number | null;
    grievancesOpened: number;
    grievancesResolved: number;
    evidencePacks: number;
  };
  retention: { cohortSize: number; week1: number | null; week4: number | null; month1: number | null };
  adoption: { feature: string; actors: number; shareOfMau: number | null }[];
  byInstitution: { id: string; name: string; kind: string; activeStudents7d: number; activeStaff7d: number; notices: number; ackRate: number | null }[];
}

export async function getPlatformMetrics(ctx: AuthContext, windowDays = 30): Promise<PlatformMetrics> {
  if (!isPlatformOperator(ctx)) throw new ForbiddenError();
  const days = Math.min(Math.max(Math.round(windowDays), 7), 365);
  const since = sql`now() - make_interval(days => ${days})`;
  const activation = ACTIVATION_EVENTS as string[];

  const [acq] = await rows(sql`
    SELECT
      count(*) FILTER (WHERE event = 'student_signup') AS signups,
      count(*) FILTER (WHERE event = 'college_join_requested') AS join_requests,
      count(*) FILTER (WHERE event = 'college_verified') AS verified,
      count(*) FILTER (WHERE event = 'evidence_pack_generated') AS evidence
    FROM product_events WHERE created_at >= ${since}`);

  const weekly = await rows<{ week: string; count: string }>(sql`
    SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week, count(*) AS count
    FROM product_events
    WHERE event = 'student_signup' AND created_at >= now() - interval '8 weeks'
    GROUP BY 1 ORDER BY 1`);

  // Activation: signups old enough to have had 7 days, within the window.
  const [act] = await rows(sql`
    WITH cohort AS (
      SELECT actor_hash, min(created_at) AS signed_up
      FROM product_events
      WHERE event = 'student_signup'
        AND created_at >= ${since} - interval '7 days'
        AND created_at < now() - interval '7 days'
      GROUP BY actor_hash
    ), first_action AS (
      SELECT c.actor_hash, min(e.created_at) - c.signed_up AS delay
      FROM cohort c JOIN product_events e ON e.actor_hash = c.actor_hash
      WHERE e.event = ANY(${textArray(activation)}::text[]) AND e.created_at >= c.signed_up AND e.created_at < c.signed_up + interval '7 days'
      GROUP BY c.actor_hash, c.signed_up
    )
    SELECT (SELECT count(*) FROM cohort) AS cohort,
           (SELECT count(*) FROM first_action) AS activated,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM delay) / 3600) FROM first_action) AS median_hours`);

  const [eng] = await rows(sql`
    WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS d)
    SELECT
      count(DISTINCT actor_hash) FILTER (WHERE day = (SELECT d FROM today)) AS dau,
      count(DISTINCT actor_hash) FILTER (WHERE day > (SELECT d FROM today) - 7) AS wau,
      count(DISTINCT actor_hash) FILTER (WHERE day > (SELECT d FROM today) - 30) AS mau,
      count(DISTINCT actor_hash) FILTER (WHERE day > (SELECT d FROM today) - 7 AND role = 'STUDENT') AS wau_students,
      count(DISTINCT actor_hash) FILTER (WHERE day > (SELECT d FROM today) - 7 AND role IN ('FACULTY','HOD')) AS wau_faculty,
      count(DISTINCT institution_id) FILTER (
        WHERE day > (SELECT d FROM today) - 7
          AND institution_id IN (SELECT id FROM institutions WHERE kind = 'COLLEGE')
      ) AS active_colleges
    FROM product_active_days WHERE day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 30`);

  const [students] = await rows(sql`SELECT count(*) AS n FROM users WHERE role = 'STUDENT' AND status = 'ACTIVE' AND deleted_at IS NULL`);

  const [notices] = await rows(sql`
    SELECT count(*) AS published,
           coalesce(sum(recipient_count) FILTER (WHERE requires_acknowledgement), 0) AS ack_required,
           coalesce(sum(acknowledged_count) FILTER (WHERE requires_acknowledgement), 0) AS ack_received
    FROM announcements WHERE published_at >= ${since} AND deleted_at IS NULL`);

  const [griev] = await rows(sql`
    SELECT count(*) FILTER (WHERE created_at >= ${since}) AS opened,
           count(*) FILTER (WHERE resolved_at >= ${since}) AS resolved
    FROM grievances`);

  const [ret] = await rows(sql`
    WITH firsts AS (
      SELECT actor_hash, min(day) AS first_day FROM product_active_days GROUP BY actor_hash
    ), cohort AS (
      SELECT * FROM firsts WHERE first_day <= (now() AT TIME ZONE 'Asia/Kolkata')::date - 60
        AND first_day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 150
    )
    SELECT count(*) AS size,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_active_days a WHERE a.actor_hash = c.actor_hash AND a.day BETWEEN c.first_day + 7 AND c.first_day + 13)) AS w1,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_active_days a WHERE a.actor_hash = c.actor_hash AND a.day BETWEEN c.first_day + 28 AND c.first_day + 34)) AS w4,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_active_days a WHERE a.actor_hash = c.actor_hash AND a.day BETWEEN c.first_day + 30 AND c.first_day + 59)) AS m1
    FROM cohort c`);

  const mau = num(eng?.mau);
  const adoption: PlatformMetrics['adoption'] = [];
  for (const [feature, events] of Object.entries(FEATURE_EVENTS)) {
    const [r] = await rows(sql`
      SELECT count(DISTINCT actor_hash) AS n FROM product_events
      WHERE event = ANY(${textArray(events as string[])}::text[]) AND created_at >= now() - interval '30 days'`);
    adoption.push({ feature, actors: num(r?.n), shareOfMau: pct(num(r?.n), mau) });
  }

  const byInst = await rows(sql`
    SELECT i.id, i.name, i.kind,
      (SELECT count(DISTINCT actor_hash) FROM product_active_days a WHERE a.institution_id = i.id AND a.role = 'STUDENT' AND a.day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 7) AS students7,
      (SELECT count(DISTINCT actor_hash) FROM product_active_days a WHERE a.institution_id = i.id AND a.role <> 'STUDENT' AND a.day > (now() AT TIME ZONE 'Asia/Kolkata')::date - 7) AS staff7,
      (SELECT count(*) FROM announcements n WHERE n.institution_id = i.id AND n.published_at >= ${since} AND n.deleted_at IS NULL) AS notices,
      (SELECT coalesce(sum(recipient_count), 0) FROM announcements n WHERE n.institution_id = i.id AND n.requires_acknowledgement AND n.published_at >= ${since}) AS ack_req,
      (SELECT coalesce(sum(acknowledged_count), 0) FROM announcements n WHERE n.institution_id = i.id AND n.requires_acknowledgement AND n.published_at >= ${since}) AS ack_got
    FROM institutions i
    WHERE i.kind = 'COLLEGE' AND i.is_active
    ORDER BY i.name
    LIMIT 200`);

  const cohortSize = num(ret?.size);
  return {
    windowDays: days,
    acquisition: {
      signups: num(acq?.signups),
      joinRequests: num(acq?.join_requests),
      verified: num(acq?.verified),
      weeklySignups: weekly.map((w) => ({ week: w.week, count: num(w.count) })),
    },
    activation: {
      cohort: num(act?.cohort),
      activated: num(act?.activated),
      rate: pct(num(act?.activated), num(act?.cohort)),
      medianHoursToFirstAction: act?.median_hours === null || act?.median_hours === undefined ? null : Math.round(Number(act.median_hours) * 10) / 10,
    },
    engagement: {
      dau: num(eng?.dau),
      wau: num(eng?.wau),
      mau,
      wauStudents: num(eng?.wau_students),
      activeStudentAccounts: num(students?.n),
      wauPerStudent: pct(num(eng?.wau_students), num(students?.n)),
    },
    institutional: {
      activeColleges: num(eng?.active_colleges),
      activeFaculty7d: num(eng?.wau_faculty),
      activeStudents7d: num(eng?.wau_students),
      noticesPublished: num(notices?.published),
      ackRequiredRecipients: num(notices?.ack_required),
      ackReceived: num(notices?.ack_received),
      ackRate: pct(num(notices?.ack_received), num(notices?.ack_required)),
      grievancesOpened: num(griev?.opened),
      grievancesResolved: num(griev?.resolved),
      evidencePacks: num(acq?.evidence),
    },
    retention: {
      cohortSize,
      week1: pct(num(ret?.w1), cohortSize),
      week4: pct(num(ret?.w4), cohortSize),
      month1: pct(num(ret?.m1), cohortSize),
    },
    adoption,
    byInstitution: byInst.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      kind: String(r.kind),
      activeStudents7d: num(r.students7),
      activeStaff7d: num(r.staff7),
      notices: num(r.notices),
      ackRate: pct(num(r.ack_got), num(r.ack_req)),
    })),
  };
}
