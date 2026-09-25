import type { NavIconKey } from './icons';
import type { Permission } from '@/lib/auth/permissions';
import type { FeatureFlag } from '@/lib/features';

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconKey;
  /** Hidden unless the user holds at least one of these. */
  permissions?: Permission[];
  /** Hidden unless the tenant has the module enabled. */
  feature?: FeatureFlag;
  /** Rendered as a "coming soon" state rather than a dead link. */
  unavailable?: boolean;
  badgeKey?: 'notifications' | 'grievances' | 'approvals' | 'pendingGrading';
}

export interface NavGroup {
  label?: string;
  /** 'bottom' groups are pinned above the user card (Profile, Settings). */
  position?: 'bottom';
  items: NavItem[];
}

/**
 * Student navigation (CampusOS 2.0 information architecture).
 * Modules that are not enabled for the institution are hidden, never shown
 * as dead links.
 */
export const STUDENT_NAV: NavGroup[] = [
  {
    items: [
      { label: 'Home', href: '/student', icon: 'home' },
      { label: 'Schedule', href: '/student/schedule', icon: 'calendar' },
      { label: 'Attendance', href: '/student/attendance', icon: 'check' },
      { label: 'Assignments', href: '/student/assignments', icon: 'clipboard' },
      { label: 'Events', href: '/student/events', icon: 'ticket', feature: 'events_enabled' },
      { label: 'Communities', href: '/student/communities', icon: 'users', feature: 'clubs_enabled' },
      { label: 'Library', href: '/student/library', icon: 'library', feature: 'resource_hub_enabled' },
      { label: 'Opportunities', href: '/student/opportunities', icon: 'briefcase', feature: 'opportunity_hub_enabled' },
      { label: 'Tools & Utilities', href: '/tools', icon: 'tools' },
      { label: 'Career', href: '/student/skills', icon: 'career', feature: 'skill_engine_enabled' },
      { label: 'Tracker', href: '/student/tracker', icon: 'tracker', feature: 'personal_tracker_enabled' },
      { label: 'Progress', href: '/student/progress', icon: 'trophy', feature: 'gamification_enabled' },
      {
        label: 'AI Assistant',
        href: '/student/assistant',
        icon: 'sparkles',
        feature: 'ai_assistant_enabled',
        permissions: ['ai:use_assistant'],
      },
    ],
  },
  {
    label: 'Campus',
    items: [
      { label: 'Notices', href: '/student/announcements', icon: 'megaphone' },
      { label: 'Exams & Results', href: '/student/assessments', icon: 'graduation' },
      { label: 'Calendar', href: '/student/calendar', icon: 'calendarClock' },
      { label: 'Certificates', href: '/student/certificates', icon: 'shield', feature: 'events_enabled' },
      { label: 'Host an event', href: '/organize', icon: 'plus', feature: 'events_enabled', permissions: ['event:create'] },
      {
        label: 'Redressal',
        href: '/student/redressal',
        icon: 'lifebuoy',
        feature: 'grievance_enabled',
        badgeKey: 'grievances',
      },
    ],
  },
  {
    position: 'bottom',
    items: [
      { label: 'Profile', href: '/student/profile', icon: 'user' },
      { label: 'Settings', href: '/student/settings', icon: 'settings' },
    ],
  },
];

export const FACULTY_NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/faculty', icon: 'dashboard' },
      { label: 'My Schedule', href: '/faculty/schedule', icon: 'calendar' },
      { label: 'My Classes', href: '/faculty/classes', icon: 'users' },
    ],
  },
  {
    label: 'Teaching',
    items: [
      { label: 'Attendance', href: '/faculty/attendance', icon: 'check', permissions: ['attendance:mark'] },
      {
        label: 'Assignments',
        href: '/faculty/assignments',
        icon: 'clipboard',
        permissions: ['assignment:create'],
        badgeKey: 'pendingGrading',
      },
      {
        label: 'Resources',
        href: '/faculty/resources',
        icon: 'book',
        feature: 'resource_hub_enabled',
      },
      {
        label: 'Teaching Copilot',
        href: '/faculty/copilot',
        icon: 'sparkles',
        feature: 'teacher_copilot_enabled',
        permissions: ['ai:use_copilot'],
      },
    ],
  },
  {
    label: 'Workload',
    items: [
      { label: 'My Workload', href: '/faculty/workload', icon: 'gauge', permissions: ['workload:view_own'] },
      { label: 'Leave', href: '/faculty/leave', icon: 'file', permissions: ['leave:request'] },
    ],
  },
  {
    label: 'Campus',
    items: [
      { label: 'Announcements', href: '/faculty/announcements', icon: 'megaphone' },
      { label: 'Calendar', href: '/faculty/calendar', icon: 'calendarClock' },
      { label: 'Organise events', href: '/organize', icon: 'ticket', feature: 'events_enabled', permissions: ['event:create'] },
      {
        label: 'Redressal',
        href: '/faculty/redressal',
        icon: 'lifebuoy',
        feature: 'grievance_enabled',
        badgeKey: 'grievances',
      },
    ],
  },
  {
    position: 'bottom',
    items: [
      { label: 'Profile', href: '/faculty/profile', icon: 'user' },
      { label: 'Settings', href: '/faculty/settings', icon: 'settings' },
    ],
  },
];

