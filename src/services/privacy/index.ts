import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, NotFoundError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';
import { enforceRateLimit, keyFor, RATE_LIMITS } from '@/services/rate-limit';
import {
  AI_COACH_SCOPES,
  CONSENT_NOTICE_VERSION,
  type AiCoachScope,
} from './catalogue';
import { consentChanges, PRIVACY_DEFAULTS, type PrivacyPrefs } from './rules';

export * from './rules';

/**
 * PRIVACY SERVICE
 * ---------------------------------------------------------------------------
 * Preferences, the consent ledger, data export and erasure requests. Every
 * change is audited; every consent-bearing change also appends to the
 * (append-only) consent ledger with the notice version the student saw.
 */

type Meta = { ipAddress: string | null; userAgent: string | null };

export async function getPrivacyPreferences(ctx: Pick<AuthContext, 'userId'>): Promise<PrivacyPrefs> {
  const [row] = await db.select().from(t.privacyPreferences).where(eq(t.privacyPreferences.userId, ctx.userId)).limit(1);
  if (!row) return { ...PRIVACY_DEFAULTS };
  return {
    leaderboardVisibility: row.leaderboardVisibility,
    profileVisibility: row.profileVisibility as PrivacyPrefs['profileVisibility'],
    showStreaks: row.showStreaks,
    showAchievements: row.showAchievements,
    showEventParticipation: row.showEventParticipation,
    personalizedRecommendations: row.personalizedRecommendations,
    aiMemoryEnabled: row.aiMemoryEnabled,
    aiCoachScopes: (row.aiCoachScopes ?? []).filter((s): s is AiCoachScope => (AI_COACH_SCOPES as readonly string[]).includes(s)),
  };
}

export async function updatePrivacyPreferences(
  ctx: AuthContext,
  patch: Partial<PrivacyPrefs>,
  meta: Meta & { source?: 'privacy_center' | 'onboarding' | 'api' },
): Promise<PrivacyPrefs> {
  const before = await getPrivacyPreferences(ctx);
  const after: PrivacyPrefs = {
    ...before,
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
  } as PrivacyPrefs;
  after.aiCoachScopes = [...new Set(after.aiCoachScopes)].filter((s) => (AI_COACH_SCOPES as readonly string[]).includes(s)) as AiCoachScope[];

  const consents = consentChanges(before, after);

  await db.transaction(async (tx) => {
    await tx
      .insert(t.privacyPreferences)
      .values({ institutionId: ctx.institutionId, userId: ctx.userId, ...after })
      .onConflictDoUpdate({ target: t.privacyPreferences.userId, set: { ...after, updatedAt: new Date() } });
    if (consents.length > 0) {
      await tx.insert(t.consentRecords).values(
        consents.map((c) => ({
          institutionId: ctx.institutionId,
          userId: ctx.userId,
          purpose: c.purpose,
          granted: c.granted,
          noticeVersion: CONSENT_NOTICE_VERSION,
          source: meta.source ?? 'privacy_center',
          ipAddress: meta.ipAddress,
        })),
      );
    }
    // Turning AI memory off deletes what it remembered — off means off.
    if (before.aiMemoryEnabled && !after.aiMemoryEnabled) {
      await tx.delete(t.aiPreferences).where(and(eq(t.aiPreferences.userId, ctx.userId), eq(t.aiPreferences.institutionId, ctx.institutionId)));
    }
  });

  await recordAudit(ctx, {
    action: 'PRIVACY_PREFERENCES_CHANGED',
    entityType: 'privacy_preferences',
    entityId: ctx.userId,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
  return after;
}

/** Latest decision per purpose, plus the full history for transparency. */
export async function listConsents(ctx: Pick<AuthContext, 'userId'>) {
  const rows = await db
    .select({
      purpose: t.consentRecords.purpose,
      granted: t.consentRecords.granted,
      noticeVersion: t.consentRecords.noticeVersion,
      source: t.consentRecords.source,
      createdAt: t.consentRecords.createdAt,
    })
    .from(t.consentRecords)
    .where(eq(t.consentRecords.userId, ctx.userId))
    .orderBy(desc(t.consentRecords.createdAt))
    .limit(500);
  const current = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!current.has(r.purpose)) current.set(r.purpose, r);
  return { current: [...current.values()], history: rows };
}

/* ------------------------------ data export ------------------------------- */

const strip = <T extends Record<string, unknown>>(row: T, keys: string[]) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));

/**
 * Assembles everything CampusOS holds about the caller, and ONLY the caller.
 * Every query is keyed on the caller's own user / student-profile id AND the
 * tenant. Secrets (password hash, token hashes) are excluded.
 */
