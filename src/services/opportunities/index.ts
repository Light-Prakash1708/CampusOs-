import 'server-only';
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, keyFor } from '@/services/rate-limit';
import { getFeedProvider, type OpportunityFeedProvider } from './providers';

/**
 * OPPORTUNITIES — Career Mode
 * ---------------------------------------------------------------------------
 * Listings come from three real sources only: the college (published at
 * once), students (wait for a moderator), and a configured feed (imported as
 * pending). Students see PUBLISHED items for their college (and their own
 * department where targeted), with an honest skill match against their own
 * skill profile, and keep a private application tracker.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };

export const OPPORTUNITY_KINDS = ['INTERNSHIP', 'JOB', 'HACKATHON', 'COMPETITION', 'SCHOLARSHIP', 'FELLOWSHIP'] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];
export const KIND_LABEL: Record<OpportunityKind, string> = {
  INTERNSHIP: 'Internship',
  JOB: 'Job',
  HACKATHON: 'Hackathon',
  COMPETITION: 'Competition',
  SCHOLARSHIP: 'Scholarship',
  FELLOWSHIP: 'Fellowship',
};
export const TRACK_STATUSES = ['SAVED', 'APPLIED', 'INTERVIEWING', 'OFFER', 'REJECTED', 'WITHDRAWN'] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];

export function requireOpportunities(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'opportunity_hub_enabled')) throw new AppError('Opportunities are not switched on at your college.', 404, 'FEATURE_DISABLED');
}

const likeEscape = (s: string) => `%${s.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
const norm = (s: string) => s.trim().toLowerCase();

/** What a student may see: published, their college, whole-college or their department. */
function visibleToStudent(ctx: AuthContext): SQL {
  return and(
    eq(t.opportunities.institutionId, ctx.institutionId),
    eq(t.opportunities.status, 'PUBLISHED'),
    ctx.departmentId ? or(isNull(t.opportunities.departmentId), eq(t.opportunities.departmentId, ctx.departmentId))! : isNull(t.opportunities.departmentId),
  )!;
}

/** The student's own skills (proficiency ≥ 40), lowercased, for matching. */
async function mySkillNames(ctx: AuthContext): Promise<Set<string>> {
  if (!ctx.studentProfileId || !isEnabled(ctx.featureFlags, 'skill_engine_enabled')) return new Set();
  const rows = await db
    .select({ name: t.skills.name, slug: t.skills.slug })
    .from(t.studentSkills)
    .innerJoin(t.skills, eq(t.skills.id, t.studentSkills.skillId))
    .where(and(eq(t.studentSkills.studentId, ctx.studentProfileId), gte(t.studentSkills.proficiency, 40)));
  return new Set(rows.flatMap((r) => [norm(r.name), norm(r.slug)]));
}

export function skillMatch(listed: string[], mine: Set<string>): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const s of listed) (mine.has(norm(s)) ? matched : missing).push(s);
  return { matched, missing };
}

/* ------------------------------- read models ------------------------------ */

export async function listForStudent(ctx: AuthContext, filters: { kind?: string; q?: string; tracked?: boolean; limit?: number } = {}) {
  requireOpportunities(ctx);
  const conds: SQL[] = [visibleToStudent(ctx)];
  if (filters.kind && (OPPORTUNITY_KINDS as readonly string[]).includes(filters.kind)) conds.push(eq(t.opportunities.kind, filters.kind));
  const q = filters.q?.trim();
  if (q) conds.push(or(ilike(t.opportunities.title, likeEscape(q)), ilike(t.opportunities.organization, likeEscape(q)), sql`${t.opportunities.skills}::text ILIKE ${likeEscape(q)}`)!);
  if (filters.tracked) conds.push(sql`${t.opportunityTracking.id} IS NOT NULL`);
  // Closed-for-applications items drop out of discovery, but stay in "My applications".
  else conds.push(or(isNull(t.opportunities.deadline), gte(t.opportunities.deadline, new Date()))!);

  const rows = await db
    .select({ o: t.opportunities, track: t.opportunityTracking.status, trackNote: t.opportunityTracking.note, appliedAt: t.opportunityTracking.appliedAt })
    .from(t.opportunities)
    .leftJoin(t.opportunityTracking, and(eq(t.opportunityTracking.opportunityId, t.opportunities.id), eq(t.opportunityTracking.userId, ctx.userId)))
    .where(and(...conds))
    .orderBy(sql`${t.opportunities.deadline} ASC NULLS LAST`, desc(t.opportunities.createdAt))
    .limit(Math.min(filters.limit ?? 60, 200));
  const mine = await mySkillNames(ctx);
  return rows.map(({ o, track, trackNote, appliedAt }) => ({
    id: o.id,
    kind: o.kind as OpportunityKind,
    title: o.title,
    organization: o.organization,
    description: o.description,
    location: o.location,
    workMode: o.workMode,
    compensation: o.compensation,
    applyUrl: o.applyUrl,
    deadline: o.deadline,
    eligibility: o.eligibility,
    skills: o.skills,
    source: o.source,
    match: skillMatch(o.skills, mine),
    track: (track as TrackStatus | null) ?? null,
    trackNote,
    appliedAt,
  }));
}

