import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Central enum definitions for CampusOS.
 *
 * NOTE ON EXTENSIBILITY: roles are modelled as an enum for type-safety at the
 * application boundary, but authorization decisions are made by the permission
 * matrix in `src/lib/auth/permissions.ts`, never by comparing role strings
 * inline. That keeps future roles (HOD, EXAM_CELL, ...) additive.
 */

export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'ADMIN',
  'HOD',
  'DEPARTMENT_ADMIN',
  'EXAM_CELL',
  'FACULTY',
  'STUDENT',
  'COUNSELLOR',
  'IT_SUPPORT',
  'FINANCE',
  'HR',
  'LIBRARY',
  'MANAGEMENT',
  // CampusOS 2.0 — community roles. Usually held as secondary roles by students.
  'CLUB_ADMIN',
  'EVENT_ORGANIZER',
  'CAMPUS_REP',
]);

export const userStatusEnum = pgEnum('user_status', [
  'INVITED',
  /** Self-registered; awaiting email verification and/or institutional approval. */
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'ALUMNI',
  'ARCHIVED',
]);

export const roomTypeEnum = pgEnum('room_type', [
  'CLASSROOM',
  'LAB',
  'SEMINAR_HALL',
  'AUDITORIUM',
  'WORKSHOP',
  'SPORTS',
  'OTHER',
]);

export const dayOfWeekEnum = pgEnum('day_of_week', [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]);

export const slotKindEnum = pgEnum('slot_kind', ['TEACHING', 'BREAK', 'LUNCH', 'ACTIVITY']);

export const subjectKindEnum = pgEnum('subject_kind', [
  'THEORY',
  'LAB',
  'PROJECT',
  'ELECTIVE',
  'SEMINAR',
  'INTERNSHIP',
]);

export const timetableStatusEnum = pgEnum('timetable_status', [
  'DRAFT',
  'PROPOSED',
  'PUBLISHED',
  'ARCHIVED',
]);

export const attendanceStatusEnum = pgEnum('attendance_status', [
  'PRESENT',
  'ABSENT',
  'LATE',
  'EXCUSED',
  'MEDICAL',
]);

export const attendanceSessionStatusEnum = pgEnum('attendance_session_status', [
  'SCHEDULED',
  'OPEN',
  'SUBMITTED',
  'LOCKED',
  'CANCELLED',
]);

export const assignmentStatusEnum = pgEnum('assignment_status', [
  'DRAFT',
  'PUBLISHED',
  'CLOSED',
  'ARCHIVED',
]);

export const submissionStatusEnum = pgEnum('submission_status', [
  'NOT_SUBMITTED',
  'SUBMITTED',
  'LATE',
  'RESUBMITTED',
  'EVALUATED',
  'RETURNED',
]);

export const assessmentKindEnum = pgEnum('assessment_kind', [
  'INTERNAL',
  'MIDTERM',
  'END_SEMESTER',
  'QUIZ',
  'PRACTICAL',
  'VIVA',
  'PROJECT',
]);

export const announcementCategoryEnum = pgEnum('announcement_category', [
  'ACADEMIC',
  'EXAMINATION',
  'EVENT',
  'ADMINISTRATIVE',
  'HOLIDAY',
  'EMERGENCY',
  'PLACEMENT',
  'FACILITY',
  'GENERAL',
]);

export const announcementPriorityEnum = pgEnum('announcement_priority', [
  'CRITICAL',
  'IMPORTANT',
  'NORMAL',
  'INFORMATIONAL',
]);

/** Official notices carry institutional authority; informational ones do not. */
export const announcementKindEnum = pgEnum('announcement_kind', ['OFFICIAL', 'INFORMATIONAL']);

export const announcementStatusEnum = pgEnum('announcement_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'PUBLISHED',
  'EXPIRED',
  'WITHDRAWN',
  'REJECTED',
]);

export const audienceScopeEnum = pgEnum('audience_scope', [
  'INSTITUTION',
  'CAMPUS',
  'DEPARTMENT',
  'PROGRAM',
  'YEAR',
  'SECTION',
  'COURSE',
  'ROLE',
  'USER',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
  'PUSH',
  'SMS',
  'WHATSAPP',
]);

export const changeKindEnum = pgEnum('change_kind', [
  'TIMETABLE_CHANGED',
  'ROOM_CHANGED',
  'FACULTY_CHANGED',
  'CLASS_CANCELLED',
  'EXAM_RESCHEDULED',
  'DEADLINE_CHANGED',
  'EVENT_MOVED',
  'HOLIDAY_DECLARED',
  'ATTENDANCE_CORRECTED',
  'CALENDAR_UPDATED',
  'POLICY_UPDATED',
]);

