import 'server-only';
import { cache } from 'react';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { getEnrolledOfferings } from './student';

/**
 * Coursework reads: assignments the student has actually been set, and exams
 * that actually apply to them. Both are scoped through `enrollments`, never
 * through "everything in the institution".
 */

export interface StudentAssignment {
  id: string;
  title: string;
  instructions: string | null;
  subjectCode: string;
  subjectName: string;
  facultyName: string | null;
  maxScore: string;
  weightPercentage: string | null;
  dueAt: Date | null;
  originalDueAt: Date | null;
  allowLateSubmission: boolean;
  attachmentCount: number;
  submission: {
    status: string;
    submittedAt: Date | null;
    score: string | null;
    feedback: string | null;
    evaluatedAt: Date | null;
    attemptNumber: number;
  } | null;
  /** Derived bucket used by the assignments page and the dashboard. */
  bucket: 'OVERDUE' | 'DUE_SOON' | 'SUBMITTED' | 'EVALUATED';
}

const SUBMITTED_STATES = ['SUBMITTED', 'LATE', 'RESUBMITTED', 'RETURNED'];

export const getStudentAssignments = cache(
  async (institutionId: string, studentId: string): Promise<StudentAssignment[]> => {
    const offerings = await getEnrolledOfferings(institutionId, studentId);
    if (offerings.length === 0) return [];
    const offeringIds = offerings.map((o) => o.offeringId);
    const byOffering = new Map(offerings.map((o) => [o.offeringId, o]));

    const rows = await db
      .select({
        id: t.assignments.id,
        offeringId: t.assignments.offeringId,
        title: t.assignments.title,
        instructions: t.assignments.instructions,
        maxScore: t.assignments.maxScore,
        weightPercentage: t.assignments.weightPercentage,
        dueAt: t.assignments.dueAt,
        originalDueAt: t.assignments.originalDueAt,
        allowLateSubmission: t.assignments.allowLateSubmission,
        attachments: t.assignments.attachments,
        subStatus: t.submissions.status,
        submittedAt: t.submissions.submittedAt,
        score: t.submissions.score,
        feedback: t.submissions.feedback,
        evaluatedAt: t.submissions.evaluatedAt,
        attemptNumber: t.submissions.attemptNumber,
      })
      .from(t.assignments)
      .leftJoin(
        t.submissions,
        and(
          eq(t.submissions.assignmentId, t.assignments.id),
          eq(t.submissions.studentId, studentId),
        ),
      )
      .where(
        and(
          eq(t.assignments.institutionId, institutionId),
          inArray(t.assignments.offeringId, offeringIds),
          inArray(t.assignments.status, ['PUBLISHED', 'CLOSED']),
          isNull(t.assignments.deletedAt),
        ),
      )
      .orderBy(asc(t.assignments.dueAt), desc(t.submissions.attemptNumber));

    const now = Date.now();
    const seen = new Set<string>();
    const result: StudentAssignment[] = [];

    for (const row of rows) {
      // The join can return one row per attempt; the ORDER BY puts the latest
      // attempt first, so the first row wins.
      if (seen.has(row.id)) continue;
      seen.add(row.id);

      const offering = byOffering.get(row.offeringId);
      const submission = row.subStatus
        ? {
            status: row.subStatus,
            submittedAt: row.submittedAt,
            score: row.score,
            feedback: row.feedback,
            evaluatedAt: row.evaluatedAt,
            attemptNumber: row.attemptNumber ?? 1,
          }
        : null;

      const isEvaluated = submission?.status === 'EVALUATED' && submission.score !== null;
      const isSubmitted = !!submission && SUBMITTED_STATES.includes(submission.status);
      const isOverdue = !isSubmitted && !isEvaluated && !!row.dueAt && row.dueAt.getTime() < now;

      result.push({
        id: row.id,
        title: row.title,
        instructions: row.instructions,
        subjectCode: offering?.code ?? '—',
        subjectName: offering?.name ?? '—',
        facultyName: offering?.facultyName ?? null,
        maxScore: row.maxScore,
        weightPercentage: row.weightPercentage,
        dueAt: row.dueAt,
        originalDueAt: row.originalDueAt,
        allowLateSubmission: row.allowLateSubmission,
        attachmentCount: (row.attachments ?? []).length,
        submission,
        bucket: isEvaluated
          ? 'EVALUATED'
          : isSubmitted
            ? 'SUBMITTED'
            : isOverdue
              ? 'OVERDUE'
              : 'DUE_SOON',
      });
    }

    return result;
  },
);