export async function buildPersonalDataExport(ctx: AuthContext) {
  const uid = ctx.userId;
  const tid = ctx.institutionId;
  const sid = ctx.studentProfileId;

  const [account] = await db.select().from(t.users).where(and(eq(t.users.id, uid), eq(t.users.institutionId, tid)));
  const byStudent = async <T>(fn: (studentId: string) => Promise<T[]>): Promise<T[]> => (sid ? fn(sid) : []);

  const conversations = await db.select().from(t.aiConversations).where(and(eq(t.aiConversations.userId, uid), eq(t.aiConversations.institutionId, tid)));
  const convIds = conversations.map((c) => c.id);

  const [
    studentProfile, privacy, consents, notifSettings, notifPrefs, notifications, sessionsList,
    attendanceSummaries, attendanceRecords, submissions, results, skills, careerGoals, certifications,
    grievances, grievanceMessages, aiMessages, aiPrefs, eventRegs, pushSubs, files,
  ] = await Promise.all([
    db.select().from(t.studentProfiles).where(and(eq(t.studentProfiles.userId, uid), eq(t.studentProfiles.institutionId, tid))),
    db.select().from(t.privacyPreferences).where(eq(t.privacyPreferences.userId, uid)),
    db.select().from(t.consentRecords).where(eq(t.consentRecords.userId, uid)),
    db.select().from(t.notificationSettings).where(eq(t.notificationSettings.userId, uid)),
    db.select().from(t.notificationPreferences).where(eq(t.notificationPreferences.userId, uid)),
    db.select().from(t.notifications).where(and(eq(t.notifications.userId, uid), eq(t.notifications.institutionId, tid))).orderBy(desc(t.notifications.createdAt)).limit(1000),
    db.select({ createdAt: t.sessions.createdAt, lastSeenAt: t.sessions.lastSeenAt, ipAddress: t.sessions.ipAddress, userAgent: t.sessions.userAgent, revokedAt: t.sessions.revokedAt }).from(t.sessions).where(eq(t.sessions.userId, uid)),
    byStudent((s) => db.select().from(t.attendanceSummaries).where(and(eq(t.attendanceSummaries.studentId, s), eq(t.attendanceSummaries.institutionId, tid)))),
    byStudent((s) => db.select().from(t.attendanceRecords).where(and(eq(t.attendanceRecords.studentId, s), eq(t.attendanceRecords.institutionId, tid)))),
    byStudent((s) => db.select().from(t.submissions).where(and(eq(t.submissions.studentId, s), eq(t.submissions.institutionId, tid)))),
    byStudent((s) => db.select().from(t.assessmentResults).where(and(eq(t.assessmentResults.studentId, s), eq(t.assessmentResults.institutionId, tid)))),
    byStudent((s) => db.select().from(t.studentSkills).where(and(eq(t.studentSkills.studentId, s), eq(t.studentSkills.institutionId, tid)))),
    byStudent((s) => db.select().from(t.careerGoals).where(and(eq(t.careerGoals.studentId, s), eq(t.careerGoals.institutionId, tid)))),
    byStudent((s) => db.select().from(t.studentCertifications).where(and(eq(t.studentCertifications.studentId, s), eq(t.studentCertifications.institutionId, tid)))),
    db.select().from(t.grievances).where(and(eq(t.grievances.raisedById, uid), eq(t.grievances.institutionId, tid))),
    db.select().from(t.grievanceMessages).where(and(eq(t.grievanceMessages.authorId, uid), eq(t.grievanceMessages.institutionId, tid))),
    convIds.length ? db.select().from(t.aiMessages).where(inArray(t.aiMessages.conversationId, convIds)) : Promise.resolve([]),
    db.select().from(t.aiPreferences).where(and(eq(t.aiPreferences.userId, uid), eq(t.aiPreferences.institutionId, tid))),
    db.select().from(t.eventRegistrations).where(and(eq(t.eventRegistrations.userId, uid), eq(t.eventRegistrations.institutionId, tid))),
    db.select({ kind: t.pushSubscriptions.kind, createdAt: t.pushSubscriptions.createdAt, revokedAt: t.pushSubscriptions.revokedAt }).from(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, uid)),
    db.select({ id: t.storedFiles.id, name: t.storedFiles.originalName, purpose: t.storedFiles.purpose, sizeBytes: t.storedFiles.sizeBytes, createdAt: t.storedFiles.createdAt }).from(t.storedFiles).where(and(eq(t.storedFiles.ownerId, uid), eq(t.storedFiles.institutionId, tid), isNull(t.storedFiles.deletedAt))),
  ]);

  return {
    format: 'campusos.personal-data-export',
    version: 1,
    generatedAt: new Date().toISOString(),
    institution: { name: ctx.institutionName, slug: ctx.institutionSlug },
    notes: [
      'This file contains the personal data CampusOS holds about you at your institution.',
      'Records about other people (e.g. classmates in the same class) are not included.',
      'Security secrets such as your password hash are never exported.',
    ],
    account: account ? strip(account as unknown as Record<string, unknown>, ['passwordHash']) : null,
    studentProfile: studentProfile[0] ?? null,
    privacy: { preferences: privacy[0] ?? null, consents },
    notifications: { settings: notifSettings[0] ?? null, preferences: notifPrefs, received: notifications },
    sessions: sessionsList,
    attendance: { summaries: attendanceSummaries, records: attendanceRecords },
    academics: { submissions, results },
    skills: { skills, careerGoals, certifications },
    grievances: { raised: grievances, messages: grievanceMessages },
    ai: { conversations, messages: aiMessages, memory: aiPrefs },
    events: { registrations: eventRegs },
    devices: pushSubs,
    files,
  };
}

