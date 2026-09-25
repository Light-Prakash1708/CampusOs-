/**
 * FEATURE FLAGS
 * ---------------------------------------------------------------------------
 * Per-tenant module switches. These exist so different institutions can buy
 * different modules, and so half-finished capabilities can ship dark rather
 * than appearing as dead buttons.
 *
 * Rule enforced across the UI: if a feature is disabled, its navigation entry
 * is hidden entirely — we never render a control that silently does nothing.
 */

export const FEATURE_FLAGS = {
  ai_assistant_enabled: {
    label: 'AI Campus Assistant',
    description: 'Role-aware assistant for students, faculty and administrators.',
    defaultValue: true,
    tier: 'STARTER',
  },
  teacher_copilot_enabled: {
    label: 'Teacher Copilot',
    description: 'Lesson planning, question generation and submission analysis.',
    defaultValue: true,
    tier: 'PROFESSIONAL',
  },
  skill_engine_enabled: {
    label: 'Skill & Employability Engine',
    description: 'Student skill graph, career goals and gap plans.',
    defaultValue: true,
    tier: 'PROFESSIONAL',
  },
  timetable_optimizer_enabled: {
    label: 'Timetable Optimizer',
    description: 'Constraint-based automatic timetable generation.',
    defaultValue: true,
    tier: 'PROFESSIONAL',
  },
  advanced_analytics_enabled: {
    label: 'Advanced Analytics',
    description: 'Utilization, workload balance and productivity analytics.',
    defaultValue: true,
    tier: 'PROFESSIONAL',
  },
  grievance_enabled: {
    label: 'Readdressal Centre',
    description: 'Structured grievance handling with SLA and escalation.',
    defaultValue: true,
    tier: 'STARTER',
  },
  anonymous_grievance_enabled: {
    label: 'Anonymous Reporting',
    description: 'Allows selected grievance categories to be raised anonymously.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  events_enabled: {
    label: 'Events',
    description: 'Institutional event management with conflict checking.',
    defaultValue: true,
    tier: 'STARTER',
  },
  resource_hub_enabled: {
    label: 'Academic Resource Hub',
    description: 'Shared teaching material with tagging and search.',
    defaultValue: true,
    tier: 'STARTER',
  },
  email_enabled: {
    label: 'Email Notifications',
    description: 'Requires an email provider to be configured.',
    defaultValue: false,
    tier: 'STARTER',
  },
  push_enabled: {
    label: 'Push Notifications',
    description: 'Requires a push provider to be configured.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  sms_enabled: {
    label: 'SMS Notifications',
    description: 'Requires an SMS provider to be configured.',
    defaultValue: false,
    tier: 'ENTERPRISE',
  },
  pwa_enabled: {
    label: 'Installable App (PWA)',
    description: 'Lets students install CampusOS on their phone.',
    defaultValue: true,
    tier: 'STARTER',
  },
  virtual_lab_enabled: {
    label: 'Virtual Laboratory',
    description: 'Interactive practical simulations. Module scaffold only in this release.',
    defaultValue: false,
    tier: 'ENTERPRISE',
  },
  overlay_mode_enabled: {
    label: 'ERP Overlay Mode',
    description:
      'Run alongside an existing ERP: import its data on a schedule and take over workflows gradually.',
    defaultValue: true,
    tier: 'PROFESSIONAL',
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export function isEnabled(
  flags: Record<string, boolean> | undefined,
  flag: FeatureFlag,
): boolean {
  if (flags && flag in flags) return flags[flag] === true;
  return FEATURE_FLAGS[flag].defaultValue;
}

export function defaultFlags(): Record<string, boolean> {
  return Object.fromEntries(
    Object.entries(FEATURE_FLAGS).map(([k, v]) => [k, v.defaultValue]),
  );
}

export const TIER_ORDER = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as const;

export function tierIncludes(tier: string, required: string): boolean {
  return TIER_ORDER.indexOf(tier as never) >= TIER_ORDER.indexOf(required as never);
}
