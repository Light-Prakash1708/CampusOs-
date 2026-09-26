import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { AppError, ConflictError, ForbiddenError, pgErrorOf } from '@/lib/api';
import type { AuthContext } from '@/lib/auth/context';
import { recordAudit } from '@/services/audit';

/**
 * Adding to the academic structure from the admin UI (academic:manage_structure),
 * so a new college can go from nothing to departments → programmes → sections
 * without SQL. Everything is scoped to the caller's college; codes are unique
 * per college (existing constraints). Editing and archiving stay with the
 * existing tools.
 */

interface Meta {
  ipAddress: string | null;
  userAgent: string | null;
}

function assertManager(ctx: AuthContext) {
  if (!ctx.permissions.has('academic:manage_structure')) throw new ForbiddenError();
}

function duplicate(error: unknown, constraint: string, what: string): never {
  const pg = pgErrorOf(error);
  if (pg.code === '23505' && pg.constraint === constraint) throw new ConflictError(`A ${what} with that code already exists.`);
  throw error;
}

export async function createDepartment(ctx: AuthContext, input: { name: string; code: string; school?: string | null }, meta: Meta) {
  assertManager(ctx);
  const [row] = await db
    .insert(t.departments)
    .values({ institutionId: ctx.institutionId, name: input.name.trim(), code: input.code.trim().toUpperCase(), school: input.school?.trim() || null })
    .returning({ id: t.departments.id })
    .catch((e: unknown) => duplicate(e, 'departments_code_uq', 'department'));
  await recordAudit(ctx, { action: 'ACADEMIC_STRUCTURE_CHANGED', entityType: 'department', entityId: row!.id, after: { name: input.name, code: input.code }, ...meta });
  return { id: row!.id };
}

export async function createProgram(
  ctx: AuthContext,
  input: { departmentId: string; name: string; code: string; level: string; durationYears: number },
  meta: Meta,
) {
  assertManager(ctx);
  const [dept] = await db
    .select({ id: t.departments.id })
    .from(t.departments)
    .where(and(eq(t.departments.id, input.departmentId), eq(t.departments.institutionId, ctx.institutionId), isNull(t.departments.deletedAt)))
    .limit(1);
  if (!dept) throw new AppError('That department does not exist at your college.', 422, 'BAD_DEPARTMENT');
  const [row] = await db
    .insert(t.programs)
    .values({
      institutionId: ctx.institutionId,
      departmentId: dept.id,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      level: input.level,
      durationYears: input.durationYears,
      totalSemesters: input.durationYears * 2,
    })
    .returning({ id: t.programs.id })
    .catch((e: unknown) => duplicate(e, 'programs_code_uq', 'programme'));
  await recordAudit(ctx, { action: 'ACADEMIC_STRUCTURE_CHANGED', entityType: 'program', entityId: row!.id, after: { name: input.name, code: input.code }, ...meta });
  return { id: row!.id };
}

export async function createSection(ctx: AuthContext, input: { programId: string; year: number; name: string; code: string }, meta: Meta) {
  assertManager(ctx);
  const [program] = await db
    .select({ id: t.programs.id, duration: t.programs.durationYears })
    .from(t.programs)
    .where(and(eq(t.programs.id, input.programId), eq(t.programs.institutionId, ctx.institutionId), isNull(t.programs.deletedAt)))
    .limit(1);
  if (!program) throw new AppError('That programme does not exist at your college.', 422, 'BAD_PROGRAM');
  if (input.year < 1 || input.year > program.duration) {
    throw new AppError(`Year must be between 1 and ${program.duration} for this programme.`, 422, 'BAD_YEAR');
  }
  const [row] = await db
    .insert(t.sections)
    .values({
      institutionId: ctx.institutionId,
      programId: program.id,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      year: input.year,
      semester: input.year * 2 - 1,
    })
    .returning({ id: t.sections.id })
    .catch((e: unknown) => duplicate(e, 'sections_code_uq', 'section'));
  await recordAudit(ctx, { action: 'ACADEMIC_STRUCTURE_CHANGED', entityType: 'section', entityId: row!.id, after: { name: input.name, code: input.code, year: input.year }, ...meta });
  return { id: row!.id };
}
