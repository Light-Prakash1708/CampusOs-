import { and, eq } from 'drizzle-orm';
import { Settings as SettingsIcon, ShieldCheck, Sparkles } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { can, requirePermission } from '@/lib/auth/context';
import { FeatureToggle, RegistrationPolicyForm } from './SettingsEditors';
import { Alert, Badge, Card, CardBody, CardHeader, PageHeader, Section, Table, Td, Th } from '@/components/ui';
import { FEATURE_FLAGS, isEnabled, plannedLabel, type FeatureFlag } from '@/lib/features';
import { humanize } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings · CampusOS' };

export default async function SettingsPage() {
  const user = await requirePermission('institution:view_settings');

  const [institution] = await db
    .select()
    .from(t.institutions)
    .where(eq(t.institutions.id, user.institutionId))
    .limit(1);

  const categories = await db
    .select()
    .from(t.grievanceCategories)
    .where(eq(t.grievanceCategories.institutionId, user.institutionId))
    .orderBy(t.grievanceCategories.sortOrder);

  const aiProvider = process.env.AI_PROVIDER ?? 'local';
  const flags = (institution?.featureFlags ?? {}) as Record<string, boolean>;
  const canManage = can(user, 'institution:manage');

  return (
    <div>
      <PageHeader
        title="Settings"
        description={`${institution?.name ?? 'Institution'} · ${institution?.subscriptionTier ?? 'STARTER'} plan`}
      />

      <Section title="Institution">
        <Card>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Detail label="Name" value={institution?.name ?? '—'} />
            <Detail label="Tenant key" value={institution?.slug ?? '—'} mono />
            <Detail label="Timezone" value={institution?.timezone ?? '—'} />
            <Detail label="Contact" value={institution?.contactEmail ?? '—'} />
            <Detail label="Location" value={[institution?.city, institution?.state].filter(Boolean).join(', ') || '—'} />
            <Detail
              label="Setup"
              value={institution?.setupCompletedAt ? 'Complete' : 'Incomplete'}
            />
          </CardBody>
        </Card>
      </Section>

      <Section title="Modules">
        <Card>
          <CardHeader
            title="Feature availability"
            description="Modules the institution has enabled. A disabled module is hidden entirely rather than shown as a dead control."
          />
          <Table>
            <thead>
              <tr>
                <Th>Module</Th>
                <Th>Description</Th>
                <Th>Plan</Th>
                <Th align="right">State</Th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(FEATURE_FLAGS).map(([key, meta]) => {
                const on = isEnabled(flags, key as FeatureFlag);
                const planned = plannedLabel(key as FeatureFlag);
                return (
                  <tr key={key}>
                    <Td><span className="text-[13.5px] font-medium text-default">{meta.label}</span></Td>
                    <Td><span className="text-[12.5px] text-muted">{meta.description}</span></Td>
                    <Td><Badge tone="neutral">{humanize(meta.tier)}</Badge></Td>
                    <Td align="right">
                      {planned ? (
                        <Badge tone="neutral">{planned}</Badge>
                      ) : canManage ? (
                        <FeatureToggle flag={key} label={meta.label} enabled={on} />
                      ) : (
                        <Badge tone={on ? 'success' : 'neutral'}>{on ? 'Enabled' : 'Disabled'}</Badge>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title="Registration">
        <Card>
          <CardHeader
            title="Student sign-up"
            description="Decide how students get an account. Invitations and CSV import always work."
          />
          <CardBody>
            {canManage ? (
              <RegistrationPolicyForm
                initial={{
                  mode: institution?.registrationPolicy.mode ?? 'DISABLED',
                  allowedDomains: institution?.registrationPolicy.allowedDomains ?? [],
                  isListed: institution?.isListed ?? false,
                }}
              />
            ) : (
              <p className="text-[13px] text-muted">
                Current policy: {humanize(institution?.registrationPolicy.mode ?? 'DISABLED')}. Only a super administrator can change it.
              </p>
            )}
          </CardBody>
        </Card>
      </Section>

      <Section title="AI">
        <Card>
          <CardHeader title="Assistant configuration" icon={Sparkles} />
          <CardBody className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-3">
              <Detail label="Provider" value={aiProvider} mono />
              <Detail label="Model" value={aiProvider === 'anthropic' ? (process.env.AI_MODEL ?? 'claude-sonnet-4-6') : 'campusos-offline-v1'} mono />
              <Detail label="Monthly budget" value={`$${process.env.AI_MONTHLY_BUDGET_USD ?? '50'}`} />
            </div>
            {aiProvider !== 'anthropic' ? (
              <Alert tone="info" title="Running the offline assistant">
                No language-model API key is configured, so the assistant answers using a fixed set
                of database lookups rather than a language model. Every feature still works; answers
                are simply more literal. Set <code className="font-mono">AI_PROVIDER=anthropic</code>{' '}
                and <code className="font-mono">ANTHROPIC_API_KEY</code> to enable the full assistant.
              </Alert>
            ) : null}
          </CardBody>
        </Card>
      </Section>

      <Section title="Redressal">
        <Card>
          <CardHeader
            title="Categories and service levels"
            icon={ShieldCheck}
            description="Response and resolution deadlines are counted in working hours (Mon–Sat, 09:00–17:00)."
          />
          <Table>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th>Available to</Th>
                <Th align="right">Response SLA</Th>
                <Th align="right">Resolution SLA</Th>
                <Th align="right">Anonymous</Th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <span className="text-[13.5px] font-medium text-default">{c.name}</span>
                    {c.isSensitive ? <Badge tone="warning" className="ml-2">Sensitive</Badge> : null}
                  </Td>
                  <Td>
                    <span className="text-[12px] text-muted">
                      {((c.availableToRoles ?? []) as string[]).map(humanize).join(', ')}
                    </span>
                  </Td>
                  <Td align="right" className="tabular text-muted">{c.responseSlaHours}h</Td>
                  <Td align="right" className="tabular text-muted">{c.resolutionSlaHours}h</Td>
                  <Td align="right">
                    {c.allowAnonymous ? <Badge tone="info">Allowed</Badge> : <span className="text-subtle">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </Section>

      <Alert tone="info" icon={SettingsIcon} title="Editing settings">
        Super administrators can switch modules and change the registration policy here; every
        change is recorded in the audit log. Branding, SLAs and grievance categories are still
        edited through the institution record — an editor for those is on the roadmap.
      </Alert>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`mt-0.5 text-[13.5px] text-default ${mono ? 'font-mono text-[12.5px]' : ''}`}>
        {value}
      </p>
    </div>
  );
}