export const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
      {
        label: 'Approvals',
        href: '/admin/approvals',
        icon: 'shield',
        badgeKey: 'approvals',
      },
    ],
  },
  {
    label: 'People',
    items: [
      { label: 'Students', href: '/admin/students', icon: 'graduation', permissions: ['user:view_all'] },
      { label: 'Faculty', href: '/admin/faculty', icon: 'userCog', permissions: ['user:view_all'] },
      {
        label: 'Access & Privacy',
        href: '/admin/access',
        icon: 'users',
        permissions: ['user:invite', 'user:approve_registration', 'privacy:handle_requests'],
      },
    ],
  },
  {
    label: 'Academics',
    items: [
      {
        label: 'Structure',
        href: '/admin/structure',
        icon: 'building',
        permissions: ['academic:view_structure'],
      },
      { label: 'Subjects', href: '/admin/subjects', icon: 'boxes', permissions: ['academic:view_structure'] },
      { label: 'Rooms & Labs', href: '/admin/rooms', icon: 'door', permissions: ['room:view'] },
      {
        label: 'Timetable',
        href: '/admin/timetable',
        icon: 'calendarClock',
        permissions: ['timetable:view_all'],
      },
      // v1 listed "Assessments" → /admin/assessments here, but that page never
      // existed (a 404). Removed in Phase 1; an admin exam-scheduling screen is
      // tracked in docs/CAMPUSOS_PRODUCT_AUDIT.md. tests/phase1-tools.test.ts
      // now fails the build if any nav entry points at a missing page.
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Communications',
        href: '/admin/communications',
        icon: 'megaphone',
        permissions: ['announcement:create_official', 'announcement:create_informational'],
      },
      { label: 'Events', href: '/admin/events', icon: 'ticket', feature: 'events_enabled', permissions: ['event:approve', 'event:create'] },
      {
        label: 'Workload',
        href: '/admin/workload',
        icon: 'gauge',
        permissions: ['workload:view_all', 'workload:view_department'],
      },
      {
        label: 'Redressal',
        href: '/admin/redressal',
        icon: 'lifebuoy',
        feature: 'grievance_enabled',
        permissions: ['grievance:view_all', 'grievance:view_assigned'],
        badgeKey: 'grievances',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        label: 'Analytics',
        href: '/admin/analytics',
        icon: 'chart',
        permissions: ['analytics:view_institution', 'analytics:view_department'],
        feature: 'advanced_analytics_enabled',
      },
      {
        label: 'AI Assistant',
        href: '/admin/assistant',
        icon: 'sparkles',
        feature: 'ai_assistant_enabled',
        permissions: ['ai:use_assistant'],
      },
      { label: 'Reports', href: '/admin/reports', icon: 'file', permissions: ['report:generate'] },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Data Import', href: '/admin/import', icon: 'upload', permissions: ['data:import'] },
      { label: 'Audit Log', href: '/admin/audit', icon: 'scroll', permissions: ['audit:view'] },
      {
        label: 'Settings',
        href: '/admin/settings',
        icon: 'settings',
        permissions: ['institution:view_settings'],
      },
    ],
  },
];

export function navForPortal(portal: 'student' | 'faculty' | 'admin'): NavGroup[] {
  if (portal === 'student') return STUDENT_NAV;
  if (portal === 'faculty') return FACULTY_NAV;
  return ADMIN_NAV;
}

/**
 * Bottom navigation for mobile — five slots maximum. `kind: 'create'` renders
 * the central ＋ button that opens the quick-create sheet; `href: '#menu'`
 * opens the full navigation drawer. Items whose module is disabled fall back
 * to `fallback` so the bar never shows a dead destination.
 */
export interface MobileNavItem {
  label: string;
  href: string;
  icon: NavIconKey;
  kind?: 'create';
  feature?: FeatureFlag;
  fallback?: { label: string; href: string; icon: NavIconKey };
}

