import { and, eq, or } from 'drizzle-orm';
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

// The rollup moved to the attendance service so faculty marking, corrections
// and the admin "apply minimum" action share one implementation.
export { recomputeAttendanceSummaries } from '@/services/attendance/rollup';