export interface StudentAssessment {
  id: string;
  title: string;
  kind: string;
  subjectCode: string | null;
  subjectName: string | null;
  date: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  durationMinutes: number | null;
  maxScore: string;
  instructions: string | null;
  roomCode: string | null;
  roomBuilding: string | null;
  result: {
    score: string | null;
    grade: string | null;
    isAbsent: boolean;
    remarks: string | null;
    publishedAt: Date;
  } | null;
}

/**
 * Exams for this student: either attached to an offering they are enrolled in,
 * or a subject-wide paper for a subject they study. Only PUBLISHED assessment
 * schedules are visible — a draft exam date is not a commitment.
 * Results appear only once `published_at` is set.
 */
export const getStudentAssessments = cache(
  async (
    institutionId: string,
    studentId: string,
    sectionId: string | null,
    termId: string | null,
  ): Promise<StudentAssessment[]> => {
    const offerings = await getEnrolledOfferings(institutionId, studentId);
    if (offerings.length === 0 || !termId) return [];

    const offeringIds = offerings.map((o) => o.offeringId);
    const subjectIds = offerings.map((o) => o.subjectId);

    const rows = await db
      .select({
        id: t.assessments.id,
        title: t.assessments.title,
        kind: t.assessments.kind,
        subjectCode: t.subjects.code,
        subjectName: t.subjects.name,
        date: t.assessments.date,
        startsAt: t.assessments.startsAt,
        endsAt: t.assessments.endsAt,
        durationMinutes: t.assessments.durationMinutes,
        maxScore: t.assessments.maxScore,
        instructions: t.assessments.instructions,
        score: t.assessmentResults.score,
        grade: t.assessmentResults.grade,
        isAbsent: t.assessmentResults.isAbsent,
        remarks: t.assessmentResults.remarks,
        publishedAt: t.assessmentResults.publishedAt,
      })
      .from(t.assessments)
      .leftJoin(t.subjects, eq(t.subjects.id, t.assessments.subjectId))
      .leftJoin(
        t.assessmentResults,
        and(
          eq(t.assessmentResults.assessmentId, t.assessments.id),
          eq(t.assessmentResults.studentId, studentId),
        ),
      )
      .where(
        and(
          eq(t.assessments.institutionId, institutionId),
          eq(t.assessments.termId, termId),
          eq(t.assessments.status, 'PUBLISHED'),
          isNull(t.assessments.deletedAt),
          or(
            inArray(t.assessments.offeringId, offeringIds),
            and(
              isNull(t.assessments.offeringId),
              inArray(t.assessments.subjectId, subjectIds),
            ),
          ),
        ),
      )
      .orderBy(asc(t.assessments.date), asc(t.assessments.startsAt));

    if (rows.length === 0) return [];

    // Seat allocation for this student's section, when the exam cell has done it.
    const allocations = sectionId
      ? await db
          .select({
            assessmentId: t.assessmentAllocations.assessmentId,
            roomCode: t.rooms.code,
            roomBuilding: t.rooms.building,
          })
          .from(t.assessmentAllocations)
          .leftJoin(t.rooms, eq(t.rooms.id, t.assessmentAllocations.roomId))
          .where(
            and(
              eq(t.assessmentAllocations.institutionId, institutionId),
              eq(t.assessmentAllocations.sectionId, sectionId),
              inArray(
                t.assessmentAllocations.assessmentId,
                rows.map((r) => r.id),
              ),
            ),
          )
      : [];

    const byAssessment = new Map(allocations.map((a) => [a.assessmentId, a]));

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      subjectCode: r.subjectCode,
      subjectName: r.subjectName,
      date: r.date,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      durationMinutes: r.durationMinutes,
      maxScore: r.maxScore,
      instructions: r.instructions,
      roomCode: byAssessment.get(r.id)?.roomCode ?? null,
      roomBuilding: byAssessment.get(r.id)?.roomBuilding ?? null,
      result: r.publishedAt
        ? {
            score: r.score,
            grade: r.grade,
            isAbsent: r.isAbsent ?? false,
            remarks: r.remarks,
            publishedAt: r.publishedAt,
          }
        : null,
    }));
  },
);
