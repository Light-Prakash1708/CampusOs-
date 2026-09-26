import type { Permission } from '@/lib/auth/permissions';
import { isBuilt, isEnabled, plannedLabel, type FeatureFlag } from '@/lib/features';

/**
 * TOOLS & UTILITIES REGISTRY
 * ---------------------------------------------------------------------------
 * The single list behind /tools, GET /api/tools and usage tracking. Pure and
 * framework-free so it is unit-tested and shared by server and client.
 *
 * A tool is exactly one of:
 *   AVAILABLE  — built, enabled for the college, and the user may use it:
 *                its CTA navigates to a working page.
 *   PLANNED    — not built yet: shown with "Coming in Phase N", no link.
 *   DISABLED   — built, but the college has switched the module off:
 *                shown only as "Off at your college", no link.
 * Tools the user lacks permission for are omitted entirely.
 *
 * When a tool ships, set its `href` and remove `plannedPhase` in the same
 * commit that builds the page. The registry test fails if an AVAILABLE tool
 * has no href.
 */

export type ToolIconKey =
  | 'attendance' | 'timetable' | 'jobs' | 'events' | 'calculator' | 'documents'
  | 'subjects' | 'reminders' | 'notes' | 'planner' | 'cgpa' | 'rooms'
  | 'assistant' | 'certificates' | 'host' | 'goals';

export type ToolTone = 'mint' | 'sky' | 'lavender' | 'sun' | 'coral' | 'peach' | 'rose';

export interface ToolDefinition {
  key: string;
  title: string;
  /** Card copy. Describes what the tool does today, never what it might do. */
  description: string;
  icon: ToolIconKey;
  tone: ToolTone;
  /** Large card on the hub (the mockup's first row). */
  featured?: boolean;
  href?: string;
  cta?: string;
  feature?: FeatureFlag;
  /** User needs at least one of these. */
  permissions?: Permission[];
  /** Roadmap phase that delivers the tool (docs/CAMPUSOS_PRODUCT_AUDIT.md §14). */
  plannedPhase?: number;
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    key: 'attendance',
    title: 'Attendance Tracker',
    description: 'Your real attendance, subject by subject, from the classes your faculty mark. Warned before you dip below the safe line.',
    icon: 'attendance',
    tone: 'mint',
    featured: true,
    href: '/student/attendance',
    cta: 'Open Tracker',
    permissions: ['attendance:view_own'],
  },
  {
    key: 'timetable',
    title: 'Timetable Viewer',
    description: 'Your published weekly schedule with rooms and faculty. Always know what is next and where.',
    icon: 'timetable',
    tone: 'sky',
    featured: true,
    href: '/student/schedule',
    cta: 'View Timetable',
  },
  {
    key: 'opportunities',
    title: 'Internships & Jobs',
    description: 'Internship and job listings your college approved, with source, deadline and eligibility — matched to your skills.',
    icon: 'jobs',
    tone: 'lavender',
    featured: true,
    href: '/student/opportunities',
    cta: 'Browse',
    feature: 'opportunity_hub_enabled',
    permissions: ['opportunity:view'],
  },
  {
    key: 'events',
    title: 'Events',
    description: 'Discover fests, hackathons and workshops at your college and nearby, register, and get your QR pass.',
    icon: 'events',
    tone: 'sun',
    featured: true,
    href: '/student/events',
    cta: 'Browse Events',
    feature: 'events_enabled',
  },
  {
    key: 'attendance-planner',
    title: 'Attendance Planner',
    description: 'Bunk Calculator: set a target and see your safe buffer, the classes you need to recover, and what each absence does to your %.',
    icon: 'calculator',
    tone: 'coral',
    href: '/tools/attendance-planner',
    cta: 'Open Planner',
    feature: 'attendance_planner_enabled',
    permissions: ['attendance:view_own'],
  },
  {
    key: 'subject-attendance',
    title: 'Subject-wise View',
    description: 'Attendance for each subject, not just the total — with how many classes you need to recover.',
    icon: 'subjects',
    tone: 'sky',
    href: '/student/attendance?view=subjects#subjects',
    cta: 'Open',
    permissions: ['attendance:view_own'],
  },
  {
    key: 'notes',
    title: 'Notes & Resources',
    description: 'Notes, slides and question banks your faculty have published, searchable by subject.',
    icon: 'notes',
    tone: 'peach',
    href: '/student/resources',
    cta: 'Open',
    feature: 'resource_hub_enabled',
  },
  {
    key: 'pyqs',
    title: 'PYQs',
    description: 'Previous years’ question papers and question banks your faculty share, by subject. Save the ones you need.',
    icon: 'notes',
    tone: 'rose',
    href: '/student/library?tab=pyqs',
    cta: 'Open PYQs',
    feature: 'resource_hub_enabled',
    permissions: ['resource:view_department'],
  },
  {
    key: 'documents',
    title: 'Document Storage',
    description: 'Keep marksheets, certificates and your resume in private folders with expiring share links.',
    icon: 'documents',
    tone: 'mint',
    plannedPhase: 10,
  },
  {
    key: 'reminders',
    title: 'Smart Reminders',
    description: 'Nudges before class, before deadlines, and when a subject’s attendance needs attention.',
    icon: 'reminders',
    tone: 'lavender',
    plannedPhase: 10,
  },
  {
    key: 'tracker',
    title: 'Goals & Habits',
    description: 'Private goals, daily or weekly habits with streaks, milestone steps and a to-do list. Only you can see it.',
    icon: 'goals',
    tone: 'peach',
    href: '/student/tracker',
    cta: 'Open Tracker',
    feature: 'personal_tracker_enabled',
  },
  {
    key: 'rooms',
    title: 'Room Finder',
    description: 'Find any room by code or name: building, floor, whether it is free now, and its next class.',
    icon: 'rooms',
    tone: 'sun',
    plannedPhase: 10,
  },
  {
    key: 'study-planner',
    title: 'Study Planner',
    description: 'A realistic revision plan built from your exams, timetable and free hours.',
    icon: 'planner',
    tone: 'peach',
    plannedPhase: 10,
  },
  {
    key: 'cgpa',
    title: 'CGPA Calculator',
    description: 'SGPA and CGPA on your college’s grading scale, and what you need next semester to hit a target.',
    icon: 'cgpa',
    tone: 'sky',
    plannedPhase: 10,
  },
  {
    key: 'assistant',
    title: 'AI Assistant',
    description: 'Ask about your schedule, attendance, assignments and notices — answered from your own records.',
    icon: 'assistant',
    tone: 'lavender',
    href: '/student/assistant',
    cta: 'Ask AI',
    feature: 'ai_assistant_enabled',
    permissions: ['ai:use_assistant'],
  },
  {
    key: 'certificates',
    title: 'Certificates',
    description: 'Certificates from events you attended, each with a public verification ID.',
    icon: 'certificates',
    tone: 'mint',
    href: '/student/certificates',
    cta: 'Open wallet',
    feature: 'events_enabled',
  },
  {
    key: 'host-event',
    title: 'Host an Event',
    description: 'Create an event for your club or class. It goes live after your college approves it.',
    icon: 'host',
    tone: 'coral',
    href: '/organize/new',
    cta: 'Create event',
    feature: 'events_enabled',
    permissions: ['event:create'],
  },
];

