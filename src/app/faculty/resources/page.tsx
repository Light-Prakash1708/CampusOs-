import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { BookOpen, ExternalLink, Search } from 'lucide-react';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { requirePermission, can } from '@/lib/auth/context';
import {
  AiLabel,
  Alert,
  Badge,
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Section,
} from '@/components/ui';
import { formatDate, humanize, pluralize, truncate } from '@/lib/utils';
import { getCurrentTerm, getMyOfferings } from '../_lib/faculty';
import { STORAGE_AVAILABLE, STORAGE_LIMITATION } from '@/app/api/faculty/_lib/storage';
import { ResourceForm } from './ResourceForm';
import { SearchBox } from './SearchBox';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Resources · CampusOS' };

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requirePermission('resource:view_department');
  const { q } = await searchParams;
  const query = (q ?? '').trim();

  const term = await getCurrentTerm(user.institutionId);
  const offerings = await getMyOfferings(user, term?.id ?? null);

  const mine = await db
    .select({
      id: t.resources.id,
      title: t.resources.title,
      description: t.resources.description,
      kind: t.resources.kind,
      status: t.resources.status,
      visibility: t.resources.visibility,
      externalUrl: t.resources.externalUrl,
      fileUrl: t.resources.fileUrl,
      topic: t.resources.topic,
      viewCount: t.resources.viewCount,
      createdAt: t.resources.createdAt,
      isAiGenerated: t.resources.isAiGenerated,
      subjectCode: t.subjects.code,
    })
    .from(t.resources)
    .leftJoin(t.subjects, eq(t.subjects.id, t.resources.subjectId))
    .where(
      and(
        eq(t.resources.institutionId, user.institutionId),
        eq(t.resources.ownerId, user.userId),
        isNull(t.resources.deletedAt),
      ),
    )
    .orderBy(desc(t.resources.createdAt));

  /**
   * Institution-wide search uses the generated `search_vector` column and its
   * GIN index (see drizzle/0001_hard_constraints.sql). `websearch_to_tsquery`
   * accepts what people actually type — quoted phrases, `or`, `-exclusions` —
   * and never throws on malformed input, unlike `to_tsquery`.
   */
  const results = query
    ? await db
        .select({
          id: t.resources.id,
          title: t.resources.title,
          description: t.resources.description,
          kind: t.resources.kind,
          topic: t.resources.topic,
          visibility: t.resources.visibility,
          externalUrl: t.resources.externalUrl,
          fileUrl: t.resources.fileUrl,
          isAiGenerated: t.resources.isAiGenerated,
          createdAt: t.resources.createdAt,
          subjectCode: t.subjects.code,
          ownerFirst: t.users.firstName,
          ownerLast: t.users.lastName,
          rank: sql<number>`ts_rank(${t.resources.searchVector}, websearch_to_tsquery('english', ${query}))`,
        })
        .from(t.resources)
        .leftJoin(t.subjects, eq(t.subjects.id, t.resources.subjectId))
        .leftJoin(t.users, eq(t.users.id, t.resources.ownerId))
        .where(
          and(
            eq(t.resources.institutionId, user.institutionId),
            isNull(t.resources.deletedAt),
            eq(t.resources.status, 'PUBLISHED'),
            sql`${t.resources.searchVector} @@ websearch_to_tsquery('english', ${query})`,
            // Visibility is enforced in the query, not by hiding rows in the UI.
            or(
              eq(t.resources.visibility, 'INSTITUTION'),
              and(
                eq(t.resources.visibility, 'DEPARTMENT'),
                user.departmentId
                  ? eq(t.resources.departmentId, user.departmentId)
                  : sql`false`,
              ),
              eq(t.resources.ownerId, user.userId),
            ),
          ),
        )
        .orderBy(
          desc(
            sql`ts_rank(${t.resources.searchVector}, websearch_to_tsquery('english', ${query}))`,
          ),
        )
        .limit(30)
    : [];

  const subjects = [
    ...new Map(
      offerings.map((o) => [o.subjectId, { id: o.subjectId, label: `${o.subjectCode} ${o.subjectName}` }]),
    ).values(),
  ];

  return (
    <div>
      <PageHeader
        title="Resources"
        description="Your teaching material, plus everything published across the institution that you are allowed to see."
        action={
          <ResourceForm
            subjects={subjects}
            canPublish={can(user, 'resource:publish')}
            storageAvailable={STORAGE_AVAILABLE}
            storageLimitation={STORAGE_LIMITATION}
          />
        }
      />

      {!STORAGE_AVAILABLE ? (
        <Alert tone="warning" title="File storage is not configured in this deployment" className="mb-5">
          {STORAGE_LIMITATION} Resources already in the library that reference a stored file will
          show their link as unavailable rather than a broken download.
        </Alert>
      ) : null}

      <Section title="Institution-wide search">
        <Card>
          <CardBody>
            <SearchBox initialQuery={query} />
            <p className="mt-2 text-[12px] text-subtle">
              PostgreSQL full-text search over title, topic, description and extracted text. Keyword
              matching, not semantic search — related wording that shares no keywords will not match.
            </p>
          </CardBody>
        </Card>

        {query ? (
          <Card className="mt-3">
            {results.length === 0 ? (
              <EmptyState
                icon={Search}
                title={`Nothing published matches "${query}"`}
                description="Try fewer or more general words. Only published resources you are permitted to see are searched."
              />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {results.map((r) => (
                  <li key={r.id} className="px-5 py-3.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <ResourceTitle
                          title={r.title}
                          externalUrl={r.externalUrl}
                          fileUrl={r.fileUrl}
                        />
                        <p className="mt-0.5 text-[12.5px] text-muted">
                          {r.subjectCode ? `${r.subjectCode} · ` : ''}
                          {r.topic ? `${r.topic} · ` : ''}
                          {r.ownerFirst ? `${r.ownerFirst} ${r.ownerLast}` : 'Unknown owner'} ·{' '}
                          {formatDate(r.createdAt)}
                        </p>
                        {r.description ? (
                          <p className="mt-1 text-[13px] leading-relaxed text-default">
                            {truncate(r.description, 220)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone="outline">{humanize(r.kind)}</Badge>
                        {r.isAiGenerated ? <AiLabel state="generated" /> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ) : null}
      </Section>

      <Section
        title="My resources"
        description={`${pluralize(mine.length, 'resource')} owned by you.`}
      >
        <Card>
          {mine.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="You have not added any resources"
              description="Add a link to material you already keep elsewhere, and it becomes findable by everyone you share it with."
            />
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {mine.map((r) => (
                <li
                  key={r.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <ResourceTitle
                      title={r.title}
                      externalUrl={r.externalUrl}
                      fileUrl={r.fileUrl}
                    />
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {r.subjectCode ? `${r.subjectCode} · ` : ''}
                      {r.topic ? `${r.topic} · ` : ''}
                      {formatDate(r.createdAt)} · {r.viewCount} views
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <Badge tone="outline">{humanize(r.kind)}</Badge>
                    <Badge tone="neutral">{r.visibility.toLowerCase()}</Badge>
                    <Badge
                      tone={
                        r.status === 'PUBLISHED'
                          ? 'success'
                          : r.status === 'AI_GENERATED_PENDING_REVIEW'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {humanize(r.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </Section>
    </div>
  );
}

/**
 * A resource is only clickable when there is somewhere real to go. A row whose
 * file lives in storage this build cannot reach says so rather than offering a
 * link that fails.
 */
function ResourceTitle({
  title,
  externalUrl,
  fileUrl,
}: {
  title: string;
  externalUrl: string | null;
  fileUrl: string | null;
}) {
  if (externalUrl) {
    return (
      <a
        href={externalUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-default hover:text-brand"
      >
        {title}
        <ExternalLink size={13} className="text-subtle" aria-hidden />
      </a>
    );
  }
  return (
    <span className="block">
      <span className="text-[13.5px] font-medium text-default">{title}</span>
      {fileUrl ? (
        <span className="ml-2 text-[12px] text-warning">
          stored file — not retrievable in this deployment
        </span>
      ) : (
        <span className="ml-2 text-[12px] text-subtle">no link recorded</span>
      )}
    </span>
  );
}
