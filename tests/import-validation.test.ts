import { describe, it, expect } from 'vitest';
import { parseCsv, detectColumns, IMPORT_SPECS } from '@/services/import';

/**
 * Import is where a college's real, messy data meets the system. These cover
 * the parsing and column-detection logic, which must never silently mangle a
 * row.
 */
describe('CSV parsing', () => {
  it('handles quoted fields containing commas and newlines', () => {
    const csv = 'name,note\n"Sharma, Meera","Line one\nLine two"\nRao,Simple';
    const { headers, rows } = parseCsv(csv);
    expect(headers).toEqual(['name', 'note']);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['Sharma, Meera', 'Line one\nLine two']);
    expect(rows[1]).toEqual(['Rao', 'Simple']);
  });

  it('handles escaped double quotes', () => {
    const { rows } = parseCsv('a\n"He said ""hello"""');
    expect(rows[0]?.[0]).toBe('He said "hello"');
  });

  it('strips a UTF-8 BOM, which Excel exports include', () => {
    const { headers } = parseCsv('﻿roll_no,name\n123,Test');
    expect(headers[0]).toBe('roll_no');
  });

  it('normalises CRLF line endings from Windows exports', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n3,4');
    expect(rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('ignores entirely blank lines', () => {
    const { rows } = parseCsv('a,b\n1,2\n\n\n3,4\n');
    expect(rows).toHaveLength(2);
  });
});

describe('column detection', () => {
  it('maps common Indian ERP header names onto canonical fields', () => {
    const { mapping, missingRequired } = detectColumns('students', [
      'Roll No', 'First Name', 'Surname', 'E-Mail', 'Branch', 'Division',
    ]);
    expect(mapping['Roll No']).toBe('rollNumber');
    expect(mapping['First Name']).toBe('firstName');
    expect(mapping['Surname']).toBe('lastName');
    expect(mapping['E-Mail']).toBe('email');
    expect(mapping['Branch']).toBe('programCode');
    expect(mapping['Division']).toBe('sectionCode');
    expect(missingRequired).toHaveLength(0);
  });

  it('reports required columns that are absent instead of guessing', () => {
    const { missingRequired } = detectColumns('students', ['Name', 'Phone']);
    expect(missingRequired).toContain('Roll number');
    expect(missingRequired).toContain('Email');
    expect(missingRequired).toContain('Programme code');
  });

  it('lists unmapped columns so nothing is silently dropped', () => {
    const { unmapped } = detectColumns('rooms', ['room_no', 'seats', 'Asset Tag', 'Notes']);
    expect(unmapped).toContain('Asset Tag');
    expect(unmapped).toContain('Notes');
  });

  it('never maps two file columns onto the same field', () => {
    const { mapping } = detectColumns('students', ['name', 'first_name', 'email', 'roll', 'program']);
    const fields = Object.values(mapping);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('declares at least one required column for every entity', () => {
    for (const [entity, spec] of Object.entries(IMPORT_SPECS)) {
      expect(spec.columns.some((c) => c.required), `${entity} has no required column`).toBe(true);
    }
  });
});
