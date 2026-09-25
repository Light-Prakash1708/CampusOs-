/**
 * DATA CATALOGUE — what CampusOS stores about a student, and why.
 * ---------------------------------------------------------------------------
 * This is the single source for the Privacy Center ("Stored / Used for /
 * Visible to / Can be disabled?") and for the default retention policies
 * seeded per institution. If a module starts storing a new kind of personal
 * data, it must be added here — a test asserts every category is complete.
 *
 * Framing follows India's DPDP Act, 2023: the institution is the Data
 * Fiduciary for academic records; CampusOS processes them on its behalf.
 * Retention figures are defaults an institution may shorten, not legal advice.
 */

export interface DataCategory {
  key: string;
  label: string;
  stored: string[];
  usedFor: string[];
  visibleTo: string[];
  /** Whether the student can switch collection/processing off. */
  canDisable: 'no' | 'partly' | 'yes';
  disableNote: string;
  owner: 'Institution' | 'Student';
  /** Null = retained while the account exists. */
  retentionDays: number | null;
  retentionNote: string;
  deletionPolicy: string;
  exportPolicy: string;
  /** Module feature flag; the category is shown only when relevant. */
  feature?: string;
}

export const DATA_CATEGORIES: DataCategory[] = [
  {
    key: 'account',
    label: 'Account',
    stored: ['Name, email and phone', 'Role and department', 'Sign-in history (device, IP address, time)', 'Password (as a one-way hash only)'],
    usedFor: ['Signing you in and keeping your account secure', 'Showing your name to classmates and teachers'],
    visibleTo: ['You', 'Your institution’s administrators'],
    canDisable: 'no',
    disableNote: 'Needed for the account to exist.',
    owner: 'Institution',
    retentionDays: null,
    retentionNote: 'While your account exists; sign-in history for 180 days.',
    deletionPolicy: 'On approved account deletion the profile is anonymised; security logs are kept for their retention period.',
    exportPolicy: 'Included in your data export (excluding the password hash).',
  },
  {
    key: 'academic',
    label: 'Academic',
    stored: ['Programme, year and section', 'Enrolments and timetable', 'Assignment submissions and grades', 'Exam results'],
    usedFor: ['Running your courses', 'Results and transcripts issued by your institution'],
    visibleTo: ['You', 'Your teachers', 'Academic administrators'],
    canDisable: 'no',
    disableNote: 'Your institution is required to keep academic records.',
    owner: 'Institution',
    retentionDays: null,
    retentionNote: 'As required by your institution and university regulations.',
    deletionPolicy: 'Not deletable on request — statutory academic record.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'attendance',
    label: 'Attendance',
    stored: ['Each class you were marked present or absent for', 'Your per-subject and overall percentage'],
    usedFor: ['Eligibility rules set by your institution', 'Your Attendance Planner', 'Early warnings if you are at risk'],
    visibleTo: ['You', 'Your teachers', 'Academic administrators'],
    canDisable: 'no',
    disableNote: 'Attendance is an institutional record. It is never shown on leaderboards or public profiles.',
    owner: 'Institution',
    retentionDays: null,
    retentionNote: 'As required by your institution.',
    deletionPolicy: 'Not deletable on request — institutional record.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'personal_tracking',
    label: 'Personal tracking',
    stored: ['Habits and check-ins you log', 'Focus sessions and notes you create'],
    usedFor: ['Your own progress charts and streaks'],
    visibleTo: ['Only you'],
    canDisable: 'yes',
    disableNote: 'Entirely optional. You can delete it all at any time.',
    owner: 'Student',
    retentionDays: null,
    retentionNote: 'Until you delete it.',
    deletionPolicy: 'Deleted immediately when you ask.',
    exportPolicy: 'Included in your data export.',
    feature: 'personal_tracker_enabled',
  },
  {
    key: 'goals',
    label: 'Goals',
    stored: ['Goals you set and whether you completed them'],
    usedFor: ['Reminders and progress you asked for', 'AI Coach suggestions, only if you allow it'],
    visibleTo: ['Only you (private by default)'],
    canDisable: 'yes',
    disableNote: 'Optional. Delete any goal, or all personal data, at any time.',
    owner: 'Student',
    retentionDays: null,
    retentionNote: 'Until you delete it.',
    deletionPolicy: 'Deleted immediately when you ask.',
    exportPolicy: 'Included in your data export.',
    feature: 'personal_tracker_enabled',
  },
  {
    key: 'events',
    label: 'Events',
    stored: ['Events you registered for, attended or saved', 'Certificates issued to you'],
    usedFor: ['Registration, check-in and certificates', 'Event recommendations, if personalisation is on'],
    visibleTo: ['You', 'The event’s organisers', 'Others only if you make participation public'],
    canDisable: 'partly',
    disableNote: 'You can hide your participation from your profile and turn off recommendations.',
    owner: 'Student',
    retentionDays: 3 * 365,
    retentionNote: '3 years after the event; certificates for as long as your account exists.',
    deletionPolicy: 'Deleted with your account; organisers keep attendance counts without your identity.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'ai',
    label: 'AI assistant',
    stored: ['Questions you ask and the answers', 'Optional AI memory (study and planning preferences)'],
    usedFor: ['Answering from your own campus records', 'Remembering preferences only if you turn AI Memory on'],
    visibleTo: ['Only you', 'Usage totals (not content) are visible to administrators for cost control'],
    canDisable: 'yes',
    disableNote: 'AI Memory is off by default. You can clear it at any time.',
    owner: 'Student',
    retentionDays: 365,
    retentionNote: 'Conversations for 1 year; memory until you clear it.',
    deletionPolicy: 'AI memory deleted immediately on request.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    stored: ['Notices sent to you and whether you read or acknowledged them', 'Your channel and quiet-hour preferences', 'Device tokens for push notifications'],
    usedFor: ['Delivering notices on the channels you chose', 'Showing staff who has not yet seen a critical notice'],
    visibleTo: ['You', 'The sender sees read/acknowledged status for their notice'],
    canDisable: 'partly',
    disableNote: 'You choose channels and categories. Emergency broadcasts marked mandatory by your institution reach every channel.',
    owner: 'Institution',
    retentionDays: 365,
    retentionNote: '1 year.',
    deletionPolicy: 'Deleted after the retention period.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard & gamification',
    stored: ['XP earned from verified activity', 'Streaks and badges'],
    usedFor: ['Your progress view', 'Leaderboards, only if you opt in'],
    visibleTo: ['Only you by default', 'Classmates only if you choose public or anonymous participation'],
    canDisable: 'yes',
    disableNote: 'Private by default. Attendance, grades and private goals are never used or shown.',
    owner: 'Student',
    retentionDays: null,
    retentionNote: 'While your account exists.',
    deletionPolicy: 'Deleted with your account.',
    exportPolicy: 'Included in your data export.',
    feature: 'gamification_enabled',
  },
  {
    key: 'tool_usage',
    label: 'Tool usage',
    stored: ['How many times you opened each tool in Tools & Utilities, and when you last did'],
    usedFor: ['Putting the tools you use most at the top of your Tools page'],
    visibleTo: ['Only you'],
    canDisable: 'no',
    disableNote: 'A counter per tool, not a history of what you did. Nobody else can see it.',
    owner: 'Student',
    retentionDays: null,
    retentionNote: 'While your account exists.',
    deletionPolicy: 'Deleted with your account.',
    exportPolicy: 'Included in your data export.',
  },
  {
    key: 'library',
    label: 'Library',
    stored: ['Books borrowed, due dates, renewals and fines', 'Reservations and wishlist'],
    usedFor: ['Running loans and returns', 'Reading streaks, only if you turn them on'],
    visibleTo: ['You', 'Library staff'],
    canDisable: 'partly',
    disableNote: 'Loans are an institutional record; reading history is never shown to others without your consent.',
    owner: 'Institution',
    retentionDays: 2 * 365,
    retentionNote: '2 years after a loan closes (outstanding fines until settled).',
    deletionPolicy: 'Closed loans deleted after the retention period.',
    exportPolicy: 'Included in your data export.',
    feature: 'library_enabled',
  },
];

/** Consent purposes and the preference each one mirrors. Version bumps when the notice text changes. */
export const CONSENT_NOTICE_VERSION = '2026-09-v1';

export const CONSENT_PURPOSES = {
  personalized_recommendations: 'Use my interests and activity to recommend events, resources and opportunities',
  ai_memory: 'Let the AI assistant remember my study and planning preferences',
  leaderboard_participation: 'Include me on leaderboards (publicly or anonymously)',
  public_streaks: 'Show my streaks on my profile',
  public_event_participation: 'Show events I attended on my profile',
} as const;

export type ConsentPurpose = keyof typeof CONSENT_PURPOSES | `ai_coach:${string}`;

/** Data the AI Coach may read, each only with the student's permission. */
export const AI_COACH_SCOPES = ['timetable', 'attendance', 'assignments', 'goals', 'events', 'skills'] as const;
export type AiCoachScope = (typeof AI_COACH_SCOPES)[number];
