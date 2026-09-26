import 'server-only';
import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { permissionsForRoles, ROLE_PERMISSIONS, type Role } from '@/lib/auth/permissions';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { getStorageProvider } from '@/services/storage/providers';
import type { FileReadResult } from '@/services/storage';

/**
 * VERIFIED MEMBERSHIP
 * ---------------------------------------------------------------------------
 * A student who signed up on their own asks a college to take them in:
 *
 *   request (placement + optional/required college ID)
 *     → college reviewers (user:approve_registration) look at it
 *     → APPROVED: the student's existing account moves into the college
 *       REJECTED: a reason category (+ short note); the student can resubmit
 *
 * Rules that make it safe:
 *  - The college is chosen by slug from the public list; placement is
 *    validated against *that* college; the role stays STUDENT.
 *  - Nothing is automatic. Signals (email domain, roll number free, ID
 *    attached) help the reviewer; they never approve anything.
 *  - One open request per student (partial unique index); decisions lock the
 *    request row, so two reviewers can't both approve it.
 *  - The college ID is a private file owned by the student. A reviewer reads
 *    it only through an open request addressed to their college, streamed or
 *    via a 5-minute signed URL, and every view is audited. It is never sent
 *    to an external service.
 */

export const REVIEW_PERMISSION = 'user:approve_registration' as const;
export const OPEN_STATUSES = ['PENDING', 'UNDER_REVIEW'] as const;
export const REQUEST_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const REJECTION_REASONS = {
  ID_UNCLEAR: 'The college ID wasn’t clear enough to read',
  ID_EXPIRED: 'The college ID has expired',
  INFO_MISMATCH: 'The details don’t match the college’s records',
  WRONG_INSTITUTION: 'This looks like a different institution',
  DUPLICATE: 'You already have an account or request at this college',
  NEEDS_MORE_INFO: 'The college needs a little more information',
  OTHER: 'The college couldn’t verify this request',
} as const;
export type RejectionReason = keyof typeof REJECTION_REASONS;

/** Requests nobody acted on for this long expire (the student can ask again). */
export const REQUEST_TTL_DAYS = 30;

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Where every tenant table stands when a personal student joins a college.
 * MOVE: the student's own records — they follow the student into the college.
 * KEEP: the personal workspace's structure, configuration and history, plus
 *       anything tied to that workspace's own catalogues or events. They stay
 *       with the (then archived) workspace. A test fails if a table is missing
 *       from both lists, so every new table gets a deliberate decision.
 */
export const TRANSFER_MOVE_TABLES = [
  'ai_actions', 'ai_conversations', 'ai_generations', 'ai_messages', 'ai_preferences',
  'auth_identities', 'consent_records', 'data_deletion_requests', 'data_export_requests',
  'notification_deliveries', 'notification_preferences', 'notifications',
  'opportunities', 'opportunity_tracking', 'privacy_preferences', 'push_subscriptions',
  'resource_saves', 'stored_files', 'student_certifications', 'time_saved_events', 'tool_usage',
  'tracker_checkins', 'tracker_goal_steps', 'tracker_goals', 'tracker_tasks',
  'user_achievements', 'xp_events',
] as const;
export const TRANSFER_KEEP_TABLES = [
  // handled explicitly
  'users', 'student_profiles', 'membership_requests',
  // history and credentials that belong to the workspace
  'audit_logs', 'auth_tokens', 'sessions', 'job_queue', 'import_jobs',
  // structure, configuration and catalogues of the workspace
  'academic_years', 'campuses', 'departments', 'programs', 'sections', 'subjects', 'terms', 'time_slots',
  'holidays', 'rooms', 'system_settings', 'notification_settings', 'data_retention_policies',
  'grievance_categories', 'skills', 'subject_skills', 'career_roles', 'career_role_skills',
  // records tied to the workspace's catalogues, events or teaching (none are
  // reachable in a personal workspace, or they belong to its own events)
  'career_goals', 'student_skills', 'skill_evidence', 'skill_gap_plans',
  'events', 'event_registrations', 'event_saves', 'event_checkins', 'event_certificates', 'event_updates', 'event_reports',
  'announcements', 'announcement_targets', 'announcement_recipients', 'announcement_comments', 'change_events', 'approvals',
  'assessments', 'assessment_allocations', 'assessment_results', 'assignments', 'submissions',
  'attendance_records', 'attendance_sessions', 'attendance_summaries',
  'course_offerings', 'enrollments', 'faculty_profiles', 'lesson_plans', 'leave_requests',
  'grievances', 'grievance_events', 'grievance_messages',
  'library_books', 'library_loans', 'library_reservations',
  'resources', 'resource_shares', 'resource_tags',
  'schedule_exceptions', 'timetable_entries', 'timetable_versions', 'workload_records', 'workload_summaries',
] as const;

