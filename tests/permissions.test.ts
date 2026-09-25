import { describe, it, expect } from 'vitest';
import {
  PERMISSIONS, ROLE_PERMISSIONS, permissionsForRoles, portalForRole,
  type Permission, type Role,
} from '@/lib/auth/permissions';

/**
 * Authorization is the security boundary, so these assert the properties we
 * actually rely on rather than restating the matrix.
 */
describe('permission matrix', () => {
  it('grants students no capability that mutates institutional state', () => {
    const student = permissionsForRoles('STUDENT');
    const forbidden: Permission[] = [
      'timetable:edit', 'timetable:publish', 'timetable:generate',
      'attendance:mark', 'attendance:correct',
      'announcement:create_official', 'announcement:emergency_broadcast',
      'user:create', 'user:deactivate', 'data:import',
      'grievance:view_all', 'grievance:assign', 'grievance:reveal_anonymous',
      'audit:view', 'workload:manage', 'role:manage',
    ];
    for (const p of forbidden) {
      expect(student.has(p), `students must not hold ${p}`).toBe(false);
    }
  });

  it('never grants anonymity reveal to an ordinary administrator', () => {
    expect(permissionsForRoles('ADMIN').has('grievance:reveal_anonymous')).toBe(false);
    expect(permissionsForRoles('HOD').has('grievance:reveal_anonymous')).toBe(false);
    expect(permissionsForRoles('COUNSELLOR').has('grievance:reveal_anonymous')).toBe(false);
    // Only the tenant owner, and its use is audited.
    expect(permissionsForRoles('SUPER_ADMIN').has('grievance:reveal_anonymous')).toBe(true);
  });

  it('closes capabilities under implication (broad implies narrow)', () => {
    const admin = permissionsForRoles('ADMIN');
    expect(admin.has('workload:view_all')).toBe(true);
    // The bug this prevents: a view_all holder failing a view_own check.
    expect(admin.has('workload:view_own')).toBe(true);
    expect(admin.has('workload:view_department')).toBe(true);
    expect(admin.has('attendance:view_own')).toBe(true);
    expect(admin.has('analytics:view_own')).toBe(true);
    expect(admin.has('grievance:view_assigned')).toBe(true);
  });

  it('gives faculty teaching capability without institution-wide administration', () => {
    const faculty = permissionsForRoles('FACULTY');
    expect(faculty.has('attendance:mark')).toBe(true);
    expect(faculty.has('assignment:evaluate')).toBe(true);
    expect(faculty.has('timetable:edit')).toBe(false);
    expect(faculty.has('timetable:publish')).toBe(false);
    expect(faculty.has('user:create')).toBe(false);
    expect(faculty.has('data:import')).toBe(false);
  });

  it('routes each role to a portal', () => {
    expect(portalForRole('STUDENT')).toBe('student');
    expect(portalForRole('FACULTY')).toBe('faculty');
    expect(portalForRole('ADMIN')).toBe('admin');
    expect(portalForRole('SUPER_ADMIN')).toBe('admin');
    expect(portalForRole('EXAM_CELL')).toBe('admin');
  });

  it('only references declared permissions', () => {
    const declared = new Set<string>(PERMISSIONS);
    for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
      for (const p of perms) {
        expect(declared.has(p), `${role} references undeclared permission ${p}`).toBe(true);
      }
    }
  });

  it('merges secondary roles additively', () => {
    const facultyHod = permissionsForRoles('FACULTY', ['HOD']);
    expect(facultyHod.has('attendance:mark')).toBe(true);   // from FACULTY
    expect(facultyHod.has('leave:approve')).toBe(true);      // from HOD
  });

  it('defines a portal for every role', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as Role[]) {
      expect(['student', 'faculty', 'admin']).toContain(portalForRole(role));
    }
  });
});
