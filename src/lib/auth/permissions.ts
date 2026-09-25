/**
 * PERMISSION MATRIX
 * ---------------------------------------------------------------------------
 * Authorization in CampusOS is capability-based. Code never asks
 * "is this user an ADMIN?" — it asks "may this user publish official notices?".
 *
 * This keeps future roles (HOD, EXAM_CELL, COUNSELLOR...) purely additive:
 * granting a new role a capability is a data change here, not a refactor of
 * every call site.
 */

export const PERMISSIONS = [
  // --- People & institution ---
  'institution:manage',
  'institution:view_settings',
  'user:create',
  'user:update',
  'user:deactivate',
  'user:view_all',
  'user:view_department',
  'user:impersonate',
  'role:manage',

  // --- Academic structure ---
  'academic:manage_structure', // departments, programs, sections, subjects
  'academic:view_structure',
  'room:manage',
  'room:view',

  // --- Timetable ---
  'timetable:view_own',
  'timetable:view_all',
  'timetable:edit',
  'timetable:generate',
  'timetable:publish',
  'timetable:request_change',
  'timetable:approve_change',

  // --- Attendance ---
  'attendance:mark',
  'attendance:view_own',
  'attendance:view_section',
  'attendance:view_all',
  'attendance:correct',
  'attendance:approve_correction',

  // --- Assignments & assessments ---
  'assignment:create',
  'assignment:submit',
  'assignment:evaluate',
  'assignment:view_all',
  'assessment:manage',
  'assessment:view_results_own',
  'assessment:publish_results',

  // --- Communication ---
  'announcement:create_informational',
  'announcement:create_official',
  'announcement:approve',
  'announcement:emergency_broadcast',
  'announcement:view_analytics',
  'event:create',
  'event:approve',

  // --- Resources ---
  'resource:upload',
  'resource:publish',
  'resource:view_department',
  'resource:view_institution',
  'resource:manage_all',

  // --- Workload ---
  'workload:view_own',
  'workload:view_department',
  'workload:view_all',
  'workload:manage',

  // --- Leave ---
  'leave:request',
  'leave:approve',
  'leave:view_all',

  // --- Skills & employability ---
  'skill:view_own',
  'skill:view_section',
  'skill:view_all',
  'skill:assess_student',
  'skill:manage_catalog',

  // --- Readdressal / grievance ---
  'grievance:raise',
  'grievance:view_own',
  'grievance:view_assigned',
  'grievance:view_all',
  'grievance:assign',
  'grievance:resolve',
  'grievance:configure',
  /** Deliberately NOT granted to ordinary admins — see GRIEVANCE.md §Anonymity. */
  'grievance:reveal_anonymous',

  // --- Analytics & audit ---
  'analytics:view_own',
  'analytics:view_department',
  'analytics:view_institution',
  'audit:view',
  'report:generate',

  // --- Data operations ---
  'data:import',
  'data:export',

  // --- AI ---
  'ai:use_assistant',
  'ai:use_copilot',
  'ai:propose_changes',
  'ai:view_usage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'HOD'
  | 'DEPARTMENT_ADMIN'
  | 'EXAM_CELL'
  | 'FACULTY'
  | 'STUDENT'
  | 'COUNSELLOR'
  | 'IT_SUPPORT'
  | 'FINANCE'
  | 'HR'
  | 'LIBRARY'
  | 'MANAGEMENT';

const STUDENT_PERMISSIONS: Permission[] = [
  'academic:view_structure',
  'room:view',
  'timetable:view_own',
  'attendance:view_own',
  'assignment:submit',
  'assessment:view_results_own',
  'resource:view_department',
  'skill:view_own',
  'grievance:raise',
  'grievance:view_own',
  'analytics:view_own',
  'ai:use_assistant',
  'event:create',
];

const FACULTY_PERMISSIONS: Permission[] = [
  'academic:view_structure',
  'room:view',
  'user:view_department',
  'timetable:view_own',
  'timetable:view_all',
  'timetable:request_change',
  'attendance:mark',
  'attendance:view_section',
  'attendance:correct',
  'assignment:create',
  'assignment:evaluate',
  'assignment:view_all',
  'assessment:view_results_own',
  'announcement:create_informational',
  'resource:upload',
  'resource:publish',
  'resource:view_department',
  'resource:view_institution',
  'workload:view_own',
  'leave:request',
  'skill:view_section',
  'skill:assess_student',
  'grievance:raise',
  'grievance:view_own',
  'grievance:view_assigned',
  'analytics:view_own',
  'ai:use_assistant',
  'ai:use_copilot',
  'event:create',
  'data:export',
];

const HOD_PERMISSIONS: Permission[] = [
  ...FACULTY_PERMISSIONS,
  'user:view_department',
  'timetable:edit',
  'timetable:approve_change',
  'attendance:approve_correction',
  'announcement:create_official',
  'workload:view_department',
  'workload:manage',
  'leave:approve',
  'skill:view_all',
  'grievance:assign',
  'grievance:resolve',
  'analytics:view_department',
  'report:generate',
  'ai:propose_changes',
  'event:approve',
];

const ADMIN_PERMISSIONS: Permission[] = [
  'institution:view_settings',
  'user:create',
  'user:update',
  'user:deactivate',
  'user:view_all',
  'academic:manage_structure',
  'academic:view_structure',
  'room:manage',
  'room:view',
  'timetable:view_own',
  'timetable:view_all',
  'timetable:edit',
  'timetable:generate',
  'timetable:publish',
  'timetable:approve_change',
  'attendance:view_all',
  'attendance:approve_correction',
  'assignment:view_all',
  'assessment:manage',
  'assessment:publish_results',
  'announcement:create_informational',
  'announcement:create_official',
  'announcement:approve',
  'announcement:emergency_broadcast',
  'announcement:view_analytics',
  'event:create',
  'event:approve',
  'resource:view_institution',
  'resource:manage_all',
  'workload:view_all',
  'workload:manage',
  'leave:approve',
  'leave:view_all',
  'skill:view_all',
  'skill:manage_catalog',
  'grievance:raise',
  'grievance:view_own',
  'grievance:view_all',
  'grievance:assign',
  'grievance:resolve',
  'grievance:configure',
  'analytics:view_institution',
  'analytics:view_department',
  'audit:view',
  'report:generate',
  'data:import',
  'data:export',
  'ai:use_assistant',
  'ai:propose_changes',
  'ai:view_usage',
];

/**
 * SUPER_ADMIN additionally holds tenant-management and the sensitive
 * anonymity-reveal capability, which is audited on every use.
 */
const SUPER_ADMIN_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  'institution:manage',
  'role:manage',
  'user:impersonate',
  'grievance:reveal_anonymous',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
  ADMIN: ADMIN_PERMISSIONS,
  HOD: HOD_PERMISSIONS,
  DEPARTMENT_ADMIN: [
    ...HOD_PERMISSIONS,
    'user:create',
    'user:update',
    'academic:manage_structure',
    'data:import',
  ],
  EXAM_CELL: [
    'academic:view_structure',
    'room:view',
    'room:manage',
    'timetable:view_all',
    'assessment:manage',
    'assessment:publish_results',
    'announcement:create_official',
    'analytics:view_institution',
    'report:generate',
    'data:export',
    'ai:use_assistant',
  ],
  FACULTY: FACULTY_PERMISSIONS,
  STUDENT: STUDENT_PERMISSIONS,
  COUNSELLOR: [
    'academic:view_structure',
    'user:view_department',
    'attendance:view_all',
    'skill:view_all',
    'grievance:view_assigned',
    'grievance:resolve',
    'analytics:view_department',
    'ai:use_assistant',
  ],
  IT_SUPPORT: [
    'academic:view_structure',
    'room:view',
    'grievance:view_assigned',
    'grievance:resolve',
    'audit:view',
    'ai:use_assistant',
  ],
  FINANCE: [
    'academic:view_structure',
    'user:view_all',
    'grievance:view_assigned',
    'grievance:resolve',
    'report:generate',
    'data:export',
    'ai:use_assistant',
  ],
  HR: [
    'academic:view_structure',
    'user:view_all',
    'user:create',
    'user:update',
    'workload:view_all',
    'leave:approve',
    'leave:view_all',
    'grievance:view_assigned',
    'grievance:resolve',
    'report:generate',
    'ai:use_assistant',
  ],
  LIBRARY: [
    'academic:view_structure',
    'resource:upload',
    'resource:publish',
    'resource:manage_all',
    'resource:view_institution',
    'grievance:view_assigned',
    'ai:use_assistant',
  ],
  MANAGEMENT: [
    'institution:view_settings',
    'academic:view_structure',
    'user:view_all',
    'timetable:view_all',
    'attendance:view_all',
    'workload:view_all',
    'skill:view_all',
    'grievance:view_all',
    'analytics:view_institution',
    'audit:view',
    'report:generate',
    'data:export',
    'ai:use_assistant',
  ],
};

