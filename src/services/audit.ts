import 'server-only';
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';

/**
 * AUDIT SERVICE
 * ---------------------------------------------------------------------------
 * Every consequential action writes here. The table is append-only at the
 * database level (see drizzle/0001_hard_constraints.sql), so this is a record
 * the institution can actually rely on in a dispute.
 *
 * Audit writes must never break the operation they describe: a failure is
 * logged loudly to the server console but does not throw. Losing an audit row
 * is bad; failing a student's attendance submission because of it is worse.
 */

export type AuditAction =
  | 'USER_LOGIN'
  | 'USER_LOGIN_FAILED'
  | 'USER_LOGOUT'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DEACTIVATED'
  | 'ROLE_CHANGED'
  | 'TIMETABLE_GENERATED'
  | 'TIMETABLE_ENTRY_CREATED'
  | 'TIMETABLE_ENTRY_UPDATED'
  | 'TIMETABLE_ENTRY_DELETED'
  | 'TIMETABLE_PUBLISHED'
  | 'TIMETABLE_WITHDRAWN'
  | 'SCHEDULE_EXCEPTION_CREATED'
  | 'ATTENDANCE_SUBMITTED'
  | 'ATTENDANCE_CORRECTED'
  | 'ANNOUNCEMENT_CREATED'
  | 'ANNOUNCEMENT_PUBLISHED'
  | 'ANNOUNCEMENT_WITHDRAWN'
  | 'EMERGENCY_BROADCAST_SENT'
  | 'EVENT_CREATED'
  | 'EVENT_CANCELLED'
  | 'ASSIGNMENT_CREATED'
  | 'ASSIGNMENT_PUBLISHED'
  | 'SUBMISSION_EVALUATED'
  | 'GRIEVANCE_CREATED'
  | 'GRIEVANCE_STATUS_CHANGED'
  | 'GRIEVANCE_ASSIGNED'
  | 'GRIEVANCE_ESCALATED'
  | 'GRIEVANCE_ANONYMITY_REVEALED'
  | 'LEAVE_REQUESTED'
  | 'LEAVE_DECIDED'
  | 'APPROVAL_DECIDED'
  | 'AI_ACTION_PROPOSED'
  | 'AI_ACTION_EXECUTED'
  | 'AI_ACTION_REJECTED'
  | 'DATA_IMPORTED'
  | 'DATA_EXPORTED'
  | 'SETTINGS_UPDATED'
  | 'ROOM_CREATED'
  | 'ROOM_UPDATED'
  | 'ACADEMIC_STRUCTURE_CHANGED'
  // --- CampusOS 2.0: accounts ---
  | 'USER_REGISTERED'
  | 'USER_INVITED'
  | 'INVITE_ACCEPTED'
  | 'EMAIL_VERIFIED'
  | 'REGISTRATION_APPROVED'
  | 'REGISTRATION_REJECTED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET'
  | 'PASSWORD_CHANGED'
  | 'SESSION_REVOKED'
  | 'SESSIONS_REVOKED_OTHERS'
  // --- CampusOS 2.0: privacy & data governance ---
  | 'PRIVACY_PREFERENCES_CHANGED'
  | 'DATA_EXPORT_REQUESTED'
  | 'DATA_EXPORT_COMPLETED'
  | 'DATA_EXPORT_DOWNLOADED'
  | 'DATA_DELETION_REQUESTED'
  | 'DATA_DELETION_DECIDED'
  | 'PERSONAL_DATA_DELETED'
  // --- CampusOS 2.0: platform ---
  | 'FILE_UPLOADED'
  | 'FILE_DELETED'
  | 'FEATURE_FLAGS_UPDATED'
  | 'REGISTRATION_POLICY_UPDATED'
  // --- CampusOS 2.0: events ---
  | 'EVENT_APPROVED'
  | 'EVENT_REJECTED'
  | 'EVENT_SUSPENDED'
  | 'EVENT_UPDATE_POSTED'
  | 'CERTIFICATES_ISSUED';

export interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export async function recordAudit(
  actor: Pick<AuthContext, 'userId' | 'institutionId' | 'role'> | null,
  input: AuditInput,
  /** Institution id required when there is no actor (e.g. failed login). */
  institutionIdOverride?: string,
): Promise<void> {
  const institutionId = actor?.institutionId ?? institutionIdOverride;
  if (!institutionId) return;

  try {
    await db.insert(auditLogs).values({
      institutionId,
      actorId: actor?.userId ?? null,
      actorRole: actor?.role ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeValue: input.before ?? null,
      afterValue: input.after ?? null,
      reason: input.reason ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (error) {
    console.error('[campusos:audit] failed to write audit record', {
      action: input.action,
      entityType: input.entityType,
      error,
    });
  }
}

/**
 * Redacts fields that must never appear in an audit payload.
 * Audit records are widely readable inside an institution; they should show
 * *what changed*, not dump secrets.
 */
const REDACTED_KEYS = new Set([
  'passwordHash',
  'password',
  'tokenHash',
  'token',
  'secret',
  'apiKey',
  'extractedText',
]);

export function safeSnapshot<T extends Record<string, unknown>>(
  value: T | null | undefined,
  keys?: (keyof T)[],
): Record<string, unknown> | null {
  if (!value) return null;
  const source = keys ? keys.reduce<Record<string, unknown>>((acc, k) => {
    acc[k as string] = value[k];
    return acc;
  }, {}) : value;

  return Object.fromEntries(
    Object.entries(source).map(([k, v]) => [k, REDACTED_KEYS.has(k) ? '[redacted]' : v]),
  );
}
