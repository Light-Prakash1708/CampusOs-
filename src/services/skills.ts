import 'server-only';
import { and, eq, desc, sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';

/**
 * SKILL & EMPLOYABILITY ENGINE
 * ---------------------------------------------------------------------------
 * Two rules govern everything here:
 *
 *   1. EVIDENCE OR NOTHING. A proficiency value exists only because concrete
 *      evidence rows exist. `confidence` reports how much evidence supports it,
 *      and the UI shows low-confidence values differently.
 *
 *   2. NO INVENTED REQUIREMENTS. A role's required skill profile comes from the
 *      institution's own `career_roles` configuration, with a visible note about
 *      where it came from. We do not fabricate market data.
 */

export interface SkillProfileEntry {
  skillId: string;
  skill: string;
  category: string;
  proficiency: number;
  confidence: number;
  evidenceCount: number;
}

export interface SkillGapEntry {
  skillId: string;
  skill: string;
  current: number;
  required: number;
  gap: number;
  importance: number;
  isCore: boolean;
  /** Ordering key: bigger gaps on more important skills come first. */
  priority: number;
}

export interface StudentSkillProfile {
  skills: SkillProfileEntry[];
  strongest: SkillProfileEntry[];
  weakest: SkillProfileEntry[];
  careerGoal: {
    roleId: string;
    title: string;
    sourceNote: string | null;
    readiness: number;
    gaps: SkillGapEntry[];
    metRequirements: number;
    totalRequirements: number;
  } | null;
  overallEvidenceCount: number;
}

export async function getStudentSkillProfile(
  institutionId: string,
  studentId: string,
): Promise<StudentSkillProfile> {
  const skillRows = await db
    .select({
      skillId: t.studentSkills.skillId,
      skill: t.skills.name,
      category: t.skills.category,
      proficiency: t.studentSkills.proficiency,
      confidence: t.studentSkills.confidence,
      evidenceCount: t.studentSkills.evidenceCount,
    })
    .from(t.studentSkills)
    .innerJoin(t.skills, eq(t.skills.id, t.studentSkills.skillId))
    .where(
      and(
        eq(t.studentSkills.institutionId, institutionId),
        eq(t.studentSkills.studentId, studentId),
      ),
    )
    .orderBy(desc(t.studentSkills.proficiency));

  const skills: SkillProfileEntry[] = skillRows.map((r) => ({
    skillId: r.skillId,
    skill: r.skill,
    category: r.category,
    proficiency: r.proficiency,
    confidence: r.confidence,
    evidenceCount: r.evidenceCount,
  }));

  const [goal] = await db
    .select({
      roleId: t.careerRoles.id,
      title: t.careerRoles.title,
      sourceNote: t.careerRoles.sourceNote,
    })
    .from(t.careerGoals)
    .innerJoin(t.careerRoles, eq(t.careerRoles.id, t.careerGoals.careerRoleId))
    .where(and(eq(t.careerGoals.studentId, studentId), eq(t.careerGoals.isPrimary, true)))
    .limit(1);

  let careerGoal: StudentSkillProfile['careerGoal'] = null;

  if (goal) {
    const requirements = await db
      .select({
        skillId: t.careerRoleSkills.skillId,
        skill: t.skills.name,
        required: t.careerRoleSkills.requiredProficiency,
        importance: t.careerRoleSkills.importance,
        isCore: t.careerRoleSkills.isCore,
      })
      .from(t.careerRoleSkills)
      .innerJoin(t.skills, eq(t.skills.id, t.careerRoleSkills.skillId))
      .where(eq(t.careerRoleSkills.careerRoleId, goal.roleId));

    const current = new Map(skills.map((s) => [s.skillId, s.proficiency]));

    const gaps: SkillGapEntry[] = requirements
      .map((req) => {
        const have = current.get(req.skillId) ?? 0;
        const gap = Math.max(0, req.required - have);
        return {
          skillId: req.skillId,
          skill: req.skill,
          current: have,
          required: req.required,
          gap,
          importance: req.importance,
          isCore: req.isCore,
          priority: gap * req.importance,
        };
      })
      .sort((a, b) => b.priority - a.priority);

    // Readiness weights each requirement by importance, capped at the target.
    const totalWeight = requirements.reduce((n, r) => n + r.importance, 0);
    const achieved = requirements.reduce((n, r) => {
      const have = current.get(r.skillId) ?? 0;
      return n + Math.min(1, have / r.required) * r.importance;
    }, 0);

    careerGoal = {
      roleId: goal.roleId,
      title: goal.title,
      sourceNote: goal.sourceNote,
      readiness: totalWeight ? Math.round((achieved / totalWeight) * 100) : 0,
      gaps,
      metRequirements: gaps.filter((g) => g.gap === 0).length,
      totalRequirements: gaps.length,
    };
  }

  return {
    skills,
    strongest: skills.slice(0, 5),
    weakest: [...skills].sort((a, b) => a.proficiency - b.proficiency).slice(0, 5),
    careerGoal,
    overallEvidenceCount: skills.reduce((n, s) => n + s.evidenceCount, 0),
  };
}

export interface GapPlanStep {
  order: number;
  skillId: string;
  skill: string;
  currentLevel: number;
  targetLevel: number;
  weeks: number;
  actions: string[];
  institutionalResources: { id: string; title: string }[];
}

/**
 * Builds a time-boxed plan to close the gap to a target role.
 *
 * The sequencing and effort estimates are RULE-BASED, not model-generated:
 * gap size and importance determine order and duration. Suggested resources are
 * looked up from the institution's own resource hub — never invented links.
 */
export async function buildSkillGapPlan(
  institutionId: string,
  studentId: string,
  careerRoleId: string,
): Promise<{ readiness: number; totalWeeks: number; steps: GapPlanStep[] }> {
  const profile = await getStudentSkillProfile(institutionId, studentId);

  const requirements = await db
    .select({
      skillId: t.careerRoleSkills.skillId,
      skill: t.skills.name,
      required: t.careerRoleSkills.requiredProficiency,
      importance: t.careerRoleSkills.importance,
    })
    .from(t.careerRoleSkills)
    .innerJoin(t.skills, eq(t.skills.id, t.careerRoleSkills.skillId))
    .where(eq(t.careerRoleSkills.careerRoleId, careerRoleId));

  const current = new Map(profile.skills.map((s) => [s.skillId, s.proficiency]));

  const gaps = requirements
    .map((r) => {
      const have = current.get(r.skillId) ?? 0;
      return { ...r, have, gap: Math.max(0, r.required - have) };
    })
    .filter((g) => g.gap > 0)
    .sort((a, b) => b.gap * b.importance - a.gap * a.importance)
    .slice(0, 6);

  const steps: GapPlanStep[] = [];
  let order = 1;

  for (const gap of gaps) {
    // Roughly one week per 8 points of gap, floored at 1 and capped at 6.
    const weeks = Math.max(1, Math.min(6, Math.ceil(gap.gap / 8)));

    const resources = await db
      .select({ id: t.resources.id, title: t.resources.title })
      .from(t.resources)
      .where(
        and(
          eq(t.resources.institutionId, institutionId),
          eq(t.resources.status, 'PUBLISHED'),
          sql`${t.resources.searchVector} @@ plainto_tsquery('english', ${gap.skill})`,
        ),
      )
      .limit(3);

    steps.push({
      order: order++,
      skillId: gap.skillId,
      skill: gap.skill,
      currentLevel: gap.have,
      targetLevel: gap.required,
      weeks,
      actions: buildActions(gap.skill, gap.gap),
      institutionalResources: resources,
    });
  }

  return {
    readiness: profile.careerGoal?.readiness ?? 0,
    totalWeeks: steps.reduce((n, s) => n + s.weeks, 0),
    steps,
  };
}

function buildActions(skill: string, gap: number): string[] {
  const actions: string[] = [];
  if (gap >= 30) {
    actions.push(`Start from fundamentals in ${skill} — work through a structured course end to end.`);
    actions.push(`Complete one graded piece of work that is assessed on ${skill}.`);
  } else if (gap >= 15) {
    actions.push(`Practise ${skill} on a real dataset or case, not just exercises.`);
    actions.push(`Ask a faculty member to assess your ${skill} work and record the result.`);
  } else {
    actions.push(`Consolidate ${skill} with one applied project you can show an interviewer.`);
  }
  actions.push(`Log evidence (assignment, certification or faculty assessment) so this updates your profile.`);
  return actions;
}

/**
 * Recomputes a student's skill profile from evidence.
 *
 * Weighted mean with recency preference: newer evidence counts more, because a
 * skill demonstrated last month is better information than one demonstrated a
 * year ago. Confidence rises with the number of independent evidence items.
 */
export async function recomputeStudentSkills(
  institutionId: string,
  studentId: string,
): Promise<number> {
  const evidence = await db
    .select({
      skillId: t.skillEvidence.skillId,
      score: t.skillEvidence.score,
      weight: t.skillEvidence.weight,
      recordedAt: t.skillEvidence.recordedAt,
    })
    .from(t.skillEvidence)
    .where(
      and(
        eq(t.skillEvidence.institutionId, institutionId),
        eq(t.skillEvidence.studentId, studentId),
      ),
    );

  const bySkill = new Map<string, { weighted: number; weight: number; count: number; latest: Date }>();
  const now = Date.now();

  for (const e of evidence) {
    const ageDays = (now - e.recordedAt.getTime()) / 86_400_000;
    // Half-life of roughly one academic year.
    const recency = Math.max(0.35, Math.exp(-ageDays / 260));
    const w = e.weight * recency;

    const entry = bySkill.get(e.skillId) ?? {
      weighted: 0,
      weight: 0,
      count: 0,
      latest: e.recordedAt,
    };
    entry.weighted += e.score * w;
    entry.weight += w;
    entry.count += 1;
    if (e.recordedAt > entry.latest) entry.latest = e.recordedAt;
    bySkill.set(e.skillId, entry);
  }

  let updated = 0;
  for (const [skillId, agg] of bySkill) {
    const proficiency = Math.round(agg.weighted / agg.weight);
    // Confidence saturates around five independent evidence items.
    const confidence = Math.min(95, 30 + agg.count * 13);

    await db
      .insert(t.studentSkills)
      .values({
        institutionId,
        studentId,
        skillId,
        proficiency,
        confidence,
        evidenceCount: agg.count,
        lastEvidenceAt: agg.latest,
        recomputedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [t.studentSkills.studentId, t.studentSkills.skillId],
        set: {
          proficiency,
          confidence,
          evidenceCount: agg.count,
          lastEvidenceAt: agg.latest,
          recomputedAt: new Date(),
        },
      });
    updated += 1;
  }

  return updated;
}

/** Cohort view for a placement cell: readiness distribution and top gaps. */
export async function getCohortReadiness(
  institutionId: string,
  sectionId: string,
): Promise<{
  students: { studentId: string; name: string; rollNumber: string; readiness: number; goal: string | null }[];
  averageReadiness: number;
  topGaps: { skill: string; studentsAffected: number; averageGap: number }[];
}> {
  const students = await db
    .select({
      studentId: t.studentProfiles.id,
      rollNumber: t.studentProfiles.rollNumber,
      firstName: t.users.firstName,
      lastName: t.users.lastName,
    })
    .from(t.studentProfiles)
    .innerJoin(t.users, eq(t.users.id, t.studentProfiles.userId))
    .where(
      and(
        eq(t.studentProfiles.institutionId, institutionId),
        eq(t.studentProfiles.sectionId, sectionId),
      ),
    );

  const results: {
    studentId: string;
    name: string;
    rollNumber: string;
    readiness: number;
    goal: string | null;
  }[] = [];
  const gapTally = new Map<string, { total: number; count: number }>();

  for (const student of students) {
    const profile = await getStudentSkillProfile(institutionId, student.studentId);
    results.push({
      studentId: student.studentId,
      name: `${student.firstName} ${student.lastName}`,
      rollNumber: student.rollNumber,
      readiness: profile.careerGoal?.readiness ?? 0,
      goal: profile.careerGoal?.title ?? null,
    });

    for (const gap of profile.careerGoal?.gaps ?? []) {
      if (gap.gap <= 0) continue;
      const entry = gapTally.get(gap.skill) ?? { total: 0, count: 0 };
      entry.total += gap.gap;
      entry.count += 1;
      gapTally.set(gap.skill, entry);
    }
  }

  const withGoals = results.filter((r) => r.goal);

  return {
    students: results.sort((a, b) => b.readiness - a.readiness),
    averageReadiness: withGoals.length
      ? Math.round(withGoals.reduce((n, r) => n + r.readiness, 0) / withGoals.length)
      : 0,
    topGaps: [...gapTally.entries()]
      .map(([skill, v]) => ({
        skill,
        studentsAffected: v.count,
        averageGap: Math.round(v.total / v.count),
      }))
      .sort((a, b) => b.studentsAffected - a.studentsAffected)
      .slice(0, 6),
  };
}
