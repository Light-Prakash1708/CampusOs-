import { requireAuth } from '@/lib/auth/context';
import { isEnabled, type FeatureFlag } from '@/lib/features';
import { PageHeader } from '@/components/ui';
import { DATA_CATEGORIES, CONSENT_PURPOSES, AI_COACH_SCOPES } from '@/services/privacy/catalogue';
import { getPrivacyPreferences, listConsents } from '@/services/privacy';
import { formatDateTime } from '@/lib/utils';
import { PrivacyControls, DataRights } from './PrivacyControls';

export const metadata = { title: 'Privacy · CampusOS' };
export const dynamic = 'force-dynamic';

export default async function PrivacyPage() {
  const user = await requireAuth();
  const [prefs, consents] = await Promise.all([getPrivacyPreferences(user), listConsents(user)]);
  const categories = DATA_CATEGORIES.filter((c) => !c.feature || isEnabled(user.featureFlags, c.feature as FeatureFlag));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Privacy"
        description="What CampusOS stores about you, who can see it, and what you control. CampusOS does not sell your data or use it for advertising."
      />

      <section aria-labelledby="controls">
        <h2 id="controls" className="mb-3 text-[15px] font-semibold text-default">Your choices</h2>
        <PrivacyControls initial={prefs} coachScopes={[...AI_COACH_SCOPES]} />
      </section>

      <section aria-labelledby="stored">
        <h2 id="stored" className="text-[15px] font-semibold text-default">What CampusOS stores</h2>
        <p className="mt-0.5 text-[13px] text-muted">
          {user.institutionName} is responsible for your academic records. CampusOS processes them on its behalf.
        </p>
        <div className="mt-3 space-y-2">
          {categories.map((c) => (
            <details key={c.key} className="group rounded-lg border border-[hsl(var(--border))] bg-surface">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <span className="text-[13.5px] font-medium text-default">{c.label}</span>
                <span className="text-[12px] text-subtle">
                  {c.canDisable === 'yes' ? 'You control this' : c.canDisable === 'partly' ? 'Partly optional' : 'Required'}
                </span>
              </summary>
              <dl className="grid gap-3 border-t border-[hsl(var(--border))] px-4 py-3 text-[13px] sm:grid-cols-2">
                <div><dt className="font-medium text-default">Stored</dt><dd className="text-muted">{c.stored.join(' · ')}</dd></div>
                <div><dt className="font-medium text-default">Used for</dt><dd className="text-muted">{c.usedFor.join(' · ')}</dd></div>
                <div><dt className="font-medium text-default">Visible to</dt><dd className="text-muted">{c.visibleTo.join(' · ')}</dd></div>
                <div><dt className="font-medium text-default">Can be disabled?</dt><dd className="text-muted">{c.disableNote}</dd></div>
                <div><dt className="font-medium text-default">Kept for</dt><dd className="text-muted">{c.retentionNote}</dd></div>
                <div><dt className="font-medium text-default">On deletion</dt><dd className="text-muted">{c.deletionPolicy}</dd></div>
              </dl>
            </details>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] leading-relaxed text-subtle">
          Urgent notices: if your institution marks an emergency broadcast as mandatory, it reaches every
          notification channel you have set up, even ones you turned off.
        </p>
      </section>

      <section aria-labelledby="rights">
        <h2 id="rights" className="mb-3 text-[15px] font-semibold text-default">Your data rights</h2>
        <DataRights />
      </section>

      {consents.history.length > 0 ? (
        <section aria-labelledby="history">
          <h2 id="history" className="text-[15px] font-semibold text-default">Consent history</h2>
          <ul className="mt-2 divide-y divide-[hsl(var(--border))] rounded-lg border border-[hsl(var(--border))] bg-surface text-[13px]">
            {consents.history.slice(0, 20).map((c, i) => (
              <li key={i} className="flex justify-between gap-3 px-4 py-2.5">
                <span className="text-default">
                  {c.granted ? 'Allowed' : 'Withdrew'}: {labelFor(c.purpose)}
                </span>
                <span className="shrink-0 text-subtle">{formatDateTime(c.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function labelFor(purpose: string): string {
  if (purpose.startsWith('ai_coach:')) return `AI Coach may read your ${purpose.slice(9)}`;
  return CONSENT_PURPOSES[purpose as keyof typeof CONSENT_PURPOSES] ?? purpose;
}
