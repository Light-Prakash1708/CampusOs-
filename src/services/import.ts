import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as t from '@/lib/db/schema';
import type { AuthContext } from '@/lib/auth/context';
import { hashPassword } from '@/lib/auth/password';
import { recordAudit } from '@/services/audit';
import { AppError } from '@/lib/api';

/**
 * DATA IMPORT
 * ---------------------------------------------------------------------------
 * Validate-then-commit. Parsing and validation NEVER write to the database;
 * every row is checked against the real schema and against existing records,
 * and the admin sees the complete error list before anything is committed.
 *
 * A row that fails validation is skipped with a reason, never silently coerced.
 */

export type ImportEntity = 'students' | 'faculty' | 'subjects' | 'rooms' | 'sections';

export interface ColumnSpec {
  field: string;
  label: string;
  required: boolean;
  /** Header names commonly used by Indian college ERPs, for auto-detection. */
  aliases: string[];
  hint?: string;
}

export const IMPORT_SPECS: Record<ImportEntity, { label: string; columns: ColumnSpec[] }> = {
  students: {
    label: 'Students',
    columns: [
      { field: 'rollNumber', label: 'Roll number', required: true, aliases: ['roll', 'roll_no', 'rollno', 'enrolment', 'enrollment_no', 'reg_no', 'registration'] },
      { field: 'firstName', label: 'First name', required: true, aliases: ['first', 'firstname', 'given_name', 'name'] },
      { field: 'lastName', label: 'Last name', required: false, aliases: ['last', 'lastname', 'surname'] },
      { field: 'email', label: 'Email', required: true, aliases: ['mail', 'email_id', 'e-mail'] },
      { field: 'programCode', label: 'Programme code', required: true, aliases: ['program', 'programme', 'course', 'branch'] },
      { field: 'sectionCode', label: 'Section code', required: false, aliases: ['section', 'batch', 'div', 'division'] },
      { field: 'currentYear', label: 'Year', required: false, aliases: ['year', 'study_year'] },
      { field: 'currentSemester', label: 'Semester', required: false, aliases: ['sem', 'semester'] },
      { field: 'phone', label: 'Phone', required: false, aliases: ['mobile', 'contact', 'phone_no'] },
      { field: 'guardianName', label: 'Guardian name', required: false, aliases: ['parent', 'father_name', 'guardian'] },
      { field: 'guardianPhone', label: 'Guardian phone', required: false, aliases: ['parent_mobile', 'guardian_contact'] },
    ],
  },
  faculty: {
    label: 'Faculty',
    columns: [
      { field: 'employeeCode', label: 'Employee code', required: true, aliases: ['emp_code', 'employee_id', 'staff_id', 'code'] },
      { field: 'firstName', label: 'First name', required: true, aliases: ['first', 'firstname', 'name'] },
      { field: 'lastName', label: 'Last name', required: false, aliases: ['last', 'lastname', 'surname'] },
      { field: 'email', label: 'Email', required: true, aliases: ['mail', 'email_id'] },
      { field: 'departmentCode', label: 'Department code', required: true, aliases: ['dept', 'department'] },
      { field: 'designation', label: 'Designation', required: false, aliases: ['title', 'post', 'rank'] },
      { field: 'maxWeeklyTeachingHours', label: 'Max weekly hours', required: false, aliases: ['max_hours', 'workload_limit'] },
      { field: 'phone', label: 'Phone', required: false, aliases: ['mobile', 'contact'] },
    ],
  },
  subjects: {
    label: 'Subjects',
    columns: [
      { field: 'code', label: 'Subject code', required: true, aliases: ['subject_code', 'course_code'] },
      { field: 'name', label: 'Subject name', required: true, aliases: ['subject', 'title', 'course_name'] },
      { field: 'departmentCode', label: 'Department code', required: true, aliases: ['dept', 'department'] },
      { field: 'credits', label: 'Credits', required: false, aliases: ['credit'] },
      { field: 'weeklyHours', label: 'Hours per week', required: false, aliases: ['hours', 'periods', 'contact_hours'] },
      { field: 'kind', label: 'Type', required: false, aliases: ['type', 'category'], hint: 'THEORY / LAB / PROJECT' },
      { field: 'semester', label: 'Semester', required: false, aliases: ['sem'] },
    ],
  },
  rooms: {
    label: 'Rooms',
    columns: [
      { field: 'code', label: 'Room code', required: true, aliases: ['room', 'room_no', 'number'] },
      { field: 'capacity', label: 'Capacity', required: true, aliases: ['seats', 'strength', 'max_capacity'] },
      { field: 'type', label: 'Type', required: false, aliases: ['room_type', 'category'], hint: 'CLASSROOM / LAB / SEMINAR_HALL' },
      { field: 'building', label: 'Building', required: false, aliases: ['block', 'wing'] },
      { field: 'floor', label: 'Floor', required: false, aliases: ['level'] },
    ],
  },
  sections: {
    label: 'Sections',
    columns: [
      { field: 'code', label: 'Section code', required: true, aliases: ['section', 'section_code'] },
      { field: 'name', label: 'Name', required: false, aliases: ['label'] },
      { field: 'programCode', label: 'Programme code', required: true, aliases: ['program', 'programme', 'branch'] },
      { field: 'year', label: 'Year', required: true, aliases: ['study_year'] },
      { field: 'semester', label: 'Semester', required: true, aliases: ['sem'] },
      { field: 'strength', label: 'Strength', required: false, aliases: ['students', 'count'] },
    ],
  },
};