export const TOOL_KEYS = new Set(TOOLS.map((t) => t.key));

export type ToolStatus = 'AVAILABLE' | 'PLANNED' | 'DISABLED';

export interface ResolvedTool extends ToolDefinition {
  status: ToolStatus;
  /** "Coming in Phase 5" or "Off at your college"; null when available. */
  statusLabel: string | null;
  openCount: number;
}

export interface ToolViewer {
  featureFlags: Record<string, boolean> | undefined;
  permissions: Set<string>;
}

export function resolveTool(tool: ToolDefinition, viewer: ToolViewer, openCount = 0): ResolvedTool | null {
  if (tool.permissions && !tool.permissions.some((p) => viewer.permissions.has(p))) return null;
  if (tool.plannedPhase !== undefined || (tool.feature && !isBuilt(tool.feature))) {
    const label = tool.plannedPhase !== undefined ? `Coming in Phase ${tool.plannedPhase}` : plannedLabel(tool.feature!)!;
    return { ...tool, href: undefined, status: 'PLANNED', statusLabel: label, openCount: 0 };
  }
  if (tool.feature && !isEnabled(viewer.featureFlags, tool.feature)) {
    return { ...tool, href: undefined, status: 'DISABLED', statusLabel: 'Off at your college', openCount: 0 };
  }
  return { ...tool, status: 'AVAILABLE', statusLabel: null, openCount };
}

/**
 * Order for the hub. Available tools first, most-opened first (ties keep the
 * registry order, which is the editorial default for a new student); then
 * planned tools by the phase that delivers them; college-disabled last.
 */
export function orderTools(tools: ResolvedTool[]): ResolvedTool[] {
  const rank = { AVAILABLE: 0, PLANNED: 1, DISABLED: 2 } as const;
  const index = new Map(TOOLS.map((t, i) => [t.key, i]));
  return [...tools].sort(
    (a, b) =>
      rank[a.status] - rank[b.status] ||
      b.openCount - a.openCount ||
      (a.plannedPhase ?? 0) - (b.plannedPhase ?? 0) ||
      index.get(a.key)! - index.get(b.key)!,
  );
}

export function toolsFor(viewer: ToolViewer, usage: Record<string, number> = {}): ResolvedTool[] {
  return orderTools(
    TOOLS.map((t) => resolveTool(t, viewer, usage[t.key] ?? 0)).filter((t): t is ResolvedTool => t !== null),
  );
}

/** The student's own most-used tools: opened at least twice, top four. */
export function mostUsed(tools: ResolvedTool[], limit = 4): ResolvedTool[] {
  return tools.filter((t) => t.status === 'AVAILABLE' && t.openCount >= 2).slice(0, limit);
}
