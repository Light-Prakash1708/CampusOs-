import 'server-only';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';

/**
 * SGRC & OMBUDSPERSON (CAMPUSOS-011)
 * ---------------------------------------------------------------------------
 * Supports the structure described in the UGC (Redressal of Grievances of
 * Students) Regulations, 2023 — a Students' Grievance Redressal Committee
 * (a professor as chair, four senior faculty, a student special invitee) and
 * an Ombudsperson for appeals. CampusOS *supports* this workflow; it does not
 * certify anyone's compliance.
 *
 * The regulations also ask for at least one woman and one SC/ST/OBC member.
 * CampusOS never records anyone's gender or social category for this: the
 * college confirms those rules itself (an audited attestation).
 */

export const UGC_TIMELINES = {
  sgrcWorkingDays: 15,
  appealWindowDays: 15,
  ombudspersonDays: 30,
} as const;

export type CommitteeBody = 'SGRC' | 'OMBUDSPERSON';
export type CommitteePosition = 'CHAIR' | 'MEMBER' | 'STUDENT_INVITEE' | 'OMBUDSPERSON';

const ATTESTATION_KEY = 'sgrc_composition_attestation';

type Meta = { ipAddress: string | null; userAgent: string | null };

function assertConfigure(ctx: AuthContext) {
  if (!ctx.permissions.has('grievance:configure')) throw new ForbiddenError();
}

/**
 * `start` + N working days, skipping Sundays and the college's holidays.
 * An approximation of "working days" — each college's calendar is the
 * authority, which is why holidays come from its own list.
 */
export async function addWorkingDays(institutionId: string, start: Date, days: number): Promise<Date> {
  const horizon = new Date(start.getTime() + (days * 2 + 30) * 86_400_000);
  const holidays = await db
    .select({ date: t.holidays.date, half: t.holidays.isHalfDay })
    .from(t.holidays)
    .where(and(eq(t.holidays.institutionId, institutionId), gte(t.holidays.date, start.toISOString().slice(0, 10)), lte(t.holidays.date, horizon.toISOString().slice(0, 10))));
  const closed = new Set(holidays.filter((h) => !h.half).map((h) => h.date));
  const d = new Date(start);
  let left = days;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10); // IST calendar day
    const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || closed.has(iso)) continue;
    left -= 1;
  }
  return d;
}

export async function listCommittee(ctx: AuthContext) {
  if (!ctx.permissions.has('grievance:configure') && !ctx.permissions.has('grievance:view_all')) throw new ForbiddenError();
  return db
    .select({
      id: t.grievanceCommitteeMembers.id,
      userId: t.grievanceCommitteeMembers.userId,
      body: t.grievanceCommitteeMembers.body,
      position: t.grievanceCommitteeMembers.position,
      termEndsOn: t.grievanceCommitteeMembers.termEndsOn,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
      role: t.users.role,
      email: t.users.email,
    })
    .from(t.grievanceCommitteeMembers)
    .innerJoin(t.users, eq(t.users.id, t.grievanceCommitteeMembers.userId))
    .where(eq(t.grievanceCommitteeMembers.institutionId, ctx.institutionId))
    .orderBy(asc(t.grievanceCommitteeMembers.body), asc(t.grievanceCommitteeMembers.position), asc(t.users.firstName));
}

const POSITIONS: Record<CommitteeBody, CommitteePosition[]> = {
  SGRC: ['CHAIR', 'MEMBER', 'STUDENT_INVITEE'],
  OMBUDSPERSON: ['OMBUDSPERSON'],
};

export async function addCommitteeMember(
  ctx: AuthContext,
  input: { userId: string; body: CommitteeBody; position: CommitteePosition; termEndsOn?: string | null },
  meta: Meta,
) {
  assertConfigure(ctx);
  if (!POSITIONS[input.body]?.includes(input.position)) {
    throw new AppError('That position does not belong to that body.', 422, 'BAD_POSITION');
  }
  const [user] = await db
    .select({ id: t.users.id, role: t.users.role, status: t.users.status })
    .from(t.users)
    .where(and(eq(t.users.id, input.userId), eq(t.users.institutionId, ctx.institutionId)))
    .limit(1);
  if (!user) throw new NotFoundError('Person');
  if (user.status !== 'ACTIVE' && user.status !== 'INVITED') throw new AppError('That account is not active.', 422, 'INACTIVE_USER');
  if (input.position === 'STUDENT_INVITEE' && user.role !== 'STUDENT') {
    throw new AppError('The special invitee must be a student.', 422, 'NOT_A_STUDENT');
  }
  if ((input.position === 'CHAIR' || input.position === 'MEMBER') && user.role === 'STUDENT') {
    throw new AppError('The chair and members are faculty.', 422, 'NOT_FACULTY');
  }
  if (input.position === 'CHAIR') {
    const [chair] = await db
      .select({ id: t.grievanceCommitteeMembers.id })
      .from(t.grievanceCommitteeMembers)
      .where(and(eq(t.grievanceCommitteeMembers.institutionId, ctx.institutionId), eq(t.grievanceCommitteeMembers.position, 'CHAIR')))
      .limit(1);
    if (chair) throw new AppError('The committee already has a chair. Remove them first.', 409, 'CHAIR_EXISTS');
  }
  const [row] = await db
    .insert(t.grievanceCommitteeMembers)
    .values({ institutionId: ctx.institutionId, userId: user.id, body: input.body, position: input.position, termEndsOn: input.termEndsOn ?? null, createdById: ctx.userId })
    .onConflictDoUpdate({
      target: [t.grievanceCommitteeMembers.institutionId, t.grievanceCommitteeMembers.userId, t.grievanceCommitteeMembers.body],
      set: { position: input.position, termEndsOn: input.termEndsOn ?? null },
    })
    .returning({ id: t.grievanceCommitteeMembers.id });
  await recordAudit(ctx, { action: 'GRIEVANCE_COMMITTEE_UPDATED', entityType: 'grievance_committee', entityId: row!.id, after: { userId: user.id, body: input.body, position: input.position }, ...meta });
  return { id: row!.id };
}

