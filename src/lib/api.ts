import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getCurrentUser, type AuthContext } from '@/lib/auth/context';
import type { Permission } from '@/lib/auth/permissions';
import { FEATURE_FLAGS, isEnabled, type FeatureFlag } from '@/lib/features';
import { reportError } from '@/lib/logger';

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

export function fail(error: unknown, requestId?: string | null) {
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
    const headers: Record<string, string> = {};
    if (error.code === 'RATE_LIMITED') {
      const retry = (error.details as { retryAfter?: number } | undefined)?.retryAfter;
      if (retry) headers['Retry-After'] = String(retry);
    }
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
      { status: error.status, headers },
    );
  }

  // Map Postgres integrity violations to meaningful product errors rather than
  // leaking driver internals.
  const pgError = pgErrorOf(error);
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

  const ref = requestId ?? crypto.randomUUID();
  reportError(error, { requestId: ref });
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The server could not complete this action.',
        hint: 'Try again. If it keeps happening, quote this reference to support.',
        requestId: ref,
      },
    },
    { status: 500 },
  );
}

/**
 * Drizzle wraps driver errors (DrizzleQueryError) and puts the PostgreSQL error
 * on `cause`. Returns whichever object carries the SQLSTATE `code`.
 */
export function pgErrorOf(error: unknown): { code?: string; constraint?: string; message?: string } {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  if (e && typeof e === 'object') {
    if (typeof e.code === 'string') return e as { code?: string; constraint?: string };
    if (e.cause && typeof e.cause === 'object' && typeof e.cause.code === 'string') {
      return e.cause as { code?: string; constraint?: string };
    }
  }
  return {};
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
    data_export_requests_inflight_uq: 'An export is already being prepared.',
    data_deletion_requests_inflight_uq: 'You already have a deletion request in progress.',
    push_subscriptions_token_uq: 'This device is already registered.',
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
      return fail(error, request.headers.get('x-request-id'));
    }
  };
}

/**
 * Wrapper for unauthenticated endpoints (sign-in, registration, password
 * reset, public college list). Same error envelope as `withAuth`.
 */
export function publicRoute(
  handler: (request: Request, ctx: { params: Record<string, string> }) => Promise<Response>,
) {
  return async (
    request: Request,
    context: { params: Promise<Record<string, string | string[]>> },
  ): Promise<Response> => {
    try {
      const raw = context?.params ? await context.params : {};
      const params = Object.fromEntries(
        Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? (v[0] ?? '') : v]),
      ) as Record<string, string>;
      return await handler(request, { params });
    } catch (error) {
      return fail(error, request.headers.get('x-request-id'));
    }
  };
}

/** Throws a 404-style error when a tenant module is switched off. */
export function requireFeatureEnabled(user: AuthContext, flag: FeatureFlag): void {
  if (!isEnabled(user.featureFlags, flag)) {
    throw new AppError(
      `${FEATURE_FLAGS[flag].label} is not enabled for your institution.`,
      404,
      'FEATURE_DISABLED',
    );
  }
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

/** A route's `[id]` segment as a UUID, or a 404 naming what wasn't found. */
export function idParam(value: string | undefined, what = 'That item'): string {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(`${what} was not found.`, 404, 'NOT_FOUND');
  return value;
}
