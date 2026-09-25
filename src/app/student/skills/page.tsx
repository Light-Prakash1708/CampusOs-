import Link from 'next/link';
import {
  BookOpen,
  CircleDot,
  Info,
  ListChecks,
  Route,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  EmptyState,
  PageHeader,
  Progress,
  Section,
  Stat,
  type BadgeTone,
} from '@/components/ui';
import { cn, humanize, pluralize } from '@/lib/utils';
import { isEnabled } from '@/lib/features';
import {
  buildSkillGapPlan,
  getStudentSkillProfile,
  type SkillProfileEntry,
} from '@/services/skills';

import { requireStudentContext } from '../_lib/auth';
import { ModuleDisabled } from '../_components/bits';

export const metadata = { title: 'Skills & Career' };
export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const user = await requireStudentContext('skill:view_own');

  if (!isEnabled(user.featureFlags, 'skill_engine_enabled')) {
    return (
      <>
        <PageHeader title="Skills & Career" />
        <ModuleDisabled
          module="The Skill & Employability Engine"
          blurb="Skill graphs, career goals and gap plans are not part of your institution's current configuration."
        />
      </>
    );
  }

  const profile = await getStudentSkillProfile(user.institutionId, user.studentProfileId);
  const plan = profile.careerGoal
    ? await buildSkillGapPlan(user.institutionId, user.studentProfileId, profile.careerGoal.roleId)
    : null;

  const byCategory = new Map<string, SkillProfileEntry[]>();
  for (const skill of profile.skills) {
    const list = byCategory.get(skill.category) ?? [];
    list.push(skill);
    byCategory.set(skill.category, list);
  }

  const openGaps = profile.careerGoal?.gaps.filter((g) => g.gap > 0) ?? [];

  return (
    <>
      <PageHeader
        title="Skills & Career"
        description="Every number here traces back to concrete evidence — an assignment, an assessment, a certification or a faculty rating."
      />

      {profile.skills.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={Target}
              title="No skill evidence recorded yet"
              description="Your skill profile is built from graded work and faculty assessments. Once your first pieces of work are evaluated, they appear here with the evidence behind them."
            />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* ---------------------------- Career goal --------------------------- */}
          {profile.careerGoal ? (
            <Card className="mb-6">
              <CardHeader
                title={`Target role · ${profile.careerGoal.title}`}
                icon={Target}
                description={`${profile.careerGoal.metRequirements} of ${profile.careerGoal.totalRequirements} requirements met`}
              />
              <CardBody className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat
                    label="Readiness"
                    value={`${profile.careerGoal.readiness}%`}
                    sublabel="Weighted by how much each skill matters"
                    tone={readinessTone(profile.careerGoal.readiness)}
                    icon={TrendingUp}
                  />
                  <Stat
                    label="Skills with evidence"
                    value={profile.skills.length}
                    sublabel={`${pluralize(profile.overallEvidenceCount, 'evidence item')} in total`}
                    icon={ListChecks}
                  />
                  <Stat
                    label="Gaps to close"
                    value={openGaps.length}
                    sublabel={
                      plan && plan.totalWeeks > 0
                        ? `About ${pluralize(plan.totalWeeks, 'week')} of focused work`
                        : 'Nothing outstanding'
                    }
                    tone={openGaps.length === 0 ? 'success' : 'warning'}
                    icon={Route}
                  />
                </div>

                <Progress
                  value={profile.careerGoal.readiness}
                  tone={
                    profile.careerGoal.readiness >= 75
                      ? 'success'
                      : profile.careerGoal.readiness >= 50
                        ? 'warning'
                        : 'danger'
                  }
                  showLabel
                />

                {profile.careerGoal.sourceNote ? (
                  <Alert tone="info" icon={Info} title="Where these requirements come from">
                    {profile.careerGoal.sourceNote}
                  </Alert>
                ) : (
                  <Alert tone="warning" icon={Info} title="Requirement source not recorded">
                    This role&rsquo;s required skill profile has no source note attached, so its
                    requirements cannot be traced. Ask the placement cell to record where it came
                    from.
                  </Alert>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card className="mb-6">
              <CardBody className="p-0">
                <EmptyState
                  icon={Target}
                  title="No career goal set"
                  description="Your skills are being tracked, but without a target role there is nothing to measure readiness against. The placement cell can set your primary goal."
                  action={
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/student/readdressal/new?category=academic">
                        Ask for a goal to be set
                      </Link>
                    </Button>
                  }
                />
              </CardBody>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* --------------------------- Skill graph -------------------------- */}
            <Section
              title="Skill graph"
              description="Proficiency with the confidence behind each number"
            >
              <div className="space-y-4">
                {[...byCategory.entries()].map(([category, skills]) => (
                  <Card key={category}>
                    <CardHeader title={humanize(category)} />
                    <CardBody className="space-y-4">
                      {skills.map((skill) => (
                        <SkillBar key={skill.skillId} skill={skill} />
                      ))}
                    </CardBody>
                  </Card>
                ))}
              </div>

              <p className="mt-3 flex items-start gap-2 text-[12px] leading-relaxed text-subtle">
                <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
                Confidence reflects how much evidence supports a proficiency value, not how good you
                are. A high score backed by one assignment is shown as low confidence on purpose.
              </p>
            </Section>

            {/* ------------------------------ Gaps ------------------------------ */}
            <div className="space-y-6">
              <Section title="Ranked gaps" description="Biggest gaps on the most important skills">
                <Card>
                  <CardBody className="p-0">
                    {!profile.careerGoal ? (
                      <EmptyState
                        icon={Route}
                        title="No target role"
                        description="Gaps are measured against a role's requirements."
                      />
                    ) : openGaps.length === 0 ? (
                      <EmptyState
                        icon={Target}
                        title="No gaps against this role"
                        description="Your evidenced proficiency meets or exceeds every requirement recorded for this role."
                      />
                    ) : (
                      <ul className="divide-y divide-[hsl(var(--border))]">
                        {openGaps.map((gap, index) => (
                          <li key={gap.skillId} className="px-5 py-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-medium text-default">
                                  <span className="tabular mr-1.5 text-subtle">{index + 1}.</span>
                                  {gap.skill}
                                </p>
                                <p className="mt-0.5 text-[12px] text-muted">
                                  Now {gap.current} · needs {gap.required} ·{' '}
                                  {gap.isCore ? 'core skill' : 'supporting skill'} · importance{' '}
                                  {gap.importance}/5
                                </p>
                              </div>
                              <Badge tone={gap.gap >= 25 ? 'danger' : 'warning'} className="tabular">
                                +{gap.gap}
                              </Badge>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Progress
                                value={gap.current}
                                max={Math.max(gap.required, 100)}
                                tone={gap.gap >= 25 ? 'danger' : 'warning'}
                                className="flex-1"
                              />
                              <span className="tabular w-16 shrink-0 text-right text-[11.5px] text-subtle">
                                {gap.current}/{gap.required}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </Section>

              {/* ------------------------------ Plan ---------------------------- */}
              <Section
                title="Your plan"
                description="Sequenced by gap size and importance — rule-based, not model-generated"
              >
                <Card>
                  <CardBody className="p-0">
                    {!plan || plan.steps.length === 0 ? (
                      <EmptyState
                        icon={Route}
                        title="Nothing to plan"
                        description={
                          profile.careerGoal
                            ? 'You already meet every requirement recorded for this role.'
                            : 'Set a target role and a plan is generated from your evidenced gaps.'
                        }
                      />
                    ) : (
                      <ol className="divide-y divide-[hsl(var(--border))]">
                        {plan.steps.map((step) => (
                          <li key={step.skillId} className="px-5 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-[13.5px] font-semibold text-default">
                                Step {step.order} · {step.skill}
                              </p>
                              <Badge tone="neutral">{pluralize(step.weeks, 'week')}</Badge>
                            </div>
                            <p className="mt-0.5 text-[12px] text-muted">
                              {step.currentLevel} → {step.targetLevel}
                            </p>

                            <ul className="mt-2.5 space-y-1.5">
                              {step.actions.map((action, i) => (
                                <li
                                  key={i}
                                  className="flex items-start gap-2 text-[12.5px] leading-relaxed text-default"
                                >
                                  <CircleDot
                                    size={12}
                                    className="mt-1 shrink-0 text-subtle"
                                    aria-hidden
                                  />
                                  {action}
                                </li>
                              ))}
                            </ul>

                            {step.institutionalResources.length > 0 ? (
                              <>
                                <Divider className="my-3" />
                                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-subtle">
                                  From your resource hub
                                </p>
                                <ul className="mt-1.5 space-y-1">
                                  {step.institutionalResources.map((resource) => (
                                    <li key={resource.id}>
                                      <Link
                                        href={`/student/resources?q=${encodeURIComponent(step.skill)}`}
                                        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand hover:underline"
                                      >
                                        <BookOpen size={12} aria-hidden />
                                        {resource.title}
                                      </Link>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    )}
                  </CardBody>
                  {plan && plan.steps.length > 0 ? (
                    <div className="border-t border-[hsl(var(--border))] bg-surface-muted px-5 py-3 text-[12px] leading-relaxed text-subtle">
                      Sequencing and duration are computed from gap size and importance (roughly one
                      week per 8 points of gap). Suggested material comes from your own institution&rsquo;s
                      resource hub — no external links are invented.
                    </div>
                  ) : null}
                </Card>
              </Section>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SkillBar({ skill }: { skill: SkillProfileEntry }) {
  const confidence = confidenceBand(skill.confidence);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] font-medium text-default">{skill.skill}</p>
        <span className="tabular shrink-0 text-[13px] font-semibold text-default">
          {skill.proficiency}
        </span>
      </div>

      <Progress
        className="mt-1.5"
        value={skill.proficiency}
        tone={skill.proficiency >= 75 ? 'success' : skill.proficiency >= 50 ? 'brand' : 'warning'}
      />

      {/* Confidence is deliberately shown alongside, never folded into, the score. */}
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex items-center gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={cn(
                'h-1.5 w-3 rounded-sm',
                i < Math.round(skill.confidence / 20)
                  ? confidence.tone === 'success'
                    ? 'bg-success'
                    : confidence.tone === 'warning'
                      ? 'bg-warning'
                      : 'bg-danger'
                  : 'bg-surface-sunken',
              )}
            />
          ))}
        </span>
        <span className="text-[11.5px] text-subtle">
          {confidence.label} confidence ({skill.confidence}%) ·{' '}
          {pluralize(skill.evidenceCount, 'evidence item')}
        </span>
      </div>
    </div>
  );
}

function confidenceBand(confidence: number): { label: string; tone: BadgeTone } {
  if (confidence >= 75) return { label: 'High', tone: 'success' };
  if (confidence >= 50) return { label: 'Moderate', tone: 'warning' };
  return { label: 'Low', tone: 'danger' };
}

function readinessTone(readiness: number): BadgeTone {
  if (readiness >= 75) return 'success';
  if (readiness >= 50) return 'warning';
  return 'danger';
}
