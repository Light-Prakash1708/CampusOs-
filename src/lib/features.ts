/**
 * FEATURE FLAGS
 * ---------------------------------------------------------------------------
 * Per-tenant module switches. These exist so different institutions can buy
 * different modules, and so half-finished capabilities can ship dark rather
 * than appearing as dead buttons.
 *
 * Rule enforced across the UI: if a feature is disabled, its navigation entry
 * is hidden entirely — we never render a control that silently does nothing.
 * Modules that are not built yet can never be enabled (see UNBUILT_MODULES).
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
    label: 'Redressal Centre',
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
  attendance_planner_enabled: {
    label: 'Attendance Planner',
    description: 'Students plan attendance against targets: safe absences, classes needed to recover, what-if simulations. Read-only; never changes official records.',
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
  whatsapp_enabled: {
    label: 'WhatsApp Notifications',
    description: 'Opt-in WhatsApp delivery for critical and important notices. Requires a WhatsApp Business provider.',
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

  /* ------------------------- CampusOS 2.0 modules --------------------------
   * All ship OFF. A module is switched on per tenant once it is built and the
   * institution has chosen it — never shown as a dead button before that.
   */
  library_enabled: {
    label: 'Library',
    description: 'Catalogue, loans, renewals, reservations and fines.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  gamification_enabled: {
    label: 'XP, Levels & Badges',
    description: 'Levels from an append-only XP ledger, badges and weekly challenges. Only verified activity (event check-ins, certificates) can rank anyone.',
    defaultValue: false,
    tier: 'STARTER',
  },
  personal_tracker_enabled: {
    label: 'Personal Tracker',
    description: 'Private goals, habits with streaks, milestone steps and to-dos. Visible only to the student; erasable at any time.',
    defaultValue: false,
    tier: 'STARTER',
  },
  leaderboards_enabled: {
    label: 'Leaderboards',
    description: 'Opt-in leaderboards for your college or section, ranked by verified XP only. Students appear only if they choose to.',
    defaultValue: false,
    tier: 'STARTER',
  },
  clubs_enabled: {
    label: 'Clubs & Communities',
    description: 'Club profiles, membership, announcements and club events.',
    defaultValue: false,
    tier: 'STARTER',
  },
  event_discovery_enabled: {
    label: 'Event Discovery',
    description: 'Discover, register for and check in to events across colleges.',
    defaultValue: false,
    tier: 'STARTER',
  },
  opportunity_hub_enabled: {
    label: 'Opportunity Hub',
    description: 'Internships, hackathons, competitions and scholarships from verified publishers.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  ai_coach_enabled: {
    label: 'AI Coach',
    description: 'Personal planning coach that reads only the data a student permits.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  ai_memory_enabled: {
    label: 'AI Memory',
    description: 'Optional, user-controlled memory of study and planning preferences.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  campus_channels_enabled: {
    label: 'Campus Channels',
    description: 'Structured announcement feeds for classes, clubs and events.',
    defaultValue: false,
    tier: 'STARTER',
  },
  campus_rep_enabled: {
    label: 'Campus Representatives',
    description: 'Student ambassador programme with verified contributions.',
    defaultValue: false,
    tier: 'PROFESSIONAL',
  },
  billing_enabled: {
    label: 'Billing',
    description: 'Plans, subscriptions and invoices for this institution.',
    defaultValue: false,
    tier: 'STARTER',
  },
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * MODULE AVAILABILITY
 * ---------------------------------------------------------------------------
 * A flag may only switch on a module that actually exists. Flags for modules
 * that are not built yet are listed here with the roadmap phase that delivers
 * them (docs/CAMPUSOS_PRODUCT_AUDIT.md §14). For these, `isEnabled` is always
 * false — whatever is stored for the tenant — the settings API refuses to turn
 * them on, and the UI shows "Coming in Phase N" instead of a link. This is what
 * guarantees a flag can never expose a route that 404s.
 *
 * When a module ships, delete its line here in the same commit.
 */
export const UNBUILT_MODULES: Partial<Record<FeatureFlag, number | 'later'>> = {
  clubs_enabled: 4,
  campus_channels_enabled: 4,
  campus_rep_enabled: 4,
  opportunity_hub_enabled: 5,
  library_enabled: 6,
  ai_coach_enabled: 9,
  ai_memory_enabled: 9,
  pwa_enabled: 11,
  whatsapp_enabled: 'later',
  billing_enabled: 'later',
  virtual_lab_enabled: 'later',
};

export function isBuilt(flag: FeatureFlag): boolean {
  return !(flag in UNBUILT_MODULES);
}

/** "Coming in Phase 7" / "Planned" — the label shown wherever the module would appear. */
export function plannedLabel(flag: FeatureFlag): string | null {
  const phase = UNBUILT_MODULES[flag];
  if (phase === undefined) return null;
  return phase === 'later' ? 'Planned' : `Coming in Phase ${phase}`;
}

export function isEnabled(
  flags: Record<string, boolean> | undefined,
  flag: FeatureFlag,
): boolean {
  if (!isBuilt(flag)) return false;
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

export function isFeatureFlag(value: string): value is FeatureFlag {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, value);
}