/** Roles that currently have a built portal. Others are architecture-only. */
export const ACTIVE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STUDENT'];

/**
 * Capability implications.
 *
 * A broader capability necessarily grants the narrower ones: someone who may
 * view ALL workload may obviously view their own. Declaring this explicitly
 * stops a whole class of bug where a check against the narrow capability
 * fails for a user who holds the broad one.
 */
const IMPLIES: Partial<Record<Permission, Permission[]>> = {
  'workload:view_all': ['workload:view_department', 'workload:view_own'],
  'workload:view_department': ['workload:view_own'],
  'attendance:view_all': ['attendance:view_section', 'attendance:view_own'],
  'attendance:view_section': ['attendance:view_own'],
  'analytics:view_institution': ['analytics:view_department', 'analytics:view_own'],
  'analytics:view_department': ['analytics:view_own'],
  'skill:view_all': ['skill:view_section', 'skill:view_own'],
  'skill:view_section': ['skill:view_own'],
  'grievance:view_all': ['grievance:view_assigned', 'grievance:view_own'],
  'timetable:view_all': ['timetable:view_own'],
  'user:view_all': ['user:view_department'],
  'resource:view_institution': ['resource:view_department'],
  'resource:manage_all': ['resource:upload', 'resource:publish', 'resource:view_institution', 'resource:view_department'],
  'announcement:create_official': ['announcement:create_informational'],
  'assessment:manage': ['assessment:view_results_own'],
  'assignment:view_all': ['assignment:evaluate'],
  'ai:use_copilot': ['ai:use_assistant'],
  'ai:propose_changes': ['ai:use_assistant'],
};

export function permissionsForRoles(primary: string, secondary: string[] = []): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of [primary, ...secondary]) {
    const perms = ROLE_PERMISSIONS[role as Role];
    if (perms) perms.forEach((p) => set.add(p));
  }

  // Close the set under implication, so narrow checks succeed for broad holders.
  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of [...set]) {
      for (const implied of IMPLIES[permission] ?? []) {
        if (!set.has(implied)) {
          set.add(implied);
          changed = true;
        }
      }
    }
  }

  return set;
}

export function hasPermission(
  granted: Set<Permission> | Permission[],
  permission: Permission,
): boolean {
  return Array.isArray(granted) ? granted.includes(permission) : granted.has(permission);
}

export function hasAnyPermission(
  granted: Set<Permission>,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => granted.has(p));
}

/** Which portal a role lands in after login. */
export function portalForRole(role: string): 'student' | 'faculty' | 'admin' {
  if (role === 'STUDENT') return 'student';
  if (role === 'FACULTY' || role === 'COUNSELLOR' || role === 'LIBRARY') return 'faculty';
  return 'admin';
}
