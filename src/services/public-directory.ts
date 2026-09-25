import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { NotFoundError } from '@/lib/api';

/**
 * PUBLIC DIRECTORY — the only tenant data readable without signing in.
 *
 * Exposes, for colleges that chose to be listed, the minimum needed to
 * register: the college's name and city, and the names of its departments,
 * programmes and sections. No people, no counts, nothing else.
 */

export async function listRegistrableInstitutions() {
  return db
    .select({
      slug: t.institutions.slug,
      name: t.institutions.name,
      shortName: t.institutions.shortName,
      city: t.institutions.city,
      state: t.institutions.state,
      mode: sql<string>`${t.institutions.registrationPolicy}->>'mode'`,
      allowedDomains: sql<string[] | null>`${t.institutions.registrationPolicy}->'allowedDomains'`,
    })
    .from(t.institutions)
    .where(
      and(
        eq(t.institutions.isActive, true),
        eq(t.institutions.isListed, true),
        isNull(t.institutions.deletedAt),
        sql`${t.institutions.registrationPolicy}->>'mode' <> 'DISABLED'`,
      ),
    )
    .orderBy(asc(t.institutions.name))
    .limit(500);
}

export async function getRegistrationStructure(slug: string) {
  const [inst] = await db
    .select({ id: t.institutions.id, name: t.institutions.name, policy: t.institutions.registrationPolicy })
    .from(t.institutions)
    .where(and(eq(t.institutions.slug, slug), eq(t.institutions.isActive, true), eq(t.institutions.isListed, true), isNull(t.institutions.deletedAt)))
    .limit(1);
  if (!inst || inst.policy.mode === 'DISABLED') throw new NotFoundError('College');

  const [departments, programs, sections] = await Promise.all([
    db.select({ id: t.departments.id, name: t.departments.name })
      .from(t.departments)
      .where(and(eq(t.departments.institutionId, inst.id), isNull(t.departments.deletedAt)))
      .orderBy(asc(t.departments.name)),
    db.select({ id: t.programs.id, name: t.programs.name, departmentId: t.programs.departmentId, durationYears: t.programs.durationYears })
      .from(t.programs)
      .where(and(eq(t.programs.institutionId, inst.id), isNull(t.programs.deletedAt)))
      .orderBy(asc(t.programs.name)),
    db.select({ id: t.sections.id, name: t.sections.name, programId: t.sections.programId, year: t.sections.year })
      .from(t.sections)
      .where(and(eq(t.sections.institutionId, inst.id), isNull(t.sections.deletedAt)))
      .orderBy(asc(t.sections.year), asc(t.sections.name)),
  ]);

  return {
    name: inst.name,
    mode: inst.policy.mode,
    allowedDomains: inst.policy.mode === 'EMAIL_DOMAIN' ? (inst.policy.allowedDomains ?? []) : [],
    departments,
    programs,
    sections,
  };
}