export const eventStatusEnum = pgEnum('event_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'CANCELLED',
  'COMPLETED',
]);

export const grievanceStatusEnum = pgEnum('grievance_status', [
  'SUBMITTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'UNDER_REVIEW',
  'AWAITING_INFORMATION',
  'RESOLUTION_PROPOSED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'WITHDRAWN',
]);

export const grievanceUrgencyEnum = pgEnum('grievance_urgency', [
  'LOW',
  'NORMAL',
  'HIGH',
  'CRITICAL',
]);

export const approvalStatusEnum = pgEnum('approval_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
]);

export const approvalKindEnum = pgEnum('approval_kind', [
  'TIMETABLE_CHANGE',
  'ANNOUNCEMENT_PUBLISH',
  'LEAVE_REQUEST',
  'EVENT_CREATE',
  'ATTENDANCE_CORRECTION',
  'GRIEVANCE_RESOLUTION',
  'RESOURCE_PUBLISH',
  'DATA_IMPORT',
  'EMERGENCY_BROADCAST',
]);

export const leaveStatusEnum = pgEnum('leave_status', [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);

export const resourceKindEnum = pgEnum('resource_kind', [
  'DOCUMENT',
  'SLIDES',
  'SPREADSHEET',
  'VIDEO',
  'LINK',
  'IMAGE',
  'NOTES',
  'QUESTION_BANK',
  'LESSON_PLAN',
  'OTHER',
]);

export const resourceStatusEnum = pgEnum('resource_status', [
  'DRAFT',
  'AI_GENERATED_PENDING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
]);

export const skillLevelSourceEnum = pgEnum('skill_level_source', [
  'ASSESSMENT',
  'ASSIGNMENT',
  'PROJECT',
  'CERTIFICATION',
  'SELF_ASSESSMENT',
  'FACULTY_ASSESSMENT',
  'COURSE_OUTCOME',
]);

export const workloadKindEnum = pgEnum('workload_kind', [
  'TEACHING',
  'LAB',
  'ASSESSMENT',
  'ADMINISTRATIVE',
  'MENTORING',
  'MEETING',
  'EXAM_DUTY',
  'RESEARCH',
  'OTHER',
]);

export const aiFeatureEnum = pgEnum('ai_feature', [
  'CAMPUS_ASSISTANT',
  'TEACHER_COPILOT',
  'STUDENT_ASSISTANT',
  'TIMETABLE_NL',
  'RESOURCE_GENERATION',
  'SKILL_GAP',
  'COMMUNICATION_DRAFT',
  'GRIEVANCE_CLASSIFY',
  'ANALYTICS_EXPLAIN',
  'ASSIGNMENT_ANALYSIS',
]);

export const aiActionStatusEnum = pgEnum('ai_action_status', [
  'PROPOSED',
  'AWAITING_APPROVAL',
  'APPROVED',
  'EXECUTED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
]);

export const importStatusEnum = pgEnum('import_status', [
  'UPLOADED',
  'VALIDATING',
  'VALIDATED',
  'FAILED_VALIDATION',
  'IMPORTING',
  'COMPLETED',
  'FAILED',
  'ROLLED_BACK',
]);

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
]);

/* --------------------------- CampusOS 2.0 ---------------------------------- */

/** Single-use, hashed, expiring tokens delivered out-of-band (email). */
export const authTokenPurposeEnum = pgEnum('auth_token_purpose', [
  'PASSWORD_RESET',
  'EMAIL_VERIFY',
  'INVITE',
]);

export const deliveryStatusEnum = pgEnum('delivery_status', [
  'QUEUED',
  'SENT',
  'FAILED',
  /** Deliberately not sent (preference, quiet hours, throttle, provider off). Reason recorded. */
  'SKIPPED',
]);

export const fileScanStatusEnum = pgEnum('file_scan_status', [
  'PENDING',
  'CLEAN',
  'INFECTED',
  /** No scanner configured — recorded honestly rather than claiming CLEAN. */
  'NOT_SCANNED',
]);

export const leaderboardVisibilityEnum = pgEnum('leaderboard_visibility', [
  'PUBLIC',
  'ANONYMOUS',
  'PRIVATE',
  'OPT_OUT',
]);

export const dataRequestStatusEnum = pgEnum('data_request_status', [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'FAILED',
  'EXPIRED',
]);
