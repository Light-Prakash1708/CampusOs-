import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentUser, type AuthContext } from '@/lib/auth/context';
import type { Permission } from '@/lib/auth/permissions';

/**
 * API route helpers.
 *
 * Every route handler goes through `withAuth`, which guarantees:
 *   - an authenticated caller
 *   - the required capability
 *   - a consistent error envelope (never a bare "Something went wrong")
 *   - that unhandled exceptions are logged server-side but not leaked
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    readonly code: string = 'BAD_REQUEST',
    readonly details?: unknown,
    /** Actionable guidance shown to the user. */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown, hint?: string) {
    super(message, 409, 'CONFLICT', details, hint);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(what = 'Record') {
    super(`${what} not found.`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Some of the information provided is not valid.',
          hint: 'Check the highlighted fields and try again.',
          details: error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        },
      },
      { status: error.status },
    );
  }

  // Map Postgres integrity violations to meaningful product errors rather than
  // leaking driver internals.
  const pgError = error as { code?: string; constraint?: string; message?: string };
  if (pgError?.code === '23505') {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'CONFLICT',
          message: describeUniqueViolation(pgError.constraint),
          hint: 'Refresh to see the current state, then try a different option.',
        },
      },
      { status: 409 },
    );
  }
  if (pgError?.code === '23503') {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'REFERENCE_ERROR',
          message: 'This action refers to a record that no longer exists.',
          hint: 'Refresh the page and try again.',
        },
      },
      { status: 409 },
    );
  }

  const requestId = crypto.randomUUID();
  console.error(`[campusos:${requestId}]`, error);
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The server could not complete this action.',
        hint: 'Try again. If it keeps happening, quote this reference to support.',
        requestId,
      },
    },
    { status: 500 },
  );
}

function describeUniqueViolation(constraint?: string): string {
  if (!constraint) return 'That record already exists.';
  const map: Record<string, string> = {
    timetable_room_slot_uq: 'That room is already booked for this period.',
    timetable_faculty_slot_uq: 'That faculty member already has a class in this period.',
    timetable_section_slot_uq: 'That section already has a class in this period.',
    timetable_one_published_per_term_uq:
      'A timetable is already published for this term. Withdraw it before publishing another.',
    assessment_room_uq: 'That room is already allocated to this exam.',
    assessment_invigilator_uq: 'That invigilator is already assigned to this exam.',
    users_email_uq: 'An account with that email already exists at this institution.',
    student_profiles_roll_uq: 'That roll number is already in use.',
    faculty_profiles_code_uq: 'That employee code is already in use.',
    rooms_code_uq: 'A room with that code already exists.',
    subjects_code_uq: 'A subject with that code already exists.',
    sections_code_uq: 'A section with that code already exists.',
    announcement_recipients_uq: 'That recipient has already been added.',
    attendance_records_uq: 'Attendance has already been recorded for this student in this session.',
    enrollments_uq: 'That student is already enrolled in this course.',
  };
  return map[constraint] ?? 'That record already exists.';
}

type Handler = (
  request: Request,
  ctx: { user: AuthContext; params: Record<string, string> },
) => Promise<Response>;

/**
 * Wraps a route handler with authentication, authorization and error mapping.
 *
 * The returned signature matches Next.js 15's RouteContext, where dynamic
 * params arrive as a Promise. Static routes simply receive an empty object.
 */
export function withAuth(permission: Permission | Permission[] | null, handler: Handler) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    try {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Your session has ended.',
              hint: 'Sign in again to continue.',
            },
          },
          { status: 401 },
        );
      }

      if (permission) {
        const required = Array.isArray(permission) ? permission : [permission];
        if (!required.some((p) => user.permissions.has(p))) {
          throw new ForbiddenError();
        }
      }

      const raw = context?.params ? await context.params : {};
      // Catch-all segments arrive as arrays; route handlers here expect strings.
      const params = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? (v[0] ?? '') : v]),
      ) as Record<string, string>;
      return await handler(request, { user, params });
    } catch (error) {
      return fail(error);
    }
  };
}

/** Parses and validates a JSON body, returning a 422 envelope on failure. */
export async function parseBody<T>(
  request: Request,
  schema: { parse: (input: unknown) => T },
): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError('Request body must be valid JSON.', 400, 'INVALID_JSON');
  }
  return schema.parse(raw);
}
