import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { ForbiddenError, NotFoundError } from '@/lib/api';

/**
 * Ownership check for every faculty mutation that touches a class.
 *
 * Holding `attendance:mark` says you may mark attendance — it does not say
 * *whose* class. This is the second half of the authorisation decision and it
 * is applied on the server for every write, never inferred from the UI.
 */
export async function assertOfferingBelongsToFaculty(user: AuthContext, offeringId: string) {
  if (!user.facultyProfileId) {
    throw new ForbiddenError('Your account has no faculty record.');
  }

  const [offering] = await db
    .select({
      id: t.courseOfferings.id,
      termId: t.courseOfferings.termId,
      subjectId: t.courseOfferings.subjectId,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      sectionId: t.courseOfferings.sectionId,
      sectionCode: t.sections.code,
      minAttendancePercentage: t.courseOfferings.minAttendancePercentage,
      isActive: t.courseOfferings.isActive,
    })
    .from(t.courseOfferings)
    .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
    .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
    .where(
      and(
        eq(t.courseOfferings.id, offeringId),
        eq(t.courseOfferings.institutionId, user.institutionId),
        or(
          eq(t.courseOfferings.facultyId, user.facultyProfileId),
          eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId),
        ),
      ),
    )
    .limit(1);

  if (!offering) {
    throw new NotFoundError('That class, among the ones you teach,');
  }
  if (!offering.isActive) {
    throw new ForbiddenError('That class is no longer active.');
  }
  return offering;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * ATTENDANCE ROLLUP RULES — stated once, applied everywhere.
 *
 *   held      = sessions where the student has a PRESENT, ABSENT, LATE or
 *               MEDICAL record. EXCUSED is an authorised absence granted by
 *               the institution and is removed from the denominator entirely.
 *   attended  = PRESENT or LATE.
 *   headroom  = further absences the student can afford before dropping under
 *               the offering's own minimum (not a hard-coded 75%).
 *
 * Only registers in SUBMITTED or LOCKED state count. A draft register never
 * moves a student's percentage.
 */
export async function recomputeAttendanceSummaries(
  tx: Tx,
  params: {
    institutionId: string;
    offeringId: string;
    minAttendancePercentage: number;
    studentIds: string[];
  },
): Promise<void> {
  const { institutionId, offeringId, studentIds } = params;
  if (studentIds.length === 0) return;

  const minPct = Number.isFinite(params.minAttendancePercentage)
    ? Math.max(1, Math.min(100, params.minAttendancePercentage))
    : 75;
  const thresholdBp = Math.round(minPct * 100);

  await tx.execute(sql`
    WITH tally AS (
      SELECT
        r.student_id,
        COUNT(*) FILTER (WHERE r.status IN ('PRESENT','ABSENT','LATE','MEDICAL')) AS held,
        COUNT(*) FILTER (WHERE r.status IN ('PRESENT','LATE')) AS attended
      FROM attendance_records r
      JOIN attendance_sessions s ON s.id = r.session_id
      WHERE s.offering_id = ${offeringId}
        AND s.institution_id = ${institutionId}
        AND s.status IN ('SUBMITTED','LOCKED')
        AND r.student_id = ANY(${studentIds}::uuid[])
      GROUP BY r.student_id
    )
    INSERT INTO attendance_summaries (
      institution_id, student_id, offering_id,
      held_sessions, attended_sessions, percentage_bp,
      is_below_threshold, absence_headroom, recomputed_at
    )
    SELECT
      ${institutionId}::uuid,
      tally.student_id,
      ${offeringId}::uuid,
      tally.held,
      tally.attended,
      CASE WHEN tally.held = 0 THEN 0
           ELSE LEAST(10000, GREATEST(0, ROUND(tally.attended * 10000.0 / tally.held)::int))
      END,
      CASE WHEN tally.held = 0 THEN false
           ELSE ROUND(tally.attended * 10000.0 / tally.held)::int < ${thresholdBp}
      END,
      GREATEST(0, FLOOR(tally.attended * 100.0 / ${minPct})::int - tally.held),
      now()
    FROM tally
    ON CONFLICT (student_id, offering_id) DO UPDATE SET
      held_sessions = EXCLUDED.held_sessions,
      attended_sessions = EXCLUDED.attended_sessions,
      percentage_bp = EXCLUDED.percentage_bp,
      is_below_threshold = EXCLUDED.is_below_threshold,
      absence_headroom = EXCLUDED.absence_headroom,
      recomputed_at = EXCLUDED.recomputed_at
  `);

  // Keep the cached whole-course figure on the student profile consistent with
  // the summaries it is derived from.
  await tx.execute(sql`
    UPDATE student_profiles sp
    SET attendance_percentage = agg.pct
    FROM (
      SELECT student_id, ROUND(AVG(percentage_bp) / 100.0, 2) AS pct
      FROM attendance_summaries
      WHERE institution_id = ${institutionId}
        AND student_id = ANY(${studentIds}::uuid[])
      GROUP BY student_id
    ) agg
    WHERE sp.id = agg.student_id
      AND sp.institution_id = ${institutionId}
  `);
}
