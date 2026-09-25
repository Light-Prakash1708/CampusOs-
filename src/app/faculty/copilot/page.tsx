import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { BookMarked, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/context';
import { isEnabled } from '@/lib/features';
import {
  AiLabel,
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  EstimateChip,
  PageHeader,
  Section,
} from '@/components/ui';
import { formatDate, minutesToHuman, pluralize } from '@/lib/utils';
import { getCurrentTerm, getMyOfferings } from '../_lib/faculty';
import { NoFacultyProfile } from '../_components/NoFacultyProfile';
import { baselineManualMinutes } from '@/app/api/faculty/_lib/estimates';
import { CopilotWorkbench } from './CopilotWorkbench';
import { COPILOT_DURATIONS } from './planTypes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Teaching copilot · CampusOS' };

export default async function CopilotPage() {
  const user = await requirePermission('ai:use_copilot');

  if (!isEnabled(user.featureFlags, 'teacher_copilot_enabled')) {
    return (
      <div>
        <PageHeader title="Teaching copilot" />
        <Alert tone="warning" title="This module is not enabled for your institution">
          The Teacher Copilot is switched off in your institution&rsquo;s settings, so nothing here
          would work. An administrator can enable it.
        </Alert>
      </div>
    );
  }

  if (!user.facultyProfileId) {
    return (
      <div>
        <PageHeader title="Teaching copilot" />
        <NoFacultyProfile what="Lesson planning" />
      </div>
    );
  }

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);

  const [plans, savedEvents] = await Promise.all([
    db
      .select({
        id: t.lessonPlans.id,
        title: t.lessonPlans.title,
        topic: t.lessonPlans.topic,
        durationMinutes: t.lessonPlans.durationMinutes,
        status: t.lessonPlans.status,
        createdAt: t.lessonPlans.createdAt,
        publishedAt: t.lessonPlans.publishedAt,
        subjectCode: t.subjects.code,
      })
      .from(t.lessonPlans)
      .leftJoin(t.subjects, eq(t.subjects.id, t.lessonPlans.subjectId))
      .where(
        and(
          eq(t.lessonPlans.institutionId, user.institutionId),
          eq(t.lessonPlans.authorId, user.userId),
          isNull(t.lessonPlans.deletedAt),
        ),
      )
      .orderBy(desc(t.lessonPlans.createdAt))
      .limit(10),
    db
      .select({ savedMinutes: t.timeSavedEvents.savedMinutes })
      .from(t.timeSavedEvents)
      .where(
        and(
          eq(t.timeSavedEvents.institutionId, user.institutionId),
          eq(t.timeSavedEvents.userId, user.userId),
          eq(t.timeSavedEvents.activity, 'LESSON_PLAN'),
        ),
      ),
  ]);

  const totalSaved = savedEvents.reduce((sum, e) => sum + e.savedMinutes, 0);

  return (
    <div>
      <PageHeader
        title="Teaching copilot"
        description="Generate a lesson plan for a class you teach, edit it, then publish it once you are happy with it."
        action={
          savedEvents.length > 0 ? (
            <span className="text-[12.5px] text-muted">
              Estimated time saved so far{' '}
              <EstimateChip>{minutesToHuman(totalSaved)}</EstimateChip> across{' '}
              {pluralize(savedEvents.length, 'plan')}
            </span>
          ) : undefined
        }
      />

      <CopilotWorkbench
        offerings={offerings.map((o) => ({
          id: o.id,
          subjectId: o.subjectId,
          label: `${o.subjectCode} ${o.subjectName} — ${o.sectionCode}`,
        }))}
        baselineMinutes={Object.fromEntries(
          COPILOT_DURATIONS.map((d) => [String(d), baselineManualMinutes(d)]),
        )}
      />

      <Section title="Your saved plans" className="mt-6">
        <Card>
          {plans.length === 0 ? (
            <EmptyState
              icon={BookMarked}
              title="No plans saved yet"
              description="A plan you save appears here. It stays labelled as AI output until you publish it."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {plans.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-default">{p.title}</p>
                    <p className="text-[12.5px] text-muted">
                      {p.subjectCode ? `${p.subjectCode} · ` : ''}
                      {p.durationMinutes} min · created {formatDate(p.createdAt)}
                      {p.publishedAt ? ` · published ${formatDate(p.publishedAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <AiLabel state={p.status === 'PUBLISHED' ? 'approved' : 'generated'} />
                    <Badge tone={p.status === 'PUBLISHED' ? 'success' : 'warning'}>
                      {p.status === 'PUBLISHED' ? 'published' : 'pending review'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>

      <Card className="mt-4">
        <CardBody>
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-subtle" aria-hidden />
            <span>
              Every plan is stored as unreviewed AI output until you publish it, and the label on
              screen reflects that state. Publishing is a record that <em>you</em> approved the
              content — see{' '}
              <Link href="/faculty/settings#ai" className="text-brand hover:underline">
                settings
              </Link>{' '}
              for how AI is configured at this institution.
            </span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