/* ============================== helpers ================================== */

async function institutionKind(id: string) {
  const [row] = await db
    .select({ kind: t.institutions.kind, name: t.institutions.name })
    .from(t.institutions)
    .where(eq(t.institutions.id, id))
    .limit(1);
  return row ?? null;
}

/** Plain text only: no control characters, collapsed whitespace, 300 chars. */
export function sanitizeNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const clean = note
    // eslint-disable-next-line no-control-regex -- stripping control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return clean || null;
}

export function maskIdentifier(value: string): string {
  const v = value.trim();
  return v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
}

function reviewerRoles(): Role[] {
  return (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) => permissionsForRoles(r).has(REVIEW_PERMISSION));
}

function assertReviewer(ctx: AuthContext) {
  if (!ctx.permissions.has(REVIEW_PERMISSION)) throw new ForbiddenError();
}

/* ========================== student: discovery =========================== */

/** Colleges a student can ask to join: real, active, listed, and accepting requests. */
export async function searchJoinableInstitutions(query: string) {
  const q = query.trim().slice(0, 80);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db
    .select({
      slug: t.institutions.slug,
      name: t.institutions.name,
      shortName: t.institutions.shortName,
      city: t.institutions.city,
      state: t.institutions.state,
      idDocument: sql<string | null>`${t.institutions.registrationPolicy}->>'idDocument'`,
    })
    .from(t.institutions)
    .where(
      and(
        eq(t.institutions.kind, 'COLLEGE'),
        eq(t.institutions.isActive, true),
        eq(t.institutions.isListed, true),
        isNull(t.institutions.deletedAt),
        sql`${t.institutions.registrationPolicy}->>'mode' <> 'DISABLED'`,
        q ? or(ilike(t.institutions.name, like), ilike(t.institutions.shortName, like), ilike(t.institutions.city, like)) : undefined,
      ),
    )
    .orderBy(asc(t.institutions.name))
    .limit(20);
}

/* ========================== student: requests ============================ */

export interface MembershipRequestInput {
  institutionSlug: string;
  departmentId: string;
  programId: string;
  sectionId?: string | null;
  year: number;
  rollNumber: string;
  documentFileId?: string | null;
  meta: Meta;
}

