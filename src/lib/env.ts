import { z } from 'zod';

/**
 * ENVIRONMENT VALIDATION
 * ---------------------------------------------------------------------------
 * One place that knows what configuration CampusOS needs. `validateEnv()` runs
 * at server boot (src/instrumentation.ts): in production a misconfiguration
 * stops the process with a readable list instead of failing on the first
 * request that happens to touch the missing value.
 *
 * Provider credentials are only required when that provider is selected —
 * CampusOS runs with zero third-party accounts (local storage, console email,
 * offline AI) and each integration is opt-in.
 *
 * Nothing here is ever exposed to the browser: only NEXT_PUBLIC_* variables
 * reach client bundles, and none of the secrets below use that prefix.
 */

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: z.enum(['disable', 'require', 'verify']).optional(),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    APP_URL: z.string().url('APP_URL must be an absolute URL, e.g. https://campus.example.edu'),
    SESSION_MAX_AGE: z.coerce.number().int().positive().default(28800),
    TRUST_PROXY: bool,
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(1).max(5).default(1),
    DEMO_MODE: bool,
    CRON_SECRET: z.string().min(16).optional(),

    AI_PROVIDER: z.enum(['local', 'anthropic']).default('local'),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_MODEL: z.string().optional(),
    AI_MONTHLY_BUDGET_USD: z.coerce.number().nonnegative().default(50),
    AI_USER_HOURLY_LIMIT: z.coerce.number().int().positive().default(30),

    STORAGE_PROVIDER: z.enum(['local', 's3', 'supabase', 'none']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('./.storage'),
    STORAGE_BUCKET: z.string().optional(),
    STORAGE_ENDPOINT: z.string().url().optional(),
    STORAGE_REGION: z.string().default('auto'),
    STORAGE_ACCESS_KEY: z.string().optional(),
    STORAGE_SECRET_KEY: z.string().optional(),
    STORAGE_MAX_FILE_MB: z.coerce.number().positive().max(100).default(20),
    MALWARE_SCANNER: z.enum(['none', 'signature']).default('none'),

    EMAIL_PROVIDER: z.enum(['console', 'resend', 'none']).default('console'),
    EMAIL_FROM: z.string().default('CampusOS <no-reply@campusos.local>'),
    RESEND_API_KEY: z.string().optional(),

    PUSH_PROVIDER: z.enum(['none', 'console', 'fcm']).default('none'),
    FCM_PROJECT_ID: z.string().optional(),
    FCM_CLIENT_EMAIL: z.string().optional(),
    FCM_PRIVATE_KEY: z.string().optional(),

    SMS_PROVIDER: z.enum(['none', 'console', 'msg91']).default('none'),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_TEMPLATE_ID: z.string().optional(),

    WHATSAPP_PROVIDER: z.enum(['none', 'console']).default('none'),

    SENTRY_DSN: z.string().optional(),
    /** Where unhandled errors are sent besides the log: none | webhook. */
    ERROR_REPORTER: z.enum(['none', 'webhook']).default('none'),
    ERROR_WEBHOOK_URL: z.string().url().optional(),
    // Career Mode: an optional feed of opportunities the college subscribes to.
    OPPORTUNITY_FEED_PROVIDER: z.enum(['none', 'json-feed']).default('none'),
    OPPORTUNITY_FEED_URL: z.string().url().optional(),
    OPPORTUNITY_FEED_TOKEN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, key: string, why: string) => {
      if (cond) ctx.addIssue({ code: 'custom', path: [key], message: why });
    };
    need(
      env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY,
      'ANTHROPIC_API_KEY',
      'required when AI_PROVIDER=anthropic',
    );
    const s3 = env.STORAGE_PROVIDER === 's3' || env.STORAGE_PROVIDER === 'supabase';
    need(s3 && !env.STORAGE_BUCKET, 'STORAGE_BUCKET', 'required for S3-compatible storage');
    need(s3 && !env.STORAGE_ENDPOINT, 'STORAGE_ENDPOINT', 'required for S3-compatible storage');
    need(s3 && !env.STORAGE_ACCESS_KEY, 'STORAGE_ACCESS_KEY', 'required for S3-compatible storage');
    need(s3 && !env.STORAGE_SECRET_KEY, 'STORAGE_SECRET_KEY', 'required for S3-compatible storage');
    need(env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY, 'RESEND_API_KEY', 'required when EMAIL_PROVIDER=resend');
    const fcm = env.PUSH_PROVIDER === 'fcm';
    need(fcm && !env.FCM_PROJECT_ID, 'FCM_PROJECT_ID', 'required when PUSH_PROVIDER=fcm');
    need(fcm && !env.FCM_CLIENT_EMAIL, 'FCM_CLIENT_EMAIL', 'required when PUSH_PROVIDER=fcm');
    need(fcm && !env.FCM_PRIVATE_KEY, 'FCM_PRIVATE_KEY', 'required when PUSH_PROVIDER=fcm');
    need(env.SMS_PROVIDER === 'msg91' && !env.MSG91_AUTH_KEY, 'MSG91_AUTH_KEY', 'required when SMS_PROVIDER=msg91');
    need(env.ERROR_REPORTER === 'webhook' && !env.ERROR_WEBHOOK_URL, 'ERROR_WEBHOOK_URL', 'required when ERROR_REPORTER=webhook');
    need(env.OPPORTUNITY_FEED_PROVIDER === 'json-feed' && !env.OPPORTUNITY_FEED_URL, 'OPPORTUNITY_FEED_URL', 'required when OPPORTUNITY_FEED_PROVIDER=json-feed');
    need(env.OPPORTUNITY_FEED_PROVIDER === 'json-feed' && !!env.OPPORTUNITY_FEED_URL && !env.OPPORTUNITY_FEED_URL.startsWith('https://') && env.NODE_ENV === 'production', 'OPPORTUNITY_FEED_URL', 'must be https in production');

    if (env.NODE_ENV === 'production') {
      need(env.DEMO_MODE, 'DEMO_MODE', 'must be false in production');
      need(/dev-only|change-me|local-dev|replace-with/i.test(env.AUTH_SECRET), 'AUTH_SECRET', 'looks like a development placeholder');
      need(!env.CRON_SECRET, 'CRON_SECRET', 'required in production so scheduled jobs can run');
      need(env.EMAIL_PROVIDER === 'console', 'EMAIL_PROVIDER', '"console" does not deliver email; use resend (or none to disable email features)');
      need(env.STORAGE_PROVIDER === 'local' && process.env.ALLOW_LOCAL_STORAGE !== 'true', 'STORAGE_PROVIDER',
        '"local" writes to the server disk, which is ephemeral on most hosts; use s3/supabase or set ALLOW_LOCAL_STORAGE=true on a single persistent server');
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export interface EnvValidation {
  ok: boolean;
  env?: Env;
  issues: string[];
}

export function validateEnv(source: Record<string, string | undefined> = process.env): EnvValidation {
  // Treat empty strings as unset so `KEY=` in .env behaves like absence.
  const cleaned: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  // On Render the public URL is known without configuration.
  if (!cleaned.APP_URL && cleaned.RENDER_EXTERNAL_URL) cleaned.APP_URL = cleaned.RENDER_EXTERNAL_URL;
  const parsed = EnvSchema.safeParse(cleaned);
  if (parsed.success) return { ok: true, env: parsed.data, issues: [] };
  return {
    ok: false,
    issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

let cached: Env | null = null;

/**
 * Validated configuration. Throws with every problem listed when invalid.
 * Cached for the life of the process; tests may call `resetEnvCache()`.
 */
export function env(): Env {
  if (cached) return cached;
  const result = validateEnv();
  if (!result.ok || !result.env) {
    throw new Error(`Invalid CampusOS configuration:\n  - ${result.issues.join('\n  - ')}`);
  }
  cached = result.env;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

/**
 * The public origin: APP_URL, or on Render the platform-provided
 * RENDER_EXTERNAL_URL (https://<service>.onrender.com) when APP_URL is unset.
 * Set APP_URL explicitly once a custom domain is attached.
 */
export function publicBaseUrl(source: Record<string, string | undefined> = process.env): string | undefined {
  return source.APP_URL || source.RENDER_EXTERNAL_URL || undefined;
}

/** Absolute URL for links in emails. Never derived from request headers (host-header injection). */
export function appUrl(path = '/'): string {
  const base = (publicBaseUrl() ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