/** For Your Day: saved or in-progress applications whose deadline is within two days. */
export async function applicationDeadlinesSoon(ctx: AuthContext) {
  if (!isEnabled(ctx.featureFlags, 'opportunity_hub_enabled')) return [];
  return db
    .select({ id: t.opportunities.id, title: t.opportunities.title, organization: t.opportunities.organization, deadline: t.opportunities.deadline })
    .from(t.opportunityTracking)
    .innerJoin(t.opportunities, eq(t.opportunities.id, t.opportunityTracking.opportunityId))
    .where(
      and(
        eq(t.opportunityTracking.userId, ctx.userId),
        eq(t.opportunityTracking.status, 'SAVED'),
        eq(t.opportunities.status, 'PUBLISHED'),
        sql`${t.opportunities.deadline} > now() AND ${t.opportunities.deadline} < now() + interval '2 days'`,
      ),
    )
    .orderBy(asc(t.opportunities.deadline))
    .limit(5);
}

/* ------------------------------- submissions ------------------------------ */

export interface OpportunityInput {
  kind: OpportunityKind;
  title: string;
  organization: string;
  description?: string | null;
  location?: string | null;
  workMode: 'ONSITE' | 'REMOTE' | 'HYBRID';
  compensation?: string | null;
  applyUrl?: string | null;
  deadline?: Date | null;
  eligibility?: string | null;
  skills?: string[];
  departmentId?: string | null;
}

/**
 * Staff with opportunity:manage publish at once as the college. Students'
 * submissions wait for a moderator — so nothing unverified reaches others.
 */
export async function submitOpportunity(ctx: AuthContext, input: OpportunityInput, meta: Meta) {
  requireOpportunities(ctx);
  const staff = ctx.permissions.has('opportunity:manage');
  if (!staff && !ctx.permissions.has('opportunity:submit')) throw new ForbiddenError();
  await enforceRateLimit(keyFor('opportunity:submit', ctx.userId), { limit: staff ? 200 : 10, windowSec: 86_400 }, 'You’ve submitted a lot today. Try again tomorrow.');
  if (input.deadline && input.deadline.getTime() < Date.now()) throw new AppError('The deadline has already passed.', 422, 'BAD_DEADLINE');
  if (input.departmentId) {
    const [d] = await db.select({ id: t.departments.id }).from(t.departments).where(and(eq(t.departments.id, input.departmentId), eq(t.departments.institutionId, ctx.institutionId)));
    if (!d) throw new AppError('That department was not found.', 422, 'BAD_DEPARTMENT');
  }
  const skills = [...new Map((input.skills ?? []).map((s) => [norm(s), s.trim()])).values()].filter(Boolean).slice(0, 20);
  const [row] = await db
    .insert(t.opportunities)
    .values({
      institutionId: ctx.institutionId,
      kind: input.kind,
      title: input.title.trim(),
      organization: input.organization.trim(),
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      workMode: input.workMode,
      compensation: input.compensation?.trim() || null,
      applyUrl: input.applyUrl?.trim() || null,
      deadline: input.deadline ?? null,
      eligibility: input.eligibility?.trim() || null,
      skills,
      departmentId: input.departmentId ?? null,
      status: staff ? 'PUBLISHED' : 'PENDING',
      source: staff ? 'COLLEGE' : 'STUDENT',
      submittedById: ctx.userId,
      ...(staff ? { reviewedById: ctx.userId, reviewedAt: new Date() } : {}),
    })
    .returning({ id: t.opportunities.id, status: t.opportunities.status });
  await recordAudit(ctx, { action: 'OPPORTUNITY_CREATED', entityType: 'opportunity', entityId: row!.id, after: { status: row!.status, kind: input.kind }, ...meta });
  return row!;
}

