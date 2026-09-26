import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { resolveAudience } from '@/services/communication';
import { checkSlotConflicts, scanVersionConflicts } from '@/services/timetable/conflicts';
import { getStudentSkillProfile } from '@/services/skills';
import { computeRoomUtilization, computeWorkloadBalance } from '@/services/analytics';
import { parseTimetableConstraints } from '@/services/timetable/nl';
import type { AuthContext } from '@/lib/auth/context';
import { permissionsForRoles } from '@/lib/auth/permissions';

/**
 * INTEGRATION TESTS
 * ---------------------------------------------------------------------------
 * These run against the seeded demo database and assert the guarantees the
 * product actually claims: the database refuses conflicting writes, history
 * cannot be rewritten, audiences resolve through the academic hierarchy, and
 * tenant data never leaks.
 *
 * Requires: npm run db:seed
 */

let institutionId: string;
let versionId: string;

beforeAll(async () => {
  const [inst] = await db
    .select({ id: t.institutions.id })
    .from(t.institutions)
    .where(eq(t.institutions.slug, 'demo-university'))
    .limit(1);

  if (!inst) throw new Error('Demo tenant not found. Run `npm run db:seed` first.');
  institutionId = inst.id;

  const [version] = await db
    .select({ id: t.timetableVersions.id })
    .from(t.timetableVersions)
    .where(
      and(
        eq(t.timetableVersions.institutionId, institutionId),
        eq(t.timetableVersions.status, 'PUBLISHED'),
      ),
    )
    .limit(1);

  if (!version) throw new Error('No published timetable in the demo tenant.');
  versionId = version.id;
});

afterAll(async () => {
  await pool.end();
});

/** Returns the full error text including the driver's nested cause. */
async function captureError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (error) {
    const e = error as { message?: string; cause?: { message?: string } };
    return `${e.message ?? ''} ${e.cause?.message ?? ''}`;
  }
}

/* ------------------------- database integrity ---------------------------- */

describe('database integrity guarantees', () => {
  it('refuses to double-book a room, even when the application asks it to', async () => {
    const [entry] = await db
      .select()
      .from(t.timetableEntries)
      .where(and(eq(t.timetableEntries.versionId, versionId), sql`${t.timetableEntries.roomId} is not null`))
      .limit(1);

    expect(entry).toBeDefined();

    await expect(
      db.insert(t.timetableEntries).values({
        institutionId,
        versionId: entry!.versionId,
        offeringId: entry!.offeringId,
        timeSlotId: entry!.timeSlotId,
        roomId: entry!.roomId,
        facultyId: null,
        sectionId: entry!.sectionId,
        dayOfWeek: entry!.dayOfWeek,
      }),
    ).rejects.toThrow();
  });

  it('rejects updates to the audit log', async () => {
    await db.insert(t.auditLogs).values({
      institutionId,
      action: 'SETTINGS_UPDATED',
      entityType: 'test',
      actorRole: 'ADMIN',
    });

    // Drizzle wraps the driver error, so assert against the underlying cause.
    const message = await captureError(() =>
      db.update(t.auditLogs).set({ action: 'TAMPERED' }).where(eq(t.auditLogs.institutionId, institutionId)),
    );
    expect(message).toMatch(/append-only/i);
  });

  it('rejects deletion of grievance history', async () => {
    const message = await captureError(() =>
      db.delete(t.grievanceEvents).where(eq(t.grievanceEvents.institutionId, institutionId)),
    );
    expect(message).toMatch(/append-only/i);
  });

  it('allows only one published timetable per term', async () => {
    const [published] = await db
      .select()
      .from(t.timetableVersions)
      .where(eq(t.timetableVersions.id, versionId))
      .limit(1);

    await expect(
      db.insert(t.timetableVersions).values({
        institutionId,
        termId: published!.termId,
        name: 'Illegal second published version',
        status: 'PUBLISHED',
        versionNumber: 999,
      }),
    ).rejects.toThrow();
  });

  it('rejects a room with non-positive capacity', async () => {
    await expect(
      db.insert(t.rooms).values({
        institutionId,
        code: `TEST-${Date.now()}`,
        capacity: 0,
      }),
    ).rejects.toThrow();
  });
});

/* --------------------------- conflict engine ----------------------------- */