export async function createMembershipRequest(ctx: AuthContext, input: MembershipRequestInput) {
  if (ctx.role !== 'STUDENT' || !ctx.studentProfileId) throw new ForbiddenError('Only students can ask to join a college.');
  const home = await institutionKind(ctx.institutionId);
  if (home?.kind !== 'PERSONAL') {
    throw new AppError('Your account already belongs to a college.', 409, 'ALREADY_MEMBER', undefined,
      'To move to another college, ask that college for an invitation.');
  }
  await enforceRateLimit(keyFor('membership:user', ctx.userId), { limit: 5, windowSec: 60 * 60 }, 'Too many join requests. Try again later.');

  const [inst] = await db
    .select({ id: t.institutions.id, name: t.institutions.name, policy: t.institutions.registrationPolicy })
    .from(t.institutions)
    .where(
      and(
        eq(t.institutions.slug, input.institutionSlug),
        eq(t.institutions.kind, 'COLLEGE'),
        eq(t.institutions.isActive, true),
        eq(t.institutions.isListed, true),
        isNull(t.institutions.deletedAt),
      ),
    )
    .limit(1);
  if (!inst || inst.policy.mode === 'DISABLED') {
    throw new AppError('This college isn’t accepting join requests on CampusOS.', 403, 'JOIN_CLOSED', undefined,
      'Ask the college office for an invitation instead.');
  }

  // Placement must be internally consistent and belong to THIS college.
  const [program] = await db
    .select({ id: t.programs.id, departmentId: t.programs.departmentId, duration: t.programs.durationYears })
    .from(t.programs)
    .where(and(eq(t.programs.id, input.programId), eq(t.programs.institutionId, inst.id), isNull(t.programs.deletedAt)))
    .limit(1);
  if (!program || program.departmentId !== input.departmentId) {
    throw new AppError('Choose a programme offered by the selected department.', 422, 'BAD_PROGRAM');
  }
  if (input.year < 1 || input.year > program.duration) {
    throw new AppError(`Year must be between 1 and ${program.duration} for this programme.`, 422, 'BAD_YEAR');
  }
  if (input.sectionId) {
    const [section] = await db
      .select({ id: t.sections.id })
      .from(t.sections)
      .where(and(eq(t.sections.id, input.sectionId), eq(t.sections.institutionId, inst.id), eq(t.sections.programId, program.id), isNull(t.sections.deletedAt)))
      .limit(1);
    if (!section) throw new AppError('That section does not belong to the selected programme.', 422, 'BAD_SECTION');
  }

  // The ID must be the student's own private upload.
  let documentMime: string | null = null;
  if (input.documentFileId) {
    const [file] = await db
      .select({ id: t.storedFiles.id, mimeType: t.storedFiles.mimeType, scan: t.storedFiles.scanStatus })
      .from(t.storedFiles)
      .where(
        and(
          eq(t.storedFiles.id, input.documentFileId),
          eq(t.storedFiles.institutionId, ctx.institutionId),
          eq(t.storedFiles.ownerId, ctx.userId),
          eq(t.storedFiles.purpose, 'VERIFICATION_ID'),
          isNull(t.storedFiles.deletedAt),
        ),
      )
      .limit(1);
    if (!file || file.scan === 'INFECTED') throw new AppError('Upload your college ID again.', 422, 'BAD_DOCUMENT');
    documentMime = file.mimeType;
  } else if (inst.policy.idDocument === 'REQUIRED') {
    throw new AppError(`${inst.name} needs a photo or scan of your college ID.`, 422, 'DOCUMENT_REQUIRED');
  }

  const rollNumber = input.rollNumber.trim().toUpperCase();
  const domain = ctx.email.split('@')[1]?.toLowerCase() ?? '';
  const domains = (inst.policy.allowedDomains ?? []).map((d) => d.toLowerCase().replace(/^@/, ''));
  const emailDomainMatch = domains.some((d) => domain === d || domain.endsWith(`.${d}`));
  const [[rollTaken], [emailTaken]] = await Promise.all([
    db
      .select({ id: t.studentProfiles.id })
      .from(t.studentProfiles)
      .where(and(eq(t.studentProfiles.institutionId, inst.id), eq(t.studentProfiles.rollNumber, rollNumber), isNull(t.studentProfiles.deletedAt)))
      .limit(1),
    db
      .select({ id: t.users.id, status: t.users.status })
      .from(t.users)
      .where(and(eq(t.users.institutionId, inst.id), eq(t.users.email, ctx.email), isNull(t.users.deletedAt)))
      .limit(1),
  ]);
  const signals = {
    emailDomainMatch,
    documentAttached: !!input.documentFileId,
    documentType: documentMime,
    rollNumberAlreadyRegistered: !!rollTaken,
    collegeAccountWithSameEmail: emailTaken ? emailTaken.status : null,
  };

  const [request] = await db
    .insert(t.membershipRequests)
    .values({
      institutionId: inst.id,
      fromInstitutionId: ctx.institutionId,
      userId: ctx.userId,
      departmentId: input.departmentId,
      programId: program.id,
      sectionId: input.sectionId ?? null,
      year: input.year,
      rollNumber,
      documentFileId: input.documentFileId ?? null,
      emailDomainMatch,
      signals,
    })
    .returning({ id: t.membershipRequests.id })
    .catch((error: unknown) => {
      const pg = pgErrorOf(error);
      if (pg.code === '23505' && pg.constraint === 'membership_requests_open_uq') {
        throw new ConflictError('You already have a request waiting for review.', undefined, 'Withdraw it first if you want to change it.');
      }
      throw error;
    });

  await recordAudit(ctx, { action: 'MEMBERSHIP_REQUESTED', entityType: 'membership_request', entityId: request!.id, after: { institution: inst.name }, ...input.meta });
  await recordAudit(
    null,
    { action: 'MEMBERSHIP_REQUESTED', entityType: 'membership_request', entityId: request!.id, after: { userId: ctx.userId, documentAttached: !!input.documentFileId } },
    inst.id,
  );
  await notifyReviewers(inst.id, request!.id, `${ctx.fullName} asked to join as a student`);
  return { id: request!.id, status: 'PENDING' as const, institutionName: inst.name };
}