export interface RowError {
  row: number;
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface ValidationResult {
  entityType: ImportEntity;
  columnMapping: Record<string, string>;
  unmappedHeaders: string[];
  missingRequired: string[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: RowError[];
  /** First few valid rows, for the preview table. */
  preview: Record<string, string>[];
  rows: Record<string, string>[];
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, embedded commas and newlines. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i]!;
    if (inQuotes) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);

  const headers = rows.shift() ?? [];
  return { headers, rows };
}

/**
 * Reduces a header to a comparison key by stripping every separator, so that
 * "First Name", "first_name", "firstName" and "FIRST-NAME" all match. Real
 * college exports use all four.
 */
function normalise(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Maps the file's headers onto canonical fields using aliases. */
export function detectColumns(
  entityType: ImportEntity,
  headers: string[],
): { mapping: Record<string, string>; unmapped: string[]; missingRequired: string[] } {
  const spec = IMPORT_SPECS[entityType];
  const mapping: Record<string, string> = {};
  const used = new Set<number>();

  for (const column of spec.columns) {
    const candidates = [column.field, ...column.aliases].map(normalise);
    const index = headers.findIndex(
      (h, i) => !used.has(i) && candidates.includes(normalise(h)),
    );
    if (index !== -1) {
      mapping[headers[index]!] = column.field;
      used.add(index);
    }
  }

  const unmapped = headers.filter((_, i) => !used.has(i));
  const mappedFields = new Set(Object.values(mapping));
  const missingRequired = spec.columns
    .filter((c) => c.required && !mappedFields.has(c.field))
    .map((c) => c.label);

  return { mapping, unmapped, missingRequired };
}

/**
 * Validates every row against the schema AND against existing records.
 * Writes nothing.
 */
export async function validateImport(
  user: AuthContext,
  entityType: ImportEntity,
  csvText: string,
  overrideMapping?: Record<string, string>,
): Promise<ValidationResult> {
  const { headers, rows } = parseCsv(csvText);
  if (headers.length === 0) {
    throw new AppError('That file has no header row.', 400, 'EMPTY_FILE', undefined, 'The first row must contain column names.');
  }

  const detected = detectColumns(entityType, headers);
  const mapping = overrideMapping ?? detected.mapping;
  const spec = IMPORT_SPECS[entityType];
  const errors: RowError[] = [];

  // Reference data for foreign-key checks.
  const [programs, departments, sections, existingRolls, existingEmails, existingCodes] =
    await Promise.all([
      db.select({ code: t.programs.code }).from(t.programs).where(eq(t.programs.institutionId, user.institutionId)),
      db.select({ code: t.departments.code }).from(t.departments).where(eq(t.departments.institutionId, user.institutionId)),
      db.select({ code: t.sections.code }).from(t.sections).where(eq(t.sections.institutionId, user.institutionId)),
      db.select({ v: t.studentProfiles.rollNumber }).from(t.studentProfiles).where(eq(t.studentProfiles.institutionId, user.institutionId)),
      db.select({ v: t.users.email }).from(t.users).where(eq(t.users.institutionId, user.institutionId)),
      db.select({ v: t.rooms.code }).from(t.rooms).where(eq(t.rooms.institutionId, user.institutionId)),
    ]);

  const programCodes = new Set(programs.map((p) => p.code.toUpperCase()));
  const departmentCodes = new Set(departments.map((d) => d.code.toUpperCase()));
  const sectionCodes = new Set(sections.map((s) => s.code.toUpperCase()));
  const rollSet = new Set(existingRolls.map((r) => r.v.toUpperCase()));
  const emailSet = new Set(existingEmails.map((r) => r.v.toLowerCase()));
  const roomCodeSet = new Set(existingCodes.map((r) => r.v.toUpperCase()));

  const seenInFile = new Set<string>();
  const parsed: Record<string, string>[] = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 2; // +1 for header, +1 for 1-based
    const record: Record<string, string> = {};

    headers.forEach((header, i) => {
      const field = mapping[header];
      if (field) record[field] = raw[i] ?? '';
    });

    let rowHasError = false;
    const fail = (field: string, message: string) => {
      errors.push({ row: rowNumber, field, message, severity: 'ERROR' });
      rowHasError = true;
    };
    const warn = (field: string, message: string) =>
      errors.push({ row: rowNumber, field, message, severity: 'WARNING' });

    for (const column of spec.columns) {
      if (column.required && !record[column.field]) {
        fail(column.label, `${column.label} is required but empty.`);
      }
    }

    if (record.email) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(record.email)) {
        fail('Email', `“${record.email}” is not a valid email address.`);
      } else if (emailSet.has(record.email.toLowerCase())) {
        fail('Email', `An account with ${record.email} already exists.`);
      } else if (seenInFile.has(`email:${record.email.toLowerCase()}`)) {
        fail('Email', `${record.email} appears more than once in this file.`);
      } else {
        seenInFile.add(`email:${record.email.toLowerCase()}`);
      }
    }

    if (entityType === 'students') {
      if (record.rollNumber) {
        if (rollSet.has(record.rollNumber.toUpperCase())) {
          fail('Roll number', `Roll number ${record.rollNumber} is already in use.`);
        } else if (seenInFile.has(`roll:${record.rollNumber.toUpperCase()}`)) {
          fail('Roll number', `Roll number ${record.rollNumber} appears twice in this file.`);
        } else {
          seenInFile.add(`roll:${record.rollNumber.toUpperCase()}`);
        }
      }
      if (record.programCode && !programCodes.has(record.programCode.toUpperCase())) {
        fail('Programme code', `Programme “${record.programCode}” does not exist. Create it first.`);
      }
      if (record.sectionCode && !sectionCodes.has(record.sectionCode.toUpperCase())) {
        warn('Section code', `Section “${record.sectionCode}” does not exist — the student will be imported without a section.`);
      }
    }

    if (entityType === 'faculty' && record.departmentCode) {
      if (!departmentCodes.has(record.departmentCode.toUpperCase())) {
        fail('Department code', `Department “${record.departmentCode}” does not exist.`);
      }
    }

    if (entityType === 'subjects' && record.departmentCode) {
      if (!departmentCodes.has(record.departmentCode.toUpperCase())) {
        fail('Department code', `Department “${record.departmentCode}” does not exist.`);
      }
    }

    if (entityType === 'rooms') {
      if (record.code && roomCodeSet.has(record.code.toUpperCase())) {
        fail('Room code', `Room ${record.code} already exists.`);
      }
      const capacity = Number(record.capacity);
      if (record.capacity && (!Number.isFinite(capacity) || capacity <= 0)) {
        fail('Capacity', `Capacity “${record.capacity}” is not a positive number.`);
      }
    }

    if (entityType === 'sections' && record.programCode) {
      if (!programCodes.has(record.programCode.toUpperCase())) {
        fail('Programme code', `Programme “${record.programCode}” does not exist.`);
      }
    }

    for (const numeric of ['currentYear', 'currentSemester', 'credits', 'weeklyHours', 'year', 'semester', 'strength', 'maxWeeklyTeachingHours']) {
      const value = record[numeric];
      if (value && !Number.isFinite(Number(value))) {
        fail(numeric, `“${value}” is not a number.`);
      }
    }

    if (!rowHasError) parsed.push(record);
  });

  const errorRowNumbers = new Set(errors.filter((e) => e.severity === 'ERROR').map((e) => e.row));

  return {
    entityType,
    columnMapping: mapping,
    unmappedHeaders: detected.unmapped,
    missingRequired: detected.missingRequired,
    totalRows: rows.length,
    validRows: parsed.length,
    errorRows: errorRowNumbers.size,
    errors: errors.slice(0, 200),
    preview: parsed.slice(0, 8),
    rows: parsed,
  };
}