describe('conflict engine', () => {
  it('finds no conflicts in the solver-generated timetable', async () => {
    const scan = await scanVersionConflicts(institutionId, versionId);
    expect(scan.total).toBe(0);
  });

  it('detects a room clash and offers verified alternatives', async () => {
    const entries = await db
      .select({
        id: t.timetableEntries.id,
        sectionId: t.timetableEntries.sectionId,
        timeSlotId: t.timetableEntries.timeSlotId,
        roomId: t.timetableEntries.roomId,
      })
      .from(t.timetableEntries)
      .where(and(eq(t.timetableEntries.versionId, versionId), sql`${t.timetableEntries.roomId} is not null`))
      .limit(60);

    // Find two entries in different slots so we can force a clash.
    const a = entries[0]!;
    const b = entries.find((e) => e.timeSlotId !== a.timeSlotId && e.sectionId !== a.sectionId)!;
    expect(b).toBeDefined();

    const result = await checkSlotConflicts({
      institutionId,
      versionId,
      timeSlotId: b.timeSlotId,
      sectionId: a.sectionId,
      roomId: b.roomId,
      excludeEntryId: a.id,
    });

    expect(result.hasBlockingConflict).toBe(true);
    expect(result.conflicts.some((c) => c.kind === 'ROOM_OCCUPIED')).toBe(true);
    expect(result.impact.students).toBeGreaterThan(0);

    // Every suggested alternative must actually be free.
    for (const alt of result.alternatives) {
      if (!alt.roomId || !alt.timeSlotId) continue;
      const [clash] = await db
        .select({ id: t.timetableEntries.id })
        .from(t.timetableEntries)
        .where(
          and(
            eq(t.timetableEntries.versionId, versionId),
            eq(t.timetableEntries.timeSlotId, alt.timeSlotId),
            eq(t.timetableEntries.roomId, alt.roomId),
          ),
        )
        .limit(1);
      expect(clash, `suggested room ${alt.roomLabel} was not actually free`).toBeUndefined();
    }
  });

  it('refuses to schedule a class during a break period', async () => {
    const [breakSlot] = await db
      .select()
      .from(t.timeSlots)
      .where(and(eq(t.timeSlots.institutionId, institutionId), eq(t.timeSlots.kind, 'LUNCH')))
      .limit(1);

    const [section] = await db
      .select()
      .from(t.sections)
      .where(eq(t.sections.institutionId, institutionId))
      .limit(1);

    const result = await checkSlotConflicts({
      institutionId,
      versionId,
      timeSlotId: breakSlot!.id,
      sectionId: section!.id,
    });

    expect(result.hasBlockingConflict).toBe(true);
    expect(result.conflicts.some((c) => c.kind === 'OUTSIDE_TEACHING_PERIOD')).toBe(true);
  });
});

/* ------------------------ audience resolution ---------------------------- */

describe('communication audience', () => {
  it('resolves a section to its students plus the faculty who teach them', async () => {
    const [section] = await db
      .select()
      .from(t.sections)
      .where(and(eq(t.sections.institutionId, institutionId), eq(t.sections.code, 'BCA-3A')))
      .limit(1);

    const audience = await resolveAudience(institutionId, [
      { scope: 'SECTION', sectionId: section!.id },
    ]);

    expect(audience.breakdown.students).toBe(section!.strength);
    expect(audience.breakdown.faculty).toBeGreaterThan(0);
    expect(audience.description).toContain('BCA-3A');
  });

  it('applies exclusions after inclusions', async () => {
    const [section] = await db
      .select()
      .from(t.sections)
      .where(and(eq(t.sections.institutionId, institutionId), eq(t.sections.code, 'BCA-3A')))
      .limit(1);

    const all = await resolveAudience(institutionId, [{ scope: 'ROLE', role: 'STUDENT' }]);
    const minusSection = await resolveAudience(institutionId, [
      { scope: 'ROLE', role: 'STUDENT' },
      { scope: 'SECTION', sectionId: section!.id, isExclusion: true },
    ]);

    expect(minusSection.userIds.length).toBe(all.userIds.length - section!.strength);
  });

  it('never targets a named person at another college (regression)', async () => {
    const [outsider] = await db
      .select({ id: t.users.id })
      .from(t.users)
      .where(sql`${t.users.institutionId} <> ${institutionId}`)
      .limit(1);
    const [insider] = await db.select({ id: t.users.id }).from(t.users).where(and(eq(t.users.institutionId, institutionId), eq(t.users.status, 'ACTIVE'))).limit(1);
    if (outsider) {
      const audience = await resolveAudience(institutionId, [{ scope: 'USER', userId: outsider.id }]);
      expect(audience.userIds).toEqual([]);
    }
    expect((await resolveAudience(institutionId, [{ scope: 'USER', userId: insider!.id }])).userIds).toEqual([insider!.id]);
  });

  it('produces no recipients for an empty rule set rather than everyone', async () => {
    const audience = await resolveAudience(institutionId, []);
    expect(audience.userIds).toHaveLength(0);
  });
});

/* --------------------------- tenant isolation ---------------------------- */

describe('tenant isolation', () => {
  it('scopes every institution-owned table by institution_id', async () => {
    const { rows } = await pool.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        -- rate_limit_buckets keys on IPs/emails BEFORE a tenant is known (login,
        -- registration); it holds hashed counters only, no tenant data.
        AND table_name NOT IN ('institutions','sessions','job_queue','rate_limit_buckets')
        AND table_name NOT LIKE '\\_\\_%'
    `);

    const missing: string[] = [];
    for (const row of rows) {
      const { rows: cols } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='institution_id'`,
        [row.table_name],
      );
      if (cols.length === 0) missing.push(row.table_name);
    }

    expect(missing, `tables without institution_id: ${missing.join(', ')}`).toHaveLength(0);
  });

  it('returns nothing for a different tenant id', async () => {
    const otherTenant = '00000000-0000-0000-0000-000000000000';
    const rows = await db
      .select()
      .from(t.studentProfiles)
      .where(eq(t.studentProfiles.institutionId, otherTenant));
    expect(rows).toHaveLength(0);
  });
});

