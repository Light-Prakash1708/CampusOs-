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
  items: NavItem[];
}

export const STUDENT_NAV: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: '/student', icon: 'dashboard' },
      { label: 'My Schedule', href: '/student/schedule', icon: 'calendar' },
      { label: 'Attendance', href: '/student/attendance', icon: 'check' },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Assignments', href: '/student/assignments', icon: 'clipboard' },
      { label: 'Exams & Results', href: '/student/assessments', icon: 'graduation' },
      {
        label: 'Resources',
        href: '/student/resources',
        icon: 'book',
        feature: 'resource_hub_enabled',
      },
      {
        label: 'Skills & Career',
        href: '/student/skills',
        icon: 'target',
        feature: 'skill_engine_enabled',
      },
    ],
  },
  {
    label: 'Campus',
    items: [
      { label: 'Announcements', href: '/student/announcements', icon: 'megaphone' },
      { label: 'Calendar', href: '/student/calendar', icon: 'calendarClock' },
      {
        label: 'Readdressal',
        href: '/student/readdressal',
        icon: 'lifebuoy',
        feature: 'grievance_enabled',
        badgeKey: 'grievances',
      },
    ],
  },
  {
    items: [
      {
        label: 'AI Assistant',
        href: '/student/assistant',
        icon: 'sparkles',
        feature: 'ai_assistant_enabled',
        permissions: ['ai:use_assistant'],
      },
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
      {
        label: 'Readdressal',
        href: '/faculty/readdressal',
        icon: 'lifebuoy',
        feature: 'grievance_enabled',
        badgeKey: 'grievances',
      },
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
      {
        label: 'Assessments',
        href: '/admin/assessments',
        icon: 'clipboard',
        permissions: ['assessment:manage'],
      },
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
      { label: 'Events', href: '/admin/events', icon: 'calendar', feature: 'events_enabled' },
      {
        label: 'Workload',
        href: '/admin/workload',
        icon: 'gauge',
        permissions: ['workload:view_all', 'workload:view_department'],
      },
      {
        label: 'Readdressal',
        href: '/admin/readdressal',
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

/** Bottom navigation for mobile — five destinations maximum. */
export const MOBILE_NAV: Record<
  'student' | 'faculty' | 'admin',
  { label: string; href: string; icon: NavIconKey }[]
> = {
  student: [
    { label: 'Home', href: '/student', icon: 'dashboard' },
    { label: 'Schedule', href: '/student/schedule', icon: 'calendar' },
    { label: 'Alerts', href: '/student/announcements', icon: 'bell' },
    { label: 'AI', href: '/student/assistant', icon: 'sparkles' },
    { label: 'More', href: '/student/more', icon: 'boxes' },
  ],
  faculty: [
    { label: 'Home', href: '/faculty', icon: 'dashboard' },
    { label: 'Schedule', href: '/faculty/schedule', icon: 'calendar' },
    { label: 'Classes', href: '/faculty/classes', icon: 'users' },
    { label: 'Copilot', href: '/faculty/copilot', icon: 'sparkles' },
    { label: 'More', href: '/faculty/more', icon: 'boxes' },
  ],
  admin: [
    { label: 'Home', href: '/admin', icon: 'dashboard' },
    { label: 'Timetable', href: '/admin/timetable', icon: 'calendarClock' },
    { label: 'Notices', href: '/admin/communications', icon: 'megaphone' },
    { label: 'Cases', href: '/admin/readdressal', icon: 'lifebuoy' },
    { label: 'More', href: '/admin/more', icon: 'boxes' },
  ],
};