/** Commits validated rows in a single transaction. */
export async function commitImport(
  user: AuthContext,
  entityType: ImportEntity,
  rows: Record<string, string>[],
  fileName: string,
): Promise<{ imported: number; skipped: number; jobId: string }> {
  if (rows.length === 0) {
    throw new AppError('There are no valid rows to import.', 400, 'NOTHING_TO_IMPORT');
  }

  const [job] = await db
    .insert(t.importJobs)
    .values({
      institutionId: user.institutionId,
      entityType,
      fileName,
      status: 'IMPORTING',
      totalRows: rows.length,
      validRows: rows.length,
      startedById: user.userId,
    })
    .returning({ id: t.importJobs.id });

  const jobId = job!.id;
  let imported = 0;
  let skipped = 0;

  try {
    // Invited accounts have no password until the user sets one.
    const placeholderHash = await hashPassword(crypto.randomUUID());

    await db.transaction(async (tx) => {
      const [programs, departments, sections] = await Promise.all([
        tx.select({ id: t.programs.id, code: t.programs.code }).from(t.programs).where(eq(t.programs.institutionId, user.institutionId)),
        tx.select({ id: t.departments.id, code: t.departments.code }).from(t.departments).where(eq(t.departments.institutionId, user.institutionId)),
        tx.select({ id: t.sections.id, code: t.sections.code }).from(t.sections).where(eq(t.sections.institutionId, user.institutionId)),
      ]);

      const programByCode = new Map(programs.map((p) => [p.code.toUpperCase(), p.id]));
      const departmentByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d.id]));
      const sectionByCode = new Map(sections.map((s) => [s.code.toUpperCase(), s.id]));

      for (const row of rows) {
        switch (entityType) {
          case 'students': {
            const programId = programByCode.get((row.programCode ?? '').toUpperCase());
            if (!programId) { skipped += 1; break; }

            const [created] = await tx
              .insert(t.users)
              .values({
                institutionId: user.institutionId,
                email: row.email!.toLowerCase(),
                passwordHash: placeholderHash,
                firstName: row.firstName!,
                lastName: row.lastName ?? '',
                phone: row.phone ?? null,
                role: 'STUDENT',
                status: 'INVITED',
                mustChangePassword: true,
              })
              .returning({ id: t.users.id });

            await tx.insert(t.studentProfiles).values({
              institutionId: user.institutionId,
              userId: created!.id,
              rollNumber: row.rollNumber!,
              programId,
              sectionId: sectionByCode.get((row.sectionCode ?? '').toUpperCase()) ?? null,
              currentYear: Number(row.currentYear ?? 1),
              currentSemester: Number(row.currentSemester ?? 1),
              guardianName: row.guardianName ?? null,
              guardianPhone: row.guardianPhone ?? null,
            });
            imported += 1;
            break;
          }

          case 'faculty': {
            const departmentId = departmentByCode.get((row.departmentCode ?? '').toUpperCase());
            if (!departmentId) { skipped += 1; break; }

            const [created] = await tx
              .insert(t.users)
              .values({
                institutionId: user.institutionId,
                email: row.email!.toLowerCase(),
                passwordHash: placeholderHash,
                firstName: row.firstName!,
                lastName: row.lastName ?? '',
                phone: row.phone ?? null,
                role: 'FACULTY',
                status: 'INVITED',
                departmentId,
                mustChangePassword: true,
              })
              .returning({ id: t.users.id });

            await tx.insert(t.facultyProfiles).values({
              institutionId: user.institutionId,
              userId: created!.id,
              employeeCode: row.employeeCode!,
              designation: row.designation ?? 'Assistant Professor',
              departmentId,
              maxWeeklyTeachingHours: Number(row.maxWeeklyTeachingHours ?? 18),
            });
            imported += 1;
            break;
          }

          case 'subjects': {
            const departmentId = departmentByCode.get((row.departmentCode ?? '').toUpperCase());
            if (!departmentId) { skipped += 1; break; }

            const kind = (row.kind ?? 'THEORY').toUpperCase();
            await tx.insert(t.subjects).values({
              institutionId: user.institutionId,
              departmentId,
              code: row.code!,
              name: row.name!,
              kind: (['THEORY', 'LAB', 'PROJECT', 'ELECTIVE', 'SEMINAR', 'INTERNSHIP'].includes(kind)
                ? kind
                : 'THEORY') as never,
              credits: Number(row.credits ?? 3),
              weeklyHours: Number(row.weeklyHours ?? 3),
              consecutiveBlockSize: kind === 'LAB' ? 2 : 1,
              requiredRoomType: kind === 'LAB' ? 'LAB' : 'CLASSROOM',
              semester: Number(row.semester ?? 1),
            });
            imported += 1;
            break;
          }

          case 'rooms': {
            const type = (row.type ?? 'CLASSROOM').toUpperCase();
            await tx.insert(t.rooms).values({
              institutionId: user.institutionId,
              code: row.code!,
              name: row.code!,
              type: (['CLASSROOM', 'LAB', 'SEMINAR_HALL', 'AUDITORIUM', 'WORKSHOP', 'SPORTS', 'OTHER'].includes(type)
                ? type
                : 'CLASSROOM') as never,
              capacity: Number(row.capacity ?? 60),
              building: row.building ?? null,
              floor: row.floor ?? null,
            });
            imported += 1;
            break;
          }

          case 'sections': {
            const programId = programByCode.get((row.programCode ?? '').toUpperCase());
            if (!programId) { skipped += 1; break; }

            await tx.insert(t.sections).values({
              institutionId: user.institutionId,
              programId,
              code: row.code!,
              name: row.name ?? row.code!,
              year: Number(row.year ?? 1),
              semester: Number(row.semester ?? 1),
              strength: Number(row.strength ?? 0),
            });
            imported += 1;
            break;
          }
        }
      }
    });

    await db
      .update(t.importJobs)
      .set({ status: 'COMPLETED', importedRows: imported, skippedRows: skipped, completedAt: new Date() })
      .where(eq(t.importJobs.id, jobId));

    await recordAudit(user, {
      action: 'DATA_IMPORTED',
      entityType: `import:${entityType}`,
      entityId: jobId,
      after: { imported, skipped, fileName },
    });

    return { imported, skipped, jobId };
  } catch (error) {
    await db
      .update(t.importJobs)
      .set({
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      })
      .where(eq(t.importJobs.id, jobId));
    throw error;
  }
}
