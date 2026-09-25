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
} from 'drizzle-orm/pg-core';
import { institutions } from './tenancy';
import { users } from './people';
import {
  approvalStatusEnum,
  approvalKindEnum,
  aiFeatureEnum,
  aiActionStatusEnum,
  importStatusEnum,
} from './enums';

/**
 * SYSTEM: audit, approvals, AI governance, settings, imports.
 */

/**
 * AUDIT LOG — append-only.
 * The migration revokes UPDATE and DELETE on this table from the application
 * role, so even a compromised app cannot rewrite history. See SECURITY.md.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorRole: text('actor_role'),
    /** Verb in past tense: TIMETABLE_PUBLISHED, ATTENDANCE_CORRECTED, ... */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    beforeValue: jsonb('before_value').$type<Record<string, unknown>>(),
    afterValue: jsonb('after_value').$type<Record<string, unknown>>(),
    reason: text('reason'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** Correlates every row written during one logical operation. */
    requestId: text('request_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_institution_idx').on(t.institutionId, t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_actor_idx').on(t.actorId),
    index('audit_logs_action_idx').on(t.institutionId, t.action),
  ],
);

/**
 * Generic approval workflow. Any sensitive operation creates an approval,
 * stores the exact payload it will execute, and only executes after approval.
 */
export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    kind: approvalKindEnum('kind').notNull(),
    status: approvalStatusEnum('status').notNull().default('PENDING'),
    title: text('title').notNull(),
    description: text('description'),
    /** The exact operation to run on approval — validated again at execution. */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** Human-readable impact summary shown to the approver before they decide. */
    impactSummary: jsonb('impact_summary').$type<Record<string, unknown>>(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Role permitted to approve; resolved against the permission matrix. */
    requiredRole: text('required_role'),
    assignedApproverId: uuid('assigned_approver_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    decidedById: uuid('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    executionError: text('execution_error'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('approvals_institution_status_idx').on(t.institutionId, t.status),
    index('approvals_approver_idx').on(t.assignedApproverId, t.status),
    index('approvals_entity_idx').on(t.entityType, t.entityId),
  ],
);

/**
 * AI GOVERNANCE
 * ---------------------------------------------------------------------------
 * Every AI call is logged with its feature, tokens, estimated cost and whether
 * the output was grounded in institutional records. Every AI-*proposed* state
 * change becomes an `ai_actions` row that a human must approve before it runs.
 */
export const aiGenerations = pgTable(
  'ai_generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    feature: aiFeatureEnum('feature').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** Truncated/redacted prompt kept for debugging; never contains raw PII dumps. */
    promptSummary: text('prompt_summary'),
    /** Tool calls the model made, in order — the audit trail for grounded answers. */
    toolCalls: jsonb('tool_calls').$type<Record<string, unknown>[]>().default([]),
    outputSummary: text('output_summary'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 10, scale: 6 })
      .notNull()
      .default('0'),
    latencyMs: integer('latency_ms'),
    /** False when the model answered without touching institutional data. */
    wasGrounded: boolean('was_grounded').notNull().default(false),
    succeeded: boolean('succeeded').notNull().default(true),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_generations_institution_idx').on(t.institutionId, t.createdAt),
    index('ai_generations_user_idx').on(t.userId),
    index('ai_generations_feature_idx').on(t.institutionId, t.feature),
  ],
);