export async function moderateOpportunity(ctx: AuthContext, id: string, input: { action: 'APPROVE' | 'REJECT' | 'CLOSE'; note?: string | null }, meta: Meta) {
  requireOpportunities(ctx);
  if (!ctx.permissions.has('opportunity:manage')) throw new ForbiddenError();
  const [o] = await db.select().from(t.opportunities).where(and(eq(t.opportunities.id, id), eq(t.opportunities.institutionId, ctx.institutionId))).limit(1);
  if (!o) throw new NotFoundError('Opportunity');
  const allowed = { APPROVE: ['PENDING'], REJECT: ['PENDING'], CLOSE: ['PUBLISHED'] }[input.action];
  if (!allowed.includes(o.status)) throw new ConflictError(`This listing is ${o.status.toLowerCase()}.`);
  if (input.action === 'REJECT' && (input.note ?? '').trim().length < 5) throw new AppError('Say why, so the submitter can fix it.', 422, 'REASON_REQUIRED');
  const status = { APPROVE: 'PUBLISHED', REJECT: 'REJECTED', CLOSE: 'CLOSED' }[input.action];
  await db
    .update(t.opportunities)
    .set({ status, reviewedById: ctx.userId, reviewedAt: new Date(), reviewNote: input.note?.trim() || null, updatedAt: new Date() })
    .where(eq(t.opportunities.id, o.id));
  if (o.source === 'STUDENT' && o.submittedById && input.action !== 'CLOSE') {
    await db.insert(t.notifications).values({
      institutionId: ctx.institutionId,
      userId: o.submittedById,
      title: input.action === 'APPROVE' ? `Published: ${o.title}` : `Not published: ${o.title}`,
      body: input.action === 'REJECT' ? input.note?.trim() : 'Thanks — other students can now see it.',
      priority: 'NORMAL',
      category: 'PLACEMENT',
      actionUrl: '/student/opportunities',
      sourceType: 'opportunity',
      sourceId: o.id,
    });
  }
  await recordAudit(ctx, { action: 'OPPORTUNITY_MODERATED', entityType: 'opportunity', entityId: o.id, before: { status: o.status }, after: { status, note: input.note ?? null }, ...meta });
  return { id: o.id, status };
}

export async function trackOpportunity(ctx: AuthContext, id: string, input: { status: TrackStatus | 'NONE'; note?: string | null }) {
  requireOpportunities(ctx);
  await enforceRateLimit(keyFor('opportunity:track', ctx.userId), { limit: 300, windowSec: 3600 }, 'Too many changes. Try again shortly.');
  const [o] = await db.select({ id: t.opportunities.id, status: t.opportunities.status }).from(t.opportunities).where(and(eq(t.opportunities.id, id), visibleToStudentOrClosed(ctx))).limit(1);
  if (!o) throw new NotFoundError('Opportunity');
  if (input.status === 'NONE') {
    await db.delete(t.opportunityTracking).where(and(eq(t.opportunityTracking.userId, ctx.userId), eq(t.opportunityTracking.opportunityId, id)));
    return { status: null };
  }
  const now = new Date();
  await db
    .insert(t.opportunityTracking)
    .values({ institutionId: ctx.institutionId, userId: ctx.userId, opportunityId: id, status: input.status, note: input.note?.trim() || null, appliedAt: input.status === 'SAVED' ? null : now })
    .onConflictDoUpdate({
      target: [t.opportunityTracking.userId, t.opportunityTracking.opportunityId],
      set: {
        status: input.status,
        ...(input.note !== undefined ? { note: input.note?.trim() || null } : {}),
        appliedAt: input.status === 'SAVED' ? null : sql`coalesce(${t.opportunityTracking.appliedAt}, ${now})`,
        updatedAt: now,
      },
    });
  return { status: input.status };
}

