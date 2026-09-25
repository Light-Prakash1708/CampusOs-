import Link from 'next/link';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requireAuth } from '@/lib/auth/context';
import { CampusCard, CampusSectionHeader, PixelAvatar, avatarToneFor } from '@/components/campus';
import { humanize, pluralize } from '@/lib/utils';
import { getCurrentTerm } from '../_lib/faculty';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your profile' };

/**
 * Faculty profile: identity, department and the classes this person teaches
 * this term — all from their own records. (The avatar and user-card links
 * point here; the page was missing before, so every faculty page prefetched a
 * 404.)
 */
export default async function FacultyProfilePage() {
  const user = await requireAuth();
  const term = await getCurrentTerm(user.institutionId);

  const [dept] = user.departmentId
    ? await db.select({ name: t.departments.name }).from(t.departments).where(eq(t.departments.id, user.departmentId)).limit(1)
    : [];
  const [fp] = user.facultyProfileId
    ? await db.select().from(t.facultyProfiles).where(eq(t.facultyProfiles.id, user.facultyProfileId)).limit(1)
    : [];
  const classes =
    user.facultyProfileId && term
      ? await db
          .select({ id: t.courseOfferings.id, code: t.subjects.code, subject: t.subjects.name, section: t.sections.code, primary: t.courseOfferings.facultyId })
          .from(t.courseOfferings)
          .innerJoin(t.subjects, eq(t.subjects.id, t.courseOfferings.subjectId))
          .innerJoin(t.sections, eq(t.sections.id, t.courseOfferings.sectionId))
          .where(
            and(
              eq(t.courseOfferings.institutionId, user.institutionId),
              eq(t.courseOfferings.termId, term.id),
              eq(t.courseOfferings.isActive, true),
              isNull(t.courseOfferings.deletedAt),
              or(eq(t.courseOfferings.facultyId, user.facultyProfileId), eq(t.courseOfferings.secondaryFacultyId, user.facultyProfileId)),
            ),
          )
          .orderBy(asc(t.subjects.code))
      : [];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-[26px] font-extrabold text-default sm:text-[30px]">Your profile</h1>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <CampusCard as="section" className="flex flex-col items-center p-6 text-center" aria-label="Identity">
          <span className="rounded-2xl border-[1.5px] border-ink bg-lavender p-1 shadow-pop">
            <PixelAvatar tone={avatarToneFor(user.userId)} size={72} />
          </span>
          <p className="mt-3 font-display text-[18px] font-extrabold text-default">{user.fullName}</p>
          <p className="text-[13px] text-muted">{user.email}</p>
          <p className="mt-2 rounded-md border border-ink/30 bg-lavender px-2 py-0.5 text-[12px] font-bold text-lavender-ink">{humanize(user.role)}</p>
          <dl className="mt-4 w-full space-y-1.5 text-left text-[13px]">
            {[
              ['College', user.institutionName],
              ['Department', dept?.name ?? '—'],
              ['Employee code', fp?.employeeCode ?? '—'],
              ['Designation', fp?.designation ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-[hsl(var(--border))] py-1.5 last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-semibold text-default">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex w-full flex-col gap-2">
            <Link href="/account/security" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface text-[13px] font-bold shadow-pop campus-press">
              <KeyRound size={15} aria-hidden /> Password & sessions
            </Link>
            <Link href="/account/privacy" className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-ink bg-surface text-[13px] font-bold shadow-pop campus-press">
              <ShieldCheck size={15} aria-hidden /> Privacy & your data
            </Link>
          </div>
        </CampusCard>

        <CampusCard as="section" className="p-5" aria-labelledby="teach-h">
          <CampusSectionHeader id="teach-h" title={term ? `Teaching this term · ${term.name}` : 'Teaching'} />
          {classes.length === 0 ? (
            <p className="mt-3 text-[13px] text-subtle">{term ? 'No classes are assigned to you this term.' : 'No current term is set up yet.'}</p>
          ) : (
            <>
              <p className="mt-1 text-[12.5px] text-muted">{pluralize(classes.length, 'class', 'classes')}</p>
              <ul className="mt-3 divide-y divide-[hsl(var(--border))]">
                {classes.map((c) => (
                  <li key={c.id}>
                    <Link href={`/faculty/classes/${c.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:underline">
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-bold text-default">{c.subject}</span>
                        <span className="text-[11.5px] text-subtle">
                          {c.code} · {c.section}
                          {c.primary !== user.facultyProfileId ? ' · co-teaching' : ''}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </CampusCard>
      </div>
    </div>
  );
}
