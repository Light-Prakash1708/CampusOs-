import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  numeric,
  date,
} from 'drizzle-orm/pg-core';
import { institutions, departments } from './tenancy';
import { users, studentProfiles } from './people';
import { subjects } from './academics';
import { skillLevelSourceEnum } from './enums';

/**
 * SKILL & EMPLOYABILITY ENGINE  (SIH-2026-13-011)
 * ---------------------------------------------------------------------------
 * A student's skill profile is *evidenced*: every proficiency value traces back
 * to a concrete source (an assignment, an assessment, a certification, a
 * faculty rating). We never invent a skill level. `student_skills.confidence`
 * reflects how much evidence supports the number, and the UI shows it.
 */

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** TECHNICAL | ANALYTICAL | COMMUNICATION | DOMAIN | TOOL | SOFT */
    category: text('category').notNull().default('TECHNICAL'),
    description: text('description'),
    parentSkillId: uuid('parent_skill_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skills_slug_uq').on(t.institutionId, t.slug),
    index('skills_category_idx').on(t.institutionId, t.category),
  ],
);

/** Which skills a subject develops, and how strongly. Drives automatic evidence. */
export const subjectSkills = pgTable(
  'subject_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** 1..5 — how central this skill is to the subject. */
    weight: integer('weight').notNull().default(3),
  },
  (t) => [uniqueIndex('subject_skills_uq').on(t.subjectId, t.skillId)],
);

export const studentSkills = pgTable(
  'student_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** 0..100 weighted proficiency computed from evidence rows. */
    proficiency: integer('proficiency').notNull().default(0),
    /** 0..100 — how much evidence backs this number. Low confidence is shown. */
    confidence: integer('confidence').notNull().default(0),
    evidenceCount: integer('evidence_count').notNull().default(0),
    lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }),
    recomputedAt: timestamp('recomputed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('student_skills_uq').on(t.studentId, t.skillId),
    index('student_skills_institution_idx').on(t.institutionId),
  ],
);

/** Individual, traceable evidence items behind a proficiency score. */
export const skillEvidence = pgTable(
  'skill_evidence',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    source: skillLevelSourceEnum('source').notNull(),
    /** Normalised 0..100 score contributed by this evidence item. */
    score: integer('score').notNull(),
    weight: integer('weight').notNull().default(1),
    sourceType: text('source_type'),
    sourceId: uuid('source_id'),
    description: text('description'),
    recordedById: uuid('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('skill_evidence_student_idx').on(t.studentId, t.skillId),
    index('skill_evidence_source_idx').on(t.sourceType, t.sourceId),
  ],
);

/** Target roles with their required skill profile. Institution-configurable. */
export const careerRoles = pgTable(
  'career_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    /** Where the requirement profile came from — kept honest and visible. */
    sourceNote: text('source_note'),
    averageSalaryLpa: numeric('average_salary_lpa', { precision: 6, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('career_roles_slug_uq').on(t.institutionId, t.slug)],
);

export const careerRoleSkills = pgTable(
  'career_role_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    careerRoleId: uuid('career_role_id')
      .notNull()
      .references(() => careerRoles.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    /** 0..100 proficiency the role expects. */
    requiredProficiency: integer('required_proficiency').notNull().default(70),
    /** 1..5 — how much this skill matters for the role; drives gap ranking. */
    importance: integer('importance').notNull().default(3),
    isCore: boolean('is_core').notNull().default(true),
  },
  (t) => [uniqueIndex('career_role_skills_uq').on(t.careerRoleId, t.skillId)],
);

export const careerGoals = pgTable(
  'career_goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    careerRoleId: uuid('career_role_id')
      .notNull()
      .references(() => careerRoles.id, { onDelete: 'cascade' }),
    isPrimary: boolean('is_primary').notNull().default(true),
    targetDate: date('target_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('career_goals_uq').on(t.studentId, t.careerRoleId)],
);

/** A generated, time-boxed plan to close the gap to a target role. */
export const skillGapPlans = pgTable(
  'skill_gap_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    careerRoleId: uuid('career_role_id')
      .notNull()
      .references(() => careerRoles.id, { onDelete: 'cascade' }),
    /** 0..100 overall readiness at generation time. */
    readinessScore: integer('readiness_score').notNull().default(0),
    /** Ordered steps: [{ skillId, skillName, currentLevel, targetLevel, weeks, actions[], resources[] }] */
    steps: jsonb('steps').$type<Record<string, unknown>[]>().notNull().default([]),
    totalWeeks: integer('total_weeks').notNull().default(8),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    aiGenerationId: uuid('ai_generation_id'),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('skill_gap_plans_student_idx').on(t.studentId)],
);

/** Certifications and external achievements a student adds; faculty can verify. */
export const studentCertifications = pgTable(
  'student_certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => studentProfiles.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    issuer: text('issuer'),
    issuedOn: date('issued_on'),
    credentialUrl: text('credential_url'),
    skillTags: jsonb('skill_tags').$type<string[]>().default([]),
    verifiedById: uuid('verified_by_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('student_certifications_student_idx').on(t.studentId)],
);
