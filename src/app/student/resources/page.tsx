import Link from 'next/link';
import {
  BookOpen,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  ListChecks,
  Presentation,
  Search,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  Input,
  PageHeader,
  Select,
} from '@/components/ui';
import { formatDate, humanize, pluralize, truncate } from '@/lib/utils';
import { isEnabled } from '@/lib/features';
import { requireStudentContext } from '../_lib/auth';
import { getEnrolledOfferings } from '../_lib/student';
import { AskAiLink, ModuleDisabled } from '../_components/bits';
import { studentResourceVisibility } from '@/services/resources';
import { ResourceSaveToggle } from '@/components/campus/ResourceSave';

export const metadata = { title: 'Resources' };
export const dynamic = 'force-dynamic';

const KIND_ICON: Record<string, LucideIcon> = {
  DOCUMENT: FileText,
  SLIDES: Presentation,
  SPREADSHEET: FileSpreadsheet,
  VIDEO: Video,
  LINK: Link2,
  IMAGE: ImageIcon,
  NOTES: BookOpen,
  QUESTION_BANK: ListChecks,
  LESSON_PLAN: FileText,
  OTHER: FileText,
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string; kind?: string }>;
}) {
  const user = await requireStudentContext('resource:view_department');

  if (!isEnabled(user.featureFlags, 'resource_hub_enabled')) {
    return (
      <>
        <PageHeader title="Resources" />
        <ModuleDisabled
          module="The Academic Resource Hub"
          blurb="Shared teaching material is not part of your institution's current configuration."
        />
      </>
    );
  }

  const { q, subject, kind } = await searchParams;
  const query = (q ?? '').trim();
  const offerings = await getEnrolledOfferings(user.institutionId, user.studentProfileId);
  const subjectIds = offerings.map((o) => o.subjectId);

  // One shared rule (services/resources): published material that is
  // institution-wide, from the student's department, or shared with their section.
  const filters: SQL[] = [studentResourceVisibility(user)];

  if (query) {
    // PostgreSQL full-text search over the generated `search_vector` column.
    filters.push(sql`${t.resources.searchVector} @@ plainto_tsquery('english', ${query})`);
  }
  if (subject && subjectIds.includes(subject)) {
    filters.push(eq(t.resources.subjectId, subject));
  }
  if (kind && kind in KIND_ICON) {
    filters.push(eq(t.resources.kind, kind as (typeof t.resources.kind.enumValues)[number]));
  }

  const rows = await db
    .select({
      id: t.resources.id,
      title: t.resources.title,
      description: t.resources.description,
      kind: t.resources.kind,
      topic: t.resources.topic,
      difficulty: t.resources.difficulty,
      academicYear: t.resources.academicYear,
      fileUrl: t.resources.fileUrl,
      fileName: t.resources.fileName,
      fileSizeBytes: t.resources.fileSizeBytes,
      externalUrl: t.resources.externalUrl,
      visibility: t.resources.visibility,
      isAiGenerated: t.resources.isAiGenerated,
      approvedAt: t.resources.approvedAt,
      createdAt: t.resources.createdAt,
      subjectCode: t.subjects.code,
      subjectName: t.subjects.name,
      departmentName: t.departments.name,
      ownerFirst: t.users.firstName,
      ownerLast: t.users.lastName,
      savedId: t.resourceSaves.id,
      rank: query
        ? sql<number>`ts_rank(${t.resources.searchVector}, plainto_tsquery('english', ${query}))`
        : sql<number>`0`,
    })
    .from(t.resources)
    .leftJoin(t.subjects, eq(t.subjects.id, t.resources.subjectId))
    .leftJoin(t.departments, eq(t.departments.id, t.resources.departmentId))
    .leftJoin(t.users, eq(t.users.id, t.resources.ownerId))
    .leftJoin(t.resourceSaves, and(eq(t.resourceSaves.resourceId, t.resources.id), eq(t.resourceSaves.userId, user.userId)))
    .where(and(...filters))
    .orderBy(
      query
        ? desc(
            sql`ts_rank(${t.resources.searchVector}, plainto_tsquery('english', ${query}))`,
          )
        : desc(t.resources.createdAt),
    )
    .limit(60);

  const kinds = Object.keys(KIND_ICON);

  return (
    <>
      <PageHeader
        title="Resources"
        description="Notes, slides and question banks published for your department and institution."
        action={
          query ? (
            <AskAiLink question={`Summarise what the resources about "${query}" cover.`} />
          ) : undefined
        }
      />

      {/* -------------------------------- Search ------------------------------ */}
      <Card className="mb-5">
        <CardBody className="p-4">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" method="get">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="resource-q"
                className="mb-1.5 block text-[13px] font-medium text-default"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-subtle"
                  aria-hidden
                />
                <Input
                  id="resource-q"
                  name="q"
                  defaultValue={query}
                  placeholder="cost of capital, normalisation, aseptic technique…"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="sm:w-44">
              <label
                htmlFor="resource-subject"
                className="mb-1.5 block text-[13px] font-medium text-default"
              >
                Subject
              </label>
              <Select id="resource-subject" name="subject" defaultValue={subject ?? ''}>
                <option value="">All subjects</option>
                {offerings.map((offering) => (
                  <option key={offering.subjectId} value={offering.subjectId}>
                    {offering.code}
                  </option>
                ))}
              </Select>
            </div>

            <div className="sm:w-44">
              <label
                htmlFor="resource-kind"
                className="mb-1.5 block text-[13px] font-medium text-default"
              >
                Type
              </label>
              <Select id="resource-kind" name="kind" defaultValue={kind ?? ''}>
                <option value="">All types</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {humanize(k)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" variant="primary" icon={Search}>
                Search
              </Button>
              {query || subject || kind ? (
                <Button asChild variant="ghost">
                  <Link href="/student/resources">Clear</Link>
                </Button>
              ) : null}
            </div>
          </form>
          <p className="mt-2.5 text-[12px] text-subtle">
            Keyword search over titles, descriptions and extracted text, using PostgreSQL full-text
            search. This is keyword matching, not semantic search.
          </p>
        </CardBody>
      </Card>

      {/* -------------------------------- Results ----------------------------- */}
      {rows.length === 0 ? (
        <Card>
          <CardBody className="p-0">
            <EmptyState
              icon={BookOpen}
              title={query ? `Nothing matched “${query}”` : 'No resources available to you'}
              description={
                query
                  ? 'Try a shorter phrase, or a single distinctive word. Search matches whole words, so partial words will not match.'
                  : 'Nothing has been published to your department or institution yet. Material your faculty share with your section will also appear here.'
              }
              action={
                query ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link href="/student/resources">Browse everything</Link>
                  </Button>
                ) : undefined
              }
            />
          </CardBody>
        </Card>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-muted">
            {pluralize(rows.length, 'resource')}
            {query ? ` matching “${query}”` : ''}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((row) => {
              const Icon = KIND_ICON[row.kind] ?? FileText;
              const href = row.externalUrl ?? row.fileUrl;

              return (
                <Card key={row.id}>
                  <CardBody className="flex gap-3.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken">
                      <Icon size={17} className="text-muted" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-semibold leading-snug text-default">
                          {row.title}
                        </p>
                        <Badge tone="neutral" className="shrink-0">
                          {humanize(row.kind)}
                        </Badge>
                      </div>

                      {row.description ? (
                        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                          {truncate(row.description, 180)}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-subtle">
                        {row.subjectCode ? (
                          <span className="text-muted">
                            {row.subjectCode} · {row.subjectName}
                          </span>
                        ) : null}
                        {row.topic ? <span>{row.topic}</span> : null}
                        {row.difficulty ? <span>{humanize(row.difficulty)}</span> : null}
                        {row.departmentName ? <span>{row.departmentName}</span> : null}
                        <span>
                          {row.ownerFirst ? `${row.ownerFirst} ${row.ownerLast ?? ''} · ` : ''}
                          {formatDate(row.createdAt)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <ResourceSaveToggle resourceId={row.id} saved={!!row.savedId} title={row.title} />
                        {href ? (
                          <Button asChild size="sm" variant="secondary">
                            <a
                              href={href}
                              target={row.externalUrl ? '_blank' : undefined}
                              rel={row.externalUrl ? 'noreferrer noopener' : undefined}
                            >
                              {row.externalUrl ? (
                                <>
                                  <ExternalLink size={14} aria-hidden />
                                  Open link
                                </>
                              ) : (
                                <>
                                  <Download size={14} aria-hidden />
                                  {row.fileName ?? 'Download'}
                                </>
                              )}
                            </a>
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-surface-sunken px-2 py-1 text-[11.5px] text-subtle">
                            No file attached yet
                          </span>
                        )}
                        <AskAiLink
                          question={`Explain the key ideas in the resource "${row.title}".`}
                          label="Ask AI"
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