export const aiActions = pgTable(
  'ai_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    generationId: uuid('generation_id').references(() => aiGenerations.id, { onDelete: 'set null' }),
    requestedById: uuid('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    feature: aiFeatureEnum('feature').notNull(),
    /** Tool/operation the AI wants to perform. */
    operation: text('operation').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    /** What the AI claims will happen — re-verified by the backend before execution. */
    predictedImpact: jsonb('predicted_impact').$type<Record<string, unknown>>(),
    /** Backend verification result. An action cannot execute unless this passed. */
    validationPassed: boolean('validation_passed').notNull().default(false),
    validationNotes: text('validation_notes'),
    status: aiActionStatusEnum('status').notNull().default('PROPOSED'),
    approvalId: uuid('approval_id').references(() => approvals.id, { onDelete: 'set null' }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    executionResult: jsonb('execution_result').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ai_actions_institution_idx').on(t.institutionId, t.status),
    index('ai_actions_user_idx').on(t.requestedById),
  ],
);

/** Conversation threads with the campus assistant, scoped per user. */
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    feature: aiFeatureEnum('feature').notNull().default('CAMPUS_ASSISTANT'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_conversations_user_idx').on(t.userId, t.updatedAt)],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    /** Records this answer was built from — rendered as citations in the UI. */
    citations: jsonb('citations').$type<Record<string, unknown>[]>().default([]),
    toolCalls: jsonb('tool_calls').$type<Record<string, unknown>[]>().default([]),
    generationId: uuid('generation_id').references(() => aiGenerations.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_messages_conversation_idx').on(t.conversationId, t.createdAt)],
);

/** Narrow, user-visible, user-deletable preference memory. Not a memory dump. */
export const aiPreferences = pgTable(
  'ai_preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ai_preferences_uq').on(t.userId, t.key)],
);

/** Key/value institution settings that don't warrant their own column. */
export const systemSettings = pgTable(
  'system_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    description: text('description'),
    updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('system_settings_uq').on(t.institutionId, t.key)],
);

/** CSV/Excel import jobs with validation-before-commit semantics. */
export const importJobs = pgTable(
  'import_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** students | faculty | subjects | rooms | sections | timetable | departments */
    entityType: text('entity_type').notNull(),
    fileName: text('file_name').notNull(),
    status: importStatusEnum('status').notNull().default('UPLOADED'),
    /** Detected header → canonical field mapping, editable by the admin. */
    columnMapping: jsonb('column_mapping').$type<Record<string, string>>().default({}),
    totalRows: integer('total_rows').notNull().default(0),
    validRows: integer('valid_rows').notNull().default(0),
    errorRows: integer('error_rows').notNull().default(0),
    importedRows: integer('imported_rows').notNull().default(0),
    skippedRows: integer('skipped_rows').notNull().default(0),
    /** Per-row problems: [{ row, field, message, severity }] */
    validationErrors: jsonb('validation_errors').$type<Record<string, unknown>[]>().default([]),
    /** Parsed payload held between validation and commit. */
    stagedData: jsonb('staged_data').$type<Record<string, unknown>[]>(),
    startedById: uuid('started_by_id').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('import_jobs_institution_idx').on(t.institutionId, t.status)],
);

/**
 * "Time saved" ledger. Values are ESTIMATES with an explicit basis, calibrated
 * per institution. The UI always labels them as estimates. Never presented as
 * measured fact. See PRODUCT_ROADMAP.md §Productivity metrics.
 */
export const timeSavedEvents = pgTable(
  'time_saved_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** LESSON_PLAN | TIMETABLE_SOLVE | BULK_ANNOUNCE | IMPORT | GRIEVANCE_ROUTE | ... */
    activity: text('activity').notNull(),
    estimatedManualMinutes: integer('estimated_manual_minutes').notNull(),
    actualMinutes: integer('actual_minutes').notNull(),
    savedMinutes: integer('saved_minutes').notNull(),
    /** Where the manual baseline came from — shown on hover in the UI. */
    basis: text('basis').notNull().default('DEFAULT_ESTIMATE'),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('time_saved_institution_idx').on(t.institutionId, t.createdAt),
    index('time_saved_user_idx').on(t.userId),
  ],
);

/** Background job queue (DB-backed; no external broker needed for MVP). */
export const jobQueue = pgTable(
  'job_queue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    jobType: text('job_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /** PENDING | RUNNING | COMPLETED | FAILED */
    status: text('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('job_queue_status_idx').on(t.status, t.runAfter)],
);