/** Tracking works on published and (already-tracked) closed items the student could see. */
function visibleToStudentOrClosed(ctx: AuthContext): SQL {
  return and(
    eq(t.opportunities.institutionId, ctx.institutionId),
    inArray(t.opportunities.status, ['PUBLISHED', 'CLOSED']),
    ctx.departmentId ? or(isNull(t.opportunities.departmentId), eq(t.opportunities.departmentId, ctx.departmentId))! : isNull(t.opportunities.departmentId),
  )!;
}

/* ---------------------------------- admin --------------------------------- */

export async function adminOpportunities(ctx: AuthContext, status: 'PENDING' | 'PUBLISHED' | 'CLOSED' | 'REJECTED' = 'PENDING') {
  requireOpportunities(ctx);
  if (!ctx.permissions.has('opportunity:manage')) throw new ForbiddenError();
  const [rows, counts] = await Promise.all([
    db
      .select({ o: t.opportunities, first: t.users.firstName, last: t.users.lastName })
      .from(t.opportunities)
      .leftJoin(t.users, eq(t.users.id, t.opportunities.submittedById))
      .where(and(eq(t.opportunities.institutionId, ctx.institutionId), eq(t.opportunities.status, status)))
      .orderBy(desc(t.opportunities.createdAt))
      .limit(200),
    db
      .select({ status: t.opportunities.status, n: count() })
      .from(t.opportunities)
      .where(eq(t.opportunities.institutionId, ctx.institutionId))
      .groupBy(t.opportunities.status),
  ]);
  const trackedCounts = rows.length
    ? await db
        .select({ id: t.opportunityTracking.opportunityId, n: count() })
        .from(t.opportunityTracking)
        .where(and(inArray(t.opportunityTracking.opportunityId, rows.map((r) => r.o.id)), sql`${t.opportunityTracking.status} <> 'SAVED'`))
        .groupBy(t.opportunityTracking.opportunityId)
    : [];
  const applied = new Map(trackedCounts.map((x) => [x.id, Number(x.n)]));
  const provider = getFeedProvider();
  return {
    counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.n)])) as Record<string, number>,
    feed: provider ? { name: provider.name } : null,
    rows: rows.map(({ o, first, last }) => ({
      id: o.id,
      kind: o.kind as OpportunityKind,
      title: o.title,
      organization: o.organization,
      deadline: o.deadline,
      source: o.source,
      sourceName: o.sourceName,
      submittedBy: first ? `${first} ${last}` : null,
      applyUrl: o.applyUrl,
      skills: o.skills,
      reviewNote: o.reviewNote,
      // Aggregate only: how many students applied — never who.
      applications: applied.get(o.id) ?? 0,
    })),
  };
}

/**
 * Import from the configured feed. New items arrive as PENDING; items already
 * imported (same feed + id) are skipped, so re-running is safe.
 */