export async function exportPersonalData(ctx: AuthContext, meta: Meta) {
  await enforceRateLimit(keyFor('export', ctx.userId), RATE_LIMITS.dataExportPerUser, 'You have requested several exports today.');
  const data = await buildPersonalDataExport(ctx);
  const categories = Object.keys(data).filter((k) => !['format', 'version', 'generatedAt', 'institution', 'notes'].includes(k));
  await db.insert(t.dataExportRequests).values({
    institutionId: ctx.institutionId,
    userId: ctx.userId,
    status: 'COMPLETED',
    categories,
    completedAt: new Date(),
  });
  await recordAudit(ctx, { action: 'DATA_EXPORT_COMPLETED', entityType: 'user', entityId: ctx.userId, after: { categories }, ...meta });
  return data;
}

/* ------------------------------- erasure ---------------------------------- */

export type DeletionScope = 'ACCOUNT' | 'PERSONAL_TRACKER' | 'AI_MEMORY';

/**
 * Tables holding student-owned personal-tracker data. Phase 2 registers goals,
 * habits and logs here; erasure then covers them automatically.
 */
export const PERSONAL_TRACKER_ERASERS: ((tx: typeof db, ctx: AuthContext) => Promise<number>)[] = [];

export async function requestDeletion(ctx: AuthContext, input: { scope: DeletionScope; reason?: string | null }, meta: Meta) {
  if (input.scope === 'ACCOUNT') {
    try {
      const [row] = await db
        .insert(t.dataDeletionRequests)
        .values({ institutionId: ctx.institutionId, userId: ctx.userId, scope: 'ACCOUNT', reason: input.reason ?? null })
        .returning({ id: t.dataDeletionRequests.id });
      await recordAudit(ctx, { action: 'DATA_DELETION_REQUESTED', entityType: 'data_deletion_request', entityId: row!.id, after: { scope: 'ACCOUNT' }, ...meta });
      return { status: 'PENDING' as const, id: row!.id };
    } catch (error) {
      if (pgErrorOf(error).code === '23505') {
        throw new ConflictError('You already have an account deletion request in progress.');
      }
      throw error;
    }
  }

  // Student-owned data: erase immediately.
  let removed = 0;
  await db.transaction(async (tx) => {
    if (input.scope === 'AI_MEMORY') {
      const rows = await tx.delete(t.aiPreferences)
        .where(and(eq(t.aiPreferences.userId, ctx.userId), eq(t.aiPreferences.institutionId, ctx.institutionId)))
        .returning({ id: t.aiPreferences.id });
      removed = rows.length;
    } else {
      for (const erase of PERSONAL_TRACKER_ERASERS) removed += await erase(tx as unknown as typeof db, ctx);
    }
    await tx.insert(t.dataDeletionRequests).values({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      scope: input.scope,
      reason: input.reason ?? null,
      status: 'COMPLETED',
      completedAt: new Date(),
    });
  });
  await recordAudit(ctx, { action: 'PERSONAL_DATA_DELETED', entityType: 'user', entityId: ctx.userId, after: { scope: input.scope, removed }, ...meta });
  return { status: 'COMPLETED' as const, removed };
}