/* ---------------------------- skill engine ------------------------------- */

describe('skill engine', () => {
  it('reports readiness backed by evidence, never an invented number', async () => {
    const [student] = await db
      .select({ id: t.studentProfiles.id })
      .from(t.careerGoals)
      .innerJoin(t.studentProfiles, eq(t.studentProfiles.id, t.careerGoals.studentId))
      .where(eq(t.careerGoals.institutionId, institutionId))
      .limit(1);

    expect(student).toBeDefined();
    const profile = await getStudentSkillProfile(institutionId, student!.id);

    expect(profile.skills.length).toBeGreaterThan(0);
    expect(profile.careerGoal).not.toBeNull();
    expect(profile.careerGoal!.readiness).toBeGreaterThanOrEqual(0);
    expect(profile.careerGoal!.readiness).toBeLessThanOrEqual(100);

    // Every proficiency must be supported by at least one evidence row.
    for (const skill of profile.skills) {
      expect(skill.evidenceCount).toBeGreaterThan(0);
      expect(skill.proficiency).toBeGreaterThanOrEqual(0);
      expect(skill.proficiency).toBeLessThanOrEqual(100);
    }

    // Gaps must be ranked by priority (gap size × importance).
    const gaps = profile.careerGoal!.gaps;
    for (let i = 1; i < gaps.length; i += 1) {
      expect(gaps[i - 1]!.priority).toBeGreaterThanOrEqual(gaps[i]!.priority);
    }
  });
});

/* ------------------------------ analytics -------------------------------- */

describe('analytics', () => {
  it('computes room utilisation within valid bounds', async () => {
    const utilisation = await computeRoomUtilization(institutionId);
    expect(utilisation.rooms.length).toBeGreaterThan(0);
    for (const room of utilisation.rooms) {
      expect(room.utilizationPercent).toBeGreaterThanOrEqual(0);
      expect(room.utilizationPercent).toBeLessThanOrEqual(100);
    }
    expect(utilisation.overallUtilizationPercent).toBeLessThanOrEqual(100);
  });

  it('derives workload totals that match their components', async () => {
    const balance = await computeWorkloadBalance(institutionId);
    expect(balance.faculty.length).toBeGreaterThan(0);

    for (const f of balance.faculty) {
      const [summary] = await db
        .select()
        .from(t.workloadSummaries)
        .where(eq(t.workloadSummaries.facultyId, f.id))
        .limit(1);

      const parts =
        Number(summary!.teachingHours) + Number(summary!.labHours) +
        Number(summary!.assessmentHours) + Number(summary!.administrativeHours) +
        Number(summary!.mentoringHours) + Number(summary!.otherHours);

      expect(Math.abs(parts - Number(summary!.totalHours))).toBeLessThan(0.01);
    }
  });
});

/* --------------------- natural-language constraints ---------------------- */

describe('natural-language scheduling requirements', () => {
  function ctx(): AuthContext {
    return {
      sessionId: 'test', userId: 'test', institutionId,
      institutionName: 'Demo', institutionSlug: 'demo-university',
      institutionLogoUrl: null, institutionPrimaryColor: '#000', featureFlags: {},
      email: 'test@test', firstName: 'Test', lastName: 'User', fullName: 'Test User',
      displayName: 'Test User', avatarUrl: null, role: 'ADMIN', secondaryRoles: [],
      permissions: permissionsForRoles('ADMIN'), departmentId: null, campusId: null,
      studentProfileId: null, sectionId: null, programId: null, facultyProfileId: null,
      portal: 'admin', locale: 'en',
    };
  }

  it('turns an availability sentence into concrete blocked slots', async () => {
    const parsed = await parseTimetableConstraints(
      ctx(),
      'Dr. Meera Sharma is unavailable on Wednesday',
    );
    expect(parsed.constraints.length).toBeGreaterThan(0);
    const constraint = parsed.constraints[0]!;
    expect(constraint.kind).toBe('FACULTY_UNAVAILABLE');
    expect(constraint.severity).toBe('HARD');
    expect(constraint.slotIds!.length).toBeGreaterThan(0);
    expect(parsed.interpreted[0]).toContain('Wednesday');
  });

  it('handles a time cutoff', async () => {
    const parsed = await parseTimetableConstraints(
      ctx(),
      'Meera Sharma cannot teach before 10 AM on Monday',
    );
    expect(parsed.constraints).toHaveLength(1);
    expect(parsed.constraints[0]!.slotIds!.length).toBeGreaterThan(0);
  });

  it('reports what it could not understand instead of dropping it silently', async () => {
    const parsed = await parseTimetableConstraints(
      ctx(),
      'Please make the timetable nicer somehow',
    );
    expect(parsed.constraints).toHaveLength(0);
    expect(parsed.unrecognised.length).toBeGreaterThan(0);
  });
});