export async function importFeed(ctx: AuthContext, meta: Meta, provider: OpportunityFeedProvider | null = getFeedProvider()) {
  requireOpportunities(ctx);
  if (!ctx.permissions.has('opportunity:manage')) throw new ForbiddenError();
  if (!provider) throw new AppError('No opportunities feed is configured. Set OPPORTUNITY_FEED_PROVIDER and OPPORTUNITY_FEED_URL (see docs/CAREER.md).', 409, 'NO_FEED');
  await enforceRateLimit(keyFor('opportunity:import', ctx.institutionId), { limit: 12, windowSec: 3600 }, 'The feed was imported recently. Try again later.');
  let result;
  try {
    result = await provider.fetch();
  } catch (error) {
    throw new AppError(`The feed could not be read: ${error instanceof Error ? error.message : 'unknown error'}`, 502, 'FEED_FAILED');
  }
  let imported = 0;
  for (const item of result.items) {
    if (item.deadline && item.deadline.getTime() < Date.now()) continue;
    const rows = await db
      .insert(t.opportunities)
      .values({
        institutionId: ctx.institutionId,
        kind: item.kind,
        title: item.title,
        organization: item.organization,
        description: item.description ?? null,
        location: item.location ?? null,
        workMode: item.workMode,
        compensation: item.compensation ?? null,
        applyUrl: item.applyUrl ?? null,
        deadline: item.deadline ?? null,
        eligibility: item.eligibility ?? null,
        skills: item.skills,
        status: 'PENDING',
        source: 'FEED',
        sourceName: provider.name,
        sourceRef: item.id,
      })
      .onConflictDoNothing()
      .returning({ id: t.opportunities.id });
    imported += rows.length;
  }
  const summary = { fetched: result.items.length, imported, skipped: result.items.length - imported, invalid: result.rejected.length };
  await recordAudit(ctx, { action: 'OPPORTUNITY_IMPORTED', entityType: 'institution', entityId: ctx.institutionId, after: { provider: provider.name, ...summary }, ...meta });
  return { ...summary, rejected: result.rejected.slice(0, 20) };
}

/* -------------------------------- career goal ----------------------------- */

/** A student picks their own target role (from the college's catalogue). */
export async function setCareerGoal(ctx: AuthContext, careerRoleId: string | null) {
  if (!ctx.studentProfileId) throw new ForbiddenError('Only students have career goals.');
  if (!isEnabled(ctx.featureFlags, 'skill_engine_enabled')) throw new AppError('Career goals are switched off at your college.', 404, 'FEATURE_DISABLED');
  if (careerRoleId === null) {
    await db.update(t.careerGoals).set({ isPrimary: false }).where(eq(t.careerGoals.studentId, ctx.studentProfileId));
    return { careerRoleId: null };
  }
  const [role] = await db
    .select({ id: t.careerRoles.id })
    .from(t.careerRoles)
    .where(and(eq(t.careerRoles.id, careerRoleId), eq(t.careerRoles.institutionId, ctx.institutionId), eq(t.careerRoles.isActive, true)))
    .limit(1);
  if (!role) throw new NotFoundError('Career role');
  await db.transaction(async (tx) => {
    await tx.update(t.careerGoals).set({ isPrimary: false }).where(eq(t.careerGoals.studentId, ctx.studentProfileId!));
    await tx
      .insert(t.careerGoals)
      .values({ institutionId: ctx.institutionId, studentId: ctx.studentProfileId!, careerRoleId: role.id, isPrimary: true })
      .onConflictDoUpdate({ target: [t.careerGoals.studentId, t.careerGoals.careerRoleId], set: { isPrimary: true } });
  });
  return { careerRoleId: role.id };
}

export async function listCareerRoles(ctx: AuthContext) {
  return db
    .select({ id: t.careerRoles.id, title: t.careerRoles.title, description: t.careerRoles.description })
    .from(t.careerRoles)
    .where(and(eq(t.careerRoles.institutionId, ctx.institutionId), eq(t.careerRoles.isActive, true)))
    .orderBy(asc(t.careerRoles.title));
}

/** A student's own application tracker, for the data export. */
export async function exportOpportunityData(userId: string) {
  const [tracked, submitted] = await Promise.all([
    db
      .select({ title: t.opportunities.title, organization: t.opportunities.organization, status: t.opportunityTracking.status, note: t.opportunityTracking.note, appliedAt: t.opportunityTracking.appliedAt })
      .from(t.opportunityTracking)
      .innerJoin(t.opportunities, eq(t.opportunities.id, t.opportunityTracking.opportunityId))
      .where(eq(t.opportunityTracking.userId, userId)),
    db
      .select({ title: t.opportunities.title, organization: t.opportunities.organization, status: t.opportunities.status, createdAt: t.opportunities.createdAt })
      .from(t.opportunities)
      .where(and(eq(t.opportunities.submittedById, userId), eq(t.opportunities.source, 'STUDENT'))),
  ]);
  return { applications: tracked, submitted };
}
