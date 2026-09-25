'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileUp, Upload } from 'lucide-react';
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Field, Select, Table, Td, Th,
} from '@/components/ui';
import { pluralize } from '@/lib/utils';

interface RowError { row: number; field: string; message: string; severity: 'ERROR' | 'WARNING' }
interface Validation {
  entityType: string;
  columnMapping: Record<string, string>;
  unmappedHeaders: string[];
  missingRequired: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowError[];
  preview: Record<string, string>[];
  rows: Record<string, string>[];
}

const ENTITIES = [
  { key: 'students', label: 'Students' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'sections', label: 'Sections' },
];

/**
 * Upload → detect → preview → validate → confirm → import.
 * The commit button stays disabled until validation has actually run and
 * produced at least one valid row.
 */
export function ImportWizard() {
  const router = useRouter();
  const [entityType, setEntityType] = React.useState('students');
  const [fileName, setFileName] = React.useState('');
  const [validation, setValidation] = React.useState<Validation | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ imported: number; skipped: number } | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setValidation(null);
    setFileName(file.name);

    if (file.size > 8_000_000) {
      setError('That file is larger than 8 MB. Split it into smaller files and import them in turn.');
      return;
    }

    const text = await file.text();
    setValidating(true);
    try {
      const res = await fetch('/api/import/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, csv: text }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setValidation(json.data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setValidating(false);
    }
  }

  async function commit() {
    if (!validation) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, fileName, rows: validation.rows }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(`${json.error.message}${json.error.hint ? ` ${json.error.hint}` : ''}`);
        return;
      }
      setResult(json.data);
      setValidation(null);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setCommitting(false);
    }
  }

  const blocked = (validation?.missingRequired.length ?? 0) > 0;

  return (
    <Card>
      <CardHeader
        title="Import a file"
        icon={Upload}
        description="CSV only. Column names are matched automatically against common ERP export formats."
      />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="What are you importing?" className="min-w-[200px]">
            <Select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setValidation(null);
                setResult(null);
              }}
            >
              {ENTITIES.map((e) => (
                <option key={e.key} value={e.key}>{e.label}</option>
              ))}
            </Select>
          </Field>

          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[hsl(var(--border-strong))] bg-surface px-3.5 text-sm font-medium text-default hover:bg-surface-sunken">
            <FileUp size={15} />
            {fileName || 'Choose CSV file'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>

          {validating ? <span className="text-[13px] text-muted">Validating…</span> : null}
        </div>

        {error ? (
          <Alert tone="danger" icon={AlertTriangle} title="Import problem">
            {error}
          </Alert>
        ) : null}

        {result ? (
          <Alert tone="success" icon={CheckCircle2} title="Import complete">
            {pluralize(result.imported, 'record')} imported
            {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}. New accounts are created in
            an invited state and must set a password before they can sign in.
          </Alert>
        ) : null}

        {validation ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 rounded-lg border border-[hsl(var(--border))] bg-surface-muted p-4">
              <Metric label="Rows in file" value={validation.totalRows} />
              <Metric label="Valid" value={validation.validRows} tone="success" />
              <Metric label="With errors" value={validation.errorRows} tone={validation.errorRows ? 'danger' : 'neutral'} />
            </div>

            {validation.missingRequired.length > 0 ? (
              <Alert tone="danger" icon={AlertTriangle} title="Required columns are missing">
                This file has no column matching: {validation.missingRequired.join(', ')}. Rename
                the headers in your export and try again.
              </Alert>
            ) : null}

            {validation.unmappedHeaders.length > 0 ? (
              <Alert tone="info" title="Columns that will be ignored">
                {validation.unmappedHeaders.join(', ')} — these do not map to any CampusOS field and
                will not be imported.
              </Alert>
            ) : null}

            {validation.errors.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-default">
                  Problems found ({validation.errors.length} shown)
                </p>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-[hsl(var(--border))]">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Row</Th>
                        <Th>Field</Th>
                        <Th>Problem</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {validation.errors.map((e, i) => (
                        <tr key={i}>
                          <Td><span className="tabular text-[12.5px]">{e.row}</span></Td>
                          <Td>
                            <Badge tone={e.severity === 'ERROR' ? 'danger' : 'warning'}>
                              {e.field}
                            </Badge>
                          </Td>
                          <Td><span className="text-[12.5px] text-default">{e.message}</span></Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            ) : null}

            {validation.preview.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[13px] font-semibold text-default">Preview of valid rows</p>
                <div className="overflow-x-auto rounded-lg border border-[hsl(var(--border))]">
                  <Table>
                    <thead>
                      <tr>
                        {Object.keys(validation.preview[0]!).map((k) => (
                          <Th key={k}>{k}</Th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validation.preview.map((row, i) => (
                        <tr key={i}>
                          {Object.keys(validation.preview[0]!).map((k) => (
                            <Td key={k}>
                              <span className="text-[12.5px] text-muted">{row[k] || '—'}</span>
                            </Td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            ) : null}

            <Button
              variant="primary"
              icon={Upload}
              loading={committing}
              disabled={blocked || validation.validRows === 0}
              onClick={commit}
            >
              Import {pluralize(validation.validRows, 'valid row')}
              {validation.errorRows > 0 ? ` (skip ${validation.errorRows})` : ''}
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Metric({
  label, value, tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-default';
  return (
    <div>
      <p className="text-[12px] text-muted">{label}</p>
      <p className={`text-xl font-semibold tabular ${color}`}>{value}</p>
    </div>
  );
}
