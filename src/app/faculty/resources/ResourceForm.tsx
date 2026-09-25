'use client';

import * as React from 'react';
import { Link2, Lock, Plus, Upload } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { useMutation } from '../_components/useMutation';
import { MutationError } from '../_components/MutationError';

const KINDS = [
  'NOTES',
  'SLIDES',
  'DOCUMENT',
  'SPREADSHEET',
  'VIDEO',
  'LINK',
  'IMAGE',
  'QUESTION_BANK',
  'LESSON_PLAN',
  'OTHER',
] as const;

export function ResourceForm({
  subjects,
  canPublish,
  storageAvailable,
  storageLimitation,
}: {
  subjects: { id: string; label: string }[];
  canPublish: boolean;
  storageAvailable: boolean;
  storageLimitation: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [kind, setKind] = React.useState<string>('NOTES');
  const [externalUrl, setExternalUrl] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [topic, setTopic] = React.useState('');
  const [difficulty, setDifficulty] = React.useState('');
  const [visibility, setVisibility] = React.useState('DEPARTMENT');
  const [tagInput, setTagInput] = React.useState('');
  const [tags, setTags] = React.useState<string[]>([]);

  const mutation = useMutation<{ id: string; status: string }>();
  const [uploaded, setUploaded] = React.useState<{ id: string; name: string; sizeBytes: number; scanStatus: string } | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);

  const urlValid = /^https?:\/\/.+/i.test(externalUrl.trim());
  const canSave = title.trim().length >= 3 && (urlValid || !!uploaded);

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('purpose', 'RESOURCE');
      const res = await fetch('/api/files', { method: 'POST', body: form });
      const json = await res.json();
      if (!json.ok) {
        setUploadError(json.error?.message ?? 'Upload failed.');
      } else {
        setUploaded(json.data);
        if (!title.trim()) setTitle(json.data.name.replace(/\.[a-z0-9]+$/i, ''));
      }
    } catch {
      setUploadError('Could not reach the server. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  function addTag() {
    const tag = tagInput.trim();
    if (!tag || tags.includes(tag) || tags.length >= 12) return;
    setTags((prev) => [...prev, tag]);
    setTagInput('');
  }

  async function save() {
    if (!canSave) return;
    const data = await mutation.run('/api/faculty/resources', {
      body: {
        title: title.trim(),
        description: description.trim() || undefined,
        kind,
        externalUrl: uploaded ? undefined : externalUrl.trim(),
        fileId: uploaded?.id,
        subjectId: subjectId || null,
        topic: topic.trim() || undefined,
        difficulty: difficulty || null,
        visibility,
        tags,
        publish: canPublish,
      },
    });
    if (data) {
      setTitle('');
      setDescription('');
      setExternalUrl('');
      setUploaded(null);
      setTopic('');
      setTags([]);
    }
  }

  if (!open) {
    return (
      <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>
        Add a resource
      </Button>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Add a resource"
        description="Link-backed resources are indexed for institution-wide search as soon as they are published."
        action={
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      />
      <CardBody className="space-y-4">
        {!storageAvailable ? (
          <Alert tone="warning" icon={Lock} title="File upload is unavailable in this deployment">
            {storageLimitation}
          </Alert>
        ) : null}

        {storageAvailable ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-[hsl(var(--border-strong))] bg-surface-sunken px-4 py-5">
            <Upload size={18} className="text-subtle" aria-hidden />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-default">
                {uploaded ? uploaded.name : 'Upload a file'}
              </p>
              <p className="text-[12.5px] text-muted">
                {uploaded
                  ? `${(uploaded.sizeBytes / 1024 / 1024).toFixed(2)} MB · stored privately${uploaded.scanStatus === 'NOT_SCANNED' ? ' · not virus-scanned' : ''}`
                  : 'PDF, Word, PowerPoint, Excel or an image. Or paste a link below instead.'}
              </p>
              {uploadError ? (
                <p className="mt-1 text-[12.5px] text-danger" role="alert">{uploadError}</p>
              ) : null}
            </div>
            <label className="ml-auto">
              <span className="sr-only">Choose file</span>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = '';
                }}
              />
              <span className="inline-flex h-8 cursor-pointer items-center rounded-md border border-[hsl(var(--border))] bg-surface px-3 text-[12.5px] font-medium text-default hover:bg-surface-sunken">
                {uploading ? 'Uploading…' : uploaded ? 'Replace' : 'Choose file'}
              </span>
            </label>
          </div>
        ) : null}

        <Field label="Title" htmlFor="res-title" required>
          <Input
            id="res-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weighted Average Cost of Capital — worked examples"
            maxLength={200}
          />
        </Field>

        <Field
          label="Link"
          htmlFor="res-url"
          required
          hint="Where the material already lives. CampusOS stores the link and its metadata, not the file."
          error={externalUrl.length > 0 && !urlValid ? 'Enter a full URL starting with https://' : undefined}
        >
          <Input
            id="res-url"
            value={externalUrl}
            onChange={(e) => setExternalUrl(e.target.value)}
            placeholder="https://"
            inputMode="url"
          />
        </Field>

        <Field label="Description" htmlFor="res-desc" hint="Indexed for search.">
          <Textarea
            id="res-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Kind" htmlFor="res-kind">
            <Select id="res-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subject" htmlFor="res-subject">
            <Select
              id="res-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
            >
              <option value="">Not subject-specific</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Difficulty" htmlFor="res-diff">
            <Select
              id="res-diff"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="">Not stated</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Topic" htmlFor="res-topic" hint="Weighted highly in search.">
            <Input
              id="res-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="Who can see it" htmlFor="res-vis">
            <Select
              id="res-vis"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
            >
              <option value="PRIVATE">Only me</option>
              <option value="DEPARTMENT">My department</option>
              <option value="INSTITUTION">Everyone at the institution</option>
            </Select>
          </Field>
        </div>

        <Field label="Tags" htmlFor="res-tag">
          <div className="flex gap-2">
            <Input
              id="res-tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag"
            />
            <Button variant="secondary" onClick={addTag}>
              Add
            </Button>
          </div>
        </Field>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                aria-label={`Remove ${tag}`}
              >
                <Badge tone="brand">{tag} ×</Badge>
              </button>
            ))}
          </div>
        ) : null}

        <MutationError error={mutation.error} title="The resource was not saved" />
        {mutation.succeeded && mutation.data ? (
          <Alert tone="success" icon={Link2} title="Resource saved">
            Saved as {mutation.data.status.toLowerCase()}.
            {mutation.data.status === 'PUBLISHED'
              ? ' It is now findable in institution-wide search.'
              : ' It stays private to you until an approver publishes it.'}
          </Alert>
        ) : null}
      </CardBody>
      <CardFooter>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            loading={mutation.pending}
            disabled={!canSave}
            onClick={save}
          >
            {canPublish ? 'Save and publish' : 'Save as draft'}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {!canPublish ? (
            <span className="text-[12px] text-subtle">
              You do not hold resource:publish, so this is saved as a draft.
            </span>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
