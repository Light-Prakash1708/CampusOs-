import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { uuidArray } from '@/lib/db/sql-helpers';

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
        AND r.student_id = ANY(${uuidArray(studentIds)})
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
        AND student_id = ANY(${uuidArray(studentIds)})
      GROUP BY student_id
    ) agg
    WHERE sp.id = agg.student_id
      AND sp.institution_id = ${institutionId}
  `);
}