async function notifyReviewers(institutionId: string, requestId: string, title: string) {
  const reviewers = await db
    .select({ id: t.users.id })
    .from(t.users)
    .where(and(eq(t.users.institutionId, institutionId), inArray(t.users.role, reviewerRoles()), eq(t.users.status, 'ACTIVE'), isNull(t.users.deletedAt)))
    .limit(50);
  if (reviewers.length === 0) return;
  await db.insert(t.notifications).values(
    reviewers.map((r) => ({
      institutionId,
      userId: r.id,
      title,
      body: 'Review their details and college ID, then approve or decline.',
      priority: 'NORMAL' as const,
      category: 'ADMINISTRATIVE' as const,
      actionUrl: '/admin/verifications',
      groupKey: 'membership:queue',
      sourceType: 'membership_request',
      sourceId: requestId,
    })),
  );
}

export async function withdrawMembershipRequest(ctx: AuthContext, requestId: string, meta: Meta) {
  const [row] = await db
    .update(t.membershipRequests)
    .set({ status: 'WITHDRAWN', updatedAt: new Date() })
    .where(and(eq(t.membershipRequests.id, requestId), eq(t.membershipRequests.userId, ctx.userId), inArray(t.membershipRequests.status, [...OPEN_STATUSES])))
    .returning({ id: t.membershipRequests.id, institutionId: t.membershipRequests.institutionId });
  if (!row) throw new NotFoundError('Request');
  await recordAudit(ctx, { action: 'MEMBERSHIP_WITHDRAWN', entityType: 'membership_request', entityId: row.id, ...meta });
  await recordAudit(null, { action: 'MEMBERSHIP_WITHDRAWN', entityType: 'membership_request', entityId: row.id }, row.institutionId);
}

/** What the student sees: their membership, or their latest request and its outcome. */
export async function getMyMembership(ctx: AuthContext) {
  const home = await institutionKind(ctx.institutionId);
  const [latest] = await db
    .select({
      id: t.membershipRequests.id,
      status: t.membershipRequests.status,
      institutionId: t.membershipRequests.institutionId,
      institutionName: t.institutions.name,
      institutionCity: t.institutions.city,
      programName: t.programs.name,
      year: t.membershipRequests.year,
      sectionName: t.sections.name,
      rollNumber: t.membershipRequests.rollNumber,
      decisionReason: t.membershipRequests.decisionReason,
      decisionNote: t.membershipRequests.decisionNote,
      createdAt: t.membershipRequests.createdAt,
      decidedAt: t.membershipRequests.decidedAt,
      hasDocument: sql<boolean>`${t.membershipRequests.documentFileId} IS NOT NULL`,
    })
    .from(t.membershipRequests)
    .innerJoin(t.institutions, eq(t.institutions.id, t.membershipRequests.institutionId))
    .leftJoin(t.programs, eq(t.programs.id, t.membershipRequests.programId))
    .leftJoin(t.sections, eq(t.sections.id, t.membershipRequests.sectionId))
    .where(eq(t.membershipRequests.userId, ctx.userId))
    .orderBy(desc(t.membershipRequests.createdAt))
    .limit(1);
  return {
    kind: home?.kind ?? 'COLLEGE',
    institutionName: home?.name ?? ctx.institutionName,
    /** Joined this college through an approved, reviewed request. */
    verified: !!latest && latest.status === 'APPROVED' && latest.institutionId === ctx.institutionId,
    request: latest
      ? {
          ...latest,
          rollNumberMasked: maskIdentifier(latest.rollNumber),
          rollNumber: undefined,
          reasonText: latest.decisionReason ? REJECTION_REASONS[latest.decisionReason as RejectionReason] ?? REJECTION_REASONS.OTHER : null,
        }
      : null,
  };
}

/* =============================== reviewers =============================== */