export async function removeCommitteeMember(ctx: AuthContext, memberId: string, meta: Meta) {
  assertConfigure(ctx);
  const removed = await db
    .delete(t.grievanceCommitteeMembers)
    .where(and(eq(t.grievanceCommitteeMembers.id, memberId), eq(t.grievanceCommitteeMembers.institutionId, ctx.institutionId)))
    .returning({ id: t.grievanceCommitteeMembers.id, userId: t.grievanceCommitteeMembers.userId });
  if (!removed.length) throw new NotFoundError('Committee member');
  await recordAudit(ctx, { action: 'GRIEVANCE_COMMITTEE_UPDATED', entityType: 'grievance_committee', entityId: memberId, before: { userId: removed[0]!.userId }, after: { removed: true }, ...meta });
}

export async function attestComposition(ctx: AuthContext, meta: Meta) {
  assertConfigure(ctx);
  const value = { attestedAt: new Date().toISOString(), attestedById: ctx.userId };
  await db
    .insert(t.systemSettings)
    .values({ institutionId: ctx.institutionId, key: ATTESTATION_KEY, value, updatedById: ctx.userId, description: 'College confirmed the SGRC composition rules it must follow (gender and category representation).' })
    .onConflictDoUpdate({ target: [t.systemSettings.institutionId, t.systemSettings.key], set: { value, updatedById: ctx.userId, updatedAt: new Date() } });
  await recordAudit(ctx, { action: 'GRIEVANCE_COMMITTEE_UPDATED', entityType: 'grievance_committee', entityId: ctx.institutionId, after: { attested: true }, ...meta });
}

export interface CommitteeCheck {
  key: string;
  label: string;
  done: boolean;
}

/** A checklist, not a compliance verdict. */
export async function committeeStatus(ctx: AuthContext): Promise<{ checks: CommitteeCheck[]; attestedAt: string | null }> {
  const members = await listCommittee(ctx);
  const [attestation] = await db
    .select({ value: t.systemSettings.value })
    .from(t.systemSettings)
    .where(and(eq(t.systemSettings.institutionId, ctx.institutionId), eq(t.systemSettings.key, ATTESTATION_KEY)))
    .limit(1);
  const count = (p: CommitteePosition) => members.filter((m) => m.position === p).length;
  const attestedAt = (attestation?.value as { attestedAt?: string } | undefined)?.attestedAt ?? null;
  return {
    attestedAt,
    checks: [
      { key: 'chair', label: 'A chairperson (a professor)', done: count('CHAIR') === 1 },
      { key: 'members', label: 'Four senior faculty members', done: count('MEMBER') >= 4 },
      { key: 'invitee', label: 'A student special invitee', done: count('STUDENT_INVITEE') >= 1 },
      { key: 'ombudsperson', label: 'An Ombudsperson for appeals', done: count('OMBUDSPERSON') >= 1 },
      { key: 'attested', label: 'Representation rules confirmed by the college (at least one woman; at least one SC/ST/OBC member)', done: !!attestedAt },
    ],
  };
}

export async function isOmbudsperson(ctx: Pick<AuthContext, 'userId' | 'institutionId'>): Promise<boolean> {
  const [row] = await db
    .select({ id: t.grievanceCommitteeMembers.id })
    .from(t.grievanceCommitteeMembers)
    .where(and(eq(t.grievanceCommitteeMembers.institutionId, ctx.institutionId), eq(t.grievanceCommitteeMembers.userId, ctx.userId), eq(t.grievanceCommitteeMembers.body, 'OMBUDSPERSON')))
    .limit(1);
  return !!row;
}

export async function ombudspersonIds(institutionId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: t.grievanceCommitteeMembers.userId })
    .from(t.grievanceCommitteeMembers)
    .where(and(eq(t.grievanceCommitteeMembers.institutionId, institutionId), eq(t.grievanceCommitteeMembers.body, 'OMBUDSPERSON')));
  return rows.map((r) => r.userId);
}

/** Resolves a student in this college by roll number (for the special invitee). */
export async function studentByRollNumber(institutionId: string, rollNumber: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: t.studentProfiles.userId })
    .from(t.studentProfiles)
    .where(and(eq(t.studentProfiles.institutionId, institutionId), eq(t.studentProfiles.rollNumber, rollNumber.trim())))
    .limit(1);
  return row?.userId ?? null;
}