export const MOBILE_NAV: Record<'student' | 'faculty' | 'admin', MobileNavItem[]> = {
  student: [
    { label: 'Home', href: '/student', icon: 'home' },
    {
      label: 'Explore',
      href: '/student/events',
      icon: 'compass',
      feature: 'events_enabled',
      fallback: { label: 'Schedule', href: '/student/schedule', icon: 'calendar' },
    },
    { label: 'Create', href: '#create', icon: 'plus', kind: 'create' },
    {
      label: 'Tracker',
      href: '/student/tracker',
      icon: 'tracker',
      feature: 'personal_tracker_enabled',
      fallback: { label: 'Notices', href: '/student/announcements', icon: 'megaphone' },
    },
    { label: 'Profile', href: '/student/profile', icon: 'user' },
  ],
  faculty: [
    { label: 'Home', href: '/faculty', icon: 'home' },
    { label: 'Schedule', href: '/faculty/schedule', icon: 'calendar' },
    { label: 'Classes', href: '/faculty/classes', icon: 'users' },
    { label: 'Copilot', href: '/faculty/copilot', icon: 'sparkles', feature: 'teacher_copilot_enabled' },
    { label: 'Menu', href: '#menu', icon: 'boxes' },
  ],
  admin: [
    { label: 'Home', href: '/admin', icon: 'home' },
    { label: 'Timetable', href: '/admin/timetable', icon: 'calendarClock' },
    { label: 'Notices', href: '/admin/communications', icon: 'megaphone' },
    { label: 'Cases', href: '/admin/redressal', icon: 'lifebuoy' },
    { label: 'Menu', href: '#menu', icon: 'boxes' },
  ],
};

/** Quick-create sheet (mobile ＋). Only actions that really exist are offered. */
export interface QuickCreateItem {
  label: string;
  description: string;
  href: string;
  icon: NavIconKey;
  feature?: FeatureFlag;
  permissions?: Permission[];
  /**
   * Not built yet: shown in the menu as "Coming in Phase N", never as a link.
   * (An item whose `feature` is an unbuilt module gets the same treatment.)
   */
  plannedPhase?: number;
}

/** A quick-create entry as the shell renders it. `planned` set ⇒ not a link. */
export interface QuickCreateEntry extends Omit<QuickCreateItem, 'feature' | 'permissions' | 'plannedPhase'> {
  planned: string | null;
}

export const QUICK_CREATE: Record<'student' | 'faculty' | 'admin', QuickCreateItem[]> = {
  student: [
    { label: 'Ask AI', description: 'Plans, notices, topics — from your own records', href: '/student/assistant', icon: 'sparkles', feature: 'ai_assistant_enabled', permissions: ['ai:use_assistant'] },
    { label: 'Create event', description: 'For your club or class — goes live after approval', href: '/organize/new', icon: 'ticket', feature: 'events_enabled', permissions: ['event:create'] },
    { label: 'Explore events', description: 'Fests, hackathons, workshops', href: '/student/events', icon: 'compass', feature: 'events_enabled' },
    { label: 'Raise a request', description: 'Complaint or help request', href: '/student/redressal/new', icon: 'lifebuoy', feature: 'grievance_enabled' },
    { label: 'Create goal', description: 'Something small you want to improve', href: '/student/tracker/goals/new', icon: 'target', feature: 'personal_tracker_enabled' },
    { label: 'Add task', description: 'A to-do for today', href: '/student/tracker?add=task', icon: 'check', feature: 'personal_tracker_enabled' },
    { label: 'Save resource', description: 'Bookmark notes and PYQs', href: '/student/resources', icon: 'bookmark', plannedPhase: 6 },
    { label: 'Upload document', description: 'Into your private document storage', href: '/student/documents', icon: 'folder', plannedPhase: 6 },
  ],
  faculty: [
    { label: 'Mark attendance', description: 'For your current class', href: '/faculty/attendance', icon: 'check', permissions: ['attendance:mark'] },
    { label: 'New assignment', description: 'Create and publish', href: '/faculty/assignments/new', icon: 'clipboard', permissions: ['assignment:create'] },
    { label: 'Post a notice', description: 'To your classes', href: '/faculty/announcements', icon: 'megaphone' },
  ],
  admin: [
    { label: 'New notice', description: 'Targeted announcement', href: '/admin/communications/new', icon: 'megaphone', permissions: ['announcement:create_official', 'announcement:create_informational'] },
    { label: 'Invite someone', description: 'Student, faculty or staff', href: '/admin/access', icon: 'users', permissions: ['user:invite'] },
  ],
};