export async function listMembershipRequests(ctx: AuthContext, opts: { status?: RequestStatus | 'OPEN'; page?: number }) {
  assertReviewer(ctx);
  const pageSize = 20;
  const page = Math.max(1, Math.min(500, opts.page ?? 1));
  const status = opts.status ?? 'OPEN';
  const statusCond = status === 'OPEN' ? inArray(t.membershipRequests.status, [...OPEN_STATUSES]) : eq(t.membershipRequests.status, status);
  const where = and(eq(t.membershipRequests.institutionId, ctx.institutionId), statusCond);
  const [rows, [total], counts] = await Promise.all([
    db
      .select({
        id: t.membershipRequests.id,
        status: t.membershipRequests.status,
        firstName: t.users.firstName,
        lastName: t.users.lastName,
        email: t.users.email,
        departmentName: t.departments.name,
        programName: t.programs.name,
        sectionName: t.sections.name,
        year: t.membershipRequests.year,
        rollNumber: t.membershipRequests.rollNumber,
        hasDocument: sql<boolean>`${t.membershipRequests.documentFileId} IS NOT NULL`,
        signals: t.membershipRequests.signals,
        decisionReason: t.membershipRequests.decisionReason,
        decisionNote: t.membershipRequests.decisionNote,
        createdAt: t.membershipRequests.createdAt,
        decidedAt: t.membershipRequests.decidedAt,
      })
      .from(t.membershipRequests)
      .innerJoin(t.users, eq(t.users.id, t.membershipRequests.userId))
      .leftJoin(t.departments, eq(t.departments.id, t.membershipRequests.departmentId))
      .leftJoin(t.programs, eq(t.programs.id, t.membershipRequests.programId))
      .leftJoin(t.sections, eq(t.sections.id, t.membershipRequests.sectionId))
      .where(where)
      .orderBy(status === 'OPEN' ? asc(t.membershipRequests.createdAt) : desc(t.membershipRequests.updatedAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(t.membershipRequests).where(where),
    db
      .select({ status: t.membershipRequests.status, n: count() })
      .from(t.membershipRequests)
      .where(eq(t.membershipRequests.institutionId, ctx.institutionId))
      .groupBy(t.membershipRequests.status),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Partial<Record<RequestStatus, number>>;
  return { rows, total: Number(total?.n ?? 0), page, pageSize, counts: byStatus };
}

export async function countOpenMembershipRequests(institutionId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(t.membershipRequests)
    .where(and(eq(t.membershipRequests.institutionId, institutionId), inArray(t.membershipRequests.status, [...OPEN_STATUSES])));
  return Number(r?.n ?? 0);
}

export async function startReview(ctx: AuthContext, requestId: string, meta: Meta) {
  assertReviewer(ctx);
  const [row] = await db
    .update(t.membershipRequests)
    .set({ status: 'UNDER_REVIEW', reviewStartedById: ctx.userId, updatedAt: new Date() })
    .where(and(eq(t.membershipRequests.id, requestId), eq(t.membershipRequests.institutionId, ctx.institutionId), eq(t.membershipRequests.status, 'PENDING')))
    .returning({ id: t.membershipRequests.id });
  if (row) await recordAudit(ctx, { action: 'MEMBERSHIP_REVIEW_STARTED', entityType: 'membership_request', entityId: row.id, ...meta });
  return { started: !!row };
}

export type Decision =
  | { decision: 'APPROVE' }
  | { decision: 'REJECT'; reason: RejectionReason; note?: string | null };

export async function decideMembershipRequest(ctx: AuthContext, requestId: string, input: Decision, meta: Meta) {
  assertReviewer(ctx);
  const note = input.decision === 'REJECT' ? sanitizeNote(input.note) : null;

  const outcome = await db.transaction(async (tx) => {
    // Lock the request: a second reviewer waits here and then sees it decided.
    const locked = await tx.execute<{ id: string; status: string; user_id: string; from_institution_id: string }>(sql`
      SELECT id, status, user_id, from_institution_id FROM membership_requests
      WHERE id = ${requestId} AND institution_id = ${ctx.institutionId}
      FOR UPDATE
    `);
    const req = locked.rows[0];
    if (!req) throw new NotFoundError('Request');
    if (!(OPEN_STATUSES as readonly string[]).includes(req.status)) {
      throw new ConflictError(`This request was already ${req.status.toLowerCase().replace('_', ' ')}.`);
    }
    if (req.user_id === ctx.userId) throw new ForbiddenError('You can’t decide your own request.');

    if (input.decision === 'REJECT') {
      await tx
        .update(t.membershipRequests)
        .set({ status: 'REJECTED', decidedById: ctx.userId, decidedAt: new Date(), decisionReason: input.reason, decisionNote: note, updatedAt: new Date() })
        .where(eq(t.membershipRequests.id, requestId));
      return { userId: req.user_id, fromInstitutionId: req.from_institution_id, approved: false };
    }

    await transferStudent(tx, { requestId, userId: req.user_id, personalId: req.from_institution_id, collegeId: ctx.institutionId });
    await tx
      .update(t.membershipRequests)
      .set({ status: 'APPROVED', decidedById: ctx.userId, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(t.membershipRequests.id, requestId));
    return { userId: req.user_id, fromInstitutionId: req.from_institution_id, approved: true };
  });

  const action = outcome.approved ? 'MEMBERSHIP_APPROVED' : 'MEMBERSHIP_REJECTED';
  await recordAudit(ctx, {
    action,
    entityType: 'membership_request',
    entityId: requestId,
    after: outcome.approved ? { userId: outcome.userId } : { userId: outcome.userId, reason: (input as { reason: string }).reason },
    ...meta,
  });
  await recordAudit(null, { action, entityType: 'membership_request', entityId: requestId }, outcome.fromInstitutionId);

  // The student hears about it in whichever workspace they now live in.
  await db.insert(t.notifications).values({
    institutionId: outcome.approved ? ctx.institutionId : outcome.fromInstitutionId,
    userId: outcome.userId,
    title: outcome.approved ? `You’re verified at ${ctx.institutionName}` : 'Your college verification needs attention',
    body: outcome.approved
      ? 'Sign in again to open your college’s CampusOS. Your tracker, progress and saved items came with you.'
      : `${REJECTION_REASONS[(input as { reason: RejectionReason }).reason] ?? REJECTION_REASONS.OTHER}. You can correct it and send it again.`,
    priority: 'IMPORTANT',
    category: 'ADMINISTRATIVE',
    actionUrl: '/student/join',
    groupKey: 'membership',
    sourceType: 'membership_request',
    sourceId: requestId,
  });
  return { status: outcome.approved ? 'APPROVED' : 'REJECTED' };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Moves the student's existing account from their personal workspace into the
 * college, in the caller's transaction. Same user id, same password, same
 * history; open sessions end (they are bound to the old workspace).
 */
async function transferStudent(tx: Tx, p: { requestId: string; userId: string; personalId: string; collegeId: string }) {
  const [req] = await tx.select().from(t.membershipRequests).where(eq(t.membershipRequests.id, p.requestId)).limit(1);
  const [user] = await tx
    .select({ id: t.users.id, email: t.users.email, role: t.users.role, institutionId: t.users.institutionId })
    .from(t.users)
    .where(eq(t.users.id, p.userId))
    .for('update')
    .limit(1);
  const personal = await tx.select({ kind: t.institutions.kind }).from(t.institutions).where(eq(t.institutions.id, p.personalId)).limit(1);
  if (!req || !user || user.institutionId !== p.personalId || user.role !== 'STUDENT' || personal[0]?.kind !== 'PERSONAL') {
    throw new ConflictError('This student’s account changed since they asked. Ask them to send a new request.');
  }
  // Placement must still exist at the college.
  const [program] = await tx
    .select({ id: t.programs.id, departmentId: t.programs.departmentId })
    .from(t.programs)
    .where(and(eq(t.programs.id, req.programId ?? ''), eq(t.programs.institutionId, p.collegeId), isNull(t.programs.deletedAt)))
    .limit(1);
  if (!program) throw new AppError('The programme on this request no longer exists. Decline it with “Needs more info”.', 422, 'BAD_PROGRAM');

  // One account per person per college.
  const [clash] = await tx
    .select({ id: t.users.id, status: t.users.status })
    .from(t.users)
    .where(and(eq(t.users.institutionId, p.collegeId), eq(t.users.email, user.email), ne(t.users.id, user.id)))
    .limit(1);
  if (clash) {
    throw new ConflictError(
      clash.status === 'INVITED'
        ? 'This student already has an invitation from your college.'
        : 'An account with this email already exists at your college.',
      undefined,
      clash.status === 'INVITED' ? 'Withdraw that invitation first, or ask the student to use it.' : 'Decline this request as a duplicate.',
    );
  }

  for (const table of TRANSFER_MOVE_TABLES) {
    await tx.execute(sql`UPDATE ${sql.identifier(table)} SET institution_id = ${p.collegeId} WHERE institution_id = ${p.personalId}`);
  }
  // Registrations for other colleges' events carry the attendee's college.
  await tx.execute(sql`UPDATE event_registrations SET attendee_institution_id = ${p.collegeId} WHERE user_id = ${p.userId} AND attendee_institution_id = ${p.personalId}`);

  const semester = req.year * 2 - 1;
  await tx
    .update(t.studentProfiles)
    .set({
      institutionId: p.collegeId,
      programId: program.id,
      sectionId: req.sectionId,
      rollNumber: req.rollNumber,
      currentYear: req.year,
      currentSemester: semester,
      updatedAt: new Date(),
    })
    .where(eq(t.studentProfiles.userId, p.userId))
    .catch((error: unknown) => {
      const pg = pgErrorOf(error);
      if (pg.code === '23505' && pg.constraint === 'student_profiles_roll_uq') {
        throw new ConflictError('Another student at your college already has this roll number.', undefined, 'Decline it as a mismatch or duplicate.');
      }
      throw error;
    });
  await tx
    .update(t.users)
    .set({
      institutionId: p.collegeId,
      departmentId: program.departmentId,
      sessionEpoch: sql`${t.users.sessionEpoch} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(t.users.id, p.userId));
  // The personal workspace is kept (history, audit) but closed.
  await tx.update(t.institutions).set({ isActive: false, updatedAt: new Date() }).where(and(eq(t.institutions.id, p.personalId), eq(t.institutions.kind, 'PERSONAL')));
  // Any other open request by this student is now moot.
  await tx
    .update(t.membershipRequests)
    .set({ status: 'WITHDRAWN', updatedAt: new Date() })
    .where(and(eq(t.membershipRequests.userId, p.userId), ne(t.membershipRequests.id, p.requestId), inArray(t.membershipRequests.status, [...OPEN_STATUSES])));
}

/* ============================ college ID reads =========================== */

/**
 * The student's own ID, or — for reviewers of the college it was sent to —
 * the ID on an open request. Every reviewer view is audited (without the URL).
 */
export async function readVerificationDocument(ctx: AuthContext, requestId: string): Promise<FileReadResult> {
  const [req] = await db
    .select({ id: t.membershipRequests.id, userId: t.membershipRequests.userId, institutionId: t.membershipRequests.institutionId, status: t.membershipRequests.status, fileId: t.membershipRequests.documentFileId })
    .from(t.membershipRequests)
    .where(eq(t.membershipRequests.id, requestId))
    .limit(1);
  const own = !!req && req.userId === ctx.userId;
  const reviewer =
    !!req &&
    req.institutionId === ctx.institutionId &&
    ctx.permissions.has(REVIEW_PERMISSION) &&
    (OPEN_STATUSES as readonly string[]).includes(req.status);
  // One answer for "no such request", "not yours" and "no document".
  if (!req || !req.fileId || (!own && !reviewer)) throw new NotFoundError('Document');

  const [file] = await db
    .select()
    .from(t.storedFiles)
    .where(and(eq(t.storedFiles.id, req.fileId), eq(t.storedFiles.ownerId, req.userId), eq(t.storedFiles.purpose, 'VERIFICATION_ID'), isNull(t.storedFiles.deletedAt)))
    .limit(1);
  if (!file || file.scanStatus === 'INFECTED') throw new NotFoundError('Document');
  const provider = getStorageProvider();
  if (!provider || provider.name !== file.provider) {
    throw new AppError('This document is stored with a provider that is not configured on this server.', 503, 'STORAGE_UNAVAILABLE');
  }
  if (reviewer && !own) {
    await recordAudit(ctx, { action: 'VERIFICATION_DOCUMENT_VIEWED', entityType: 'membership_request', entityId: req.id });
  }
  if (provider.signedUrl) {
    return { kind: 'redirect', url: await provider.signedUrl(file.storageKey, { expiresSec: 300, downloadName: file.originalName }) };
  }
  return { kind: 'bytes', bytes: await provider.read!(file.storageKey), mimeType: file.mimeType, name: file.originalName };
}

/* ================================= jobs ================================== */

/** Requests nobody has decided within REQUEST_TTL_DAYS expire; the student can ask again. */
export async function expireStaleMembershipRequests(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REQUEST_TTL_DAYS * 86_400_000);
  const rows = await db
    .update(t.membershipRequests)
    .set({ status: 'EXPIRED', updatedAt: now })
    .where(and(inArray(t.membershipRequests.status, [...OPEN_STATUSES]), lt(t.membershipRequests.createdAt, cutoff)))
    .returning({ id: t.membershipRequests.id });
  return rows.length;
}