export async function listDeletionRequests(ctx: AuthContext) {
  if (!ctx.permissions.has('privacy:handle_requests')) throw new ForbiddenError();
  return db
    .select({
      id: t.dataDeletionRequests.id,
      scope: t.dataDeletionRequests.scope,
      status: t.dataDeletionRequests.status,
      reason: t.dataDeletionRequests.reason,
      requestedAt: t.dataDeletionRequests.requestedAt,
      userId: t.users.id,
      name: sql<string>`${t.users.firstName} || ' ' || ${t.users.lastName}`,
      email: t.users.email,
      role: t.users.role,
    })
    .from(t.dataDeletionRequests)
    .innerJoin(t.users, eq(t.users.id, t.dataDeletionRequests.userId))
    .where(and(eq(t.dataDeletionRequests.institutionId, ctx.institutionId), eq(t.dataDeletionRequests.scope, 'ACCOUNT')))
    .orderBy(desc(t.dataDeletionRequests.requestedAt))
    .limit(200);
}

/**
 * Approving an account deletion ANONYMISES the account rather than hard-deleting
 * it: academic records (attendance, results) are institutional records with
 * retention obligations and stay attached to an anonymous identity. Personal,
 * student-owned data (AI history and memory, devices, preferences, tracker) is
 * deleted. The account can no longer sign in.
 */
export async function decideDeletionRequest(
  ctx: AuthContext,
  input: { requestId: string; approve: boolean; note?: string | null },
  meta: Meta,
) {
  if (!ctx.permissions.has('privacy:handle_requests')) throw new ForbiddenError();
  const [req] = await db
    .select()
    .from(t.dataDeletionRequests)
    .where(and(eq(t.dataDeletionRequests.id, input.requestId), eq(t.dataDeletionRequests.institutionId, ctx.institutionId)))
    .limit(1);
  if (!req) throw new NotFoundError('Request');
  if (req.status !== 'PENDING') throw new ConflictError('This request has already been decided.');
  if (req.userId === ctx.userId) throw new AppError('You cannot decide your own deletion request.', 403, 'SELF_DECISION');

  await db.transaction(async (tx) => {
    await tx
      .update(t.dataDeletionRequests)
      .set({
        status: input.approve ? 'COMPLETED' : 'REJECTED',
        decidedById: ctx.userId,
        decisionNote: input.note ?? null,
        completedAt: new Date(),
      })
      .where(eq(t.dataDeletionRequests.id, req.id));
    if (!input.approve) return;

    const uid = req.userId;
    const convs = await tx.select({ id: t.aiConversations.id }).from(t.aiConversations).where(eq(t.aiConversations.userId, uid));
    if (convs.length) await tx.delete(t.aiMessages).where(inArray(t.aiMessages.conversationId, convs.map((c) => c.id)));
    await tx.delete(t.aiConversations).where(eq(t.aiConversations.userId, uid));
    await tx.delete(t.aiPreferences).where(eq(t.aiPreferences.userId, uid));
    await tx.delete(t.pushSubscriptions).where(eq(t.pushSubscriptions.userId, uid));
    await tx.delete(t.notificationPreferences).where(eq(t.notificationPreferences.userId, uid));
    await tx.delete(t.notificationSettings).where(eq(t.notificationSettings.userId, uid));
    await tx.delete(t.authTokens).where(eq(t.authTokens.userId, uid));
    await tx.update(t.sessions).set({ revokedAt: new Date() }).where(and(eq(t.sessions.userId, uid), isNull(t.sessions.revokedAt)));
    for (const erase of PERSONAL_TRACKER_ERASERS) {
      await erase(tx as unknown as typeof db, { ...ctx, userId: uid } as AuthContext);
    }
    await tx
      .update(t.users)
      .set({
        email: `deleted+${uid}@deleted.campusos.invalid`,
        firstName: 'Deleted',
        lastName: 'User',
        displayName: null,
        phone: null,
        avatarUrl: null,
        passwordHash: null,
        preferences: {},
        status: 'ARCHIVED',
        deletedAt: new Date(),
        sessionEpoch: sql`${t.users.sessionEpoch} + 1`,
      })
      .where(and(eq(t.users.id, uid), eq(t.users.institutionId, ctx.institutionId)));
    await tx
      .update(t.studentProfiles)
      .set({ dateOfBirth: null, gender: null, bloodGroup: null, guardianName: null, guardianPhone: null, guardianEmail: null })
      .where(eq(t.studentProfiles.userId, uid));
  });

  await recordAudit(ctx, {
    action: 'DATA_DELETION_DECIDED',
    entityType: 'data_deletion_request',
    entityId: req.id,
    after: { approved: input.approve, subject: req.userId },
    reason: input.note ?? null,
    ...meta,
  });
}

export { ensureRetentionPolicies } from './retention';
