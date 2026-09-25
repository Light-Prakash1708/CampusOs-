# Deployment

## What you need

- Node 20+ (22 recommended)
- PostgreSQL 15+ — Render Postgres, Supabase, RDS, or self-hosted
- HTTPS termination (every platform below provides it)
- A scheduler that can POST to `/api/jobs/run` every 5–15 minutes

Not required: Redis, a queue, a worker process, a Python runtime.

Optional integrations, each switched on by environment variable only:
Anthropic (AI), Resend (email), FCM (push), MSG91 (SMS), S3-compatible or
Supabase Storage (files).

## Configuration

See `.env.example` for every variable. `src/lib/env.ts` validates them at boot;
in production an invalid configuration exits with the list of problems. It
refuses: `DEMO_MODE=true`, placeholder `AUTH_SECRET`, missing `CRON_SECRET`,
`EMAIL_PROVIDER=console`, and `STORAGE_PROVIDER=local` (unless
`ALLOW_LOCAL_STORAGE=true` on a single persistent server). Use `none` for any
integration you have not set up yet — the product says so honestly instead of
failing.

## Render + Supabase (recommended)

1. **Database (Supabase).** Create a project in the Mumbai (`ap-south-1`)
   region. Copy the **session pooler** connection string (port 5432). The
   transaction pooler (6543) does not support the migration runner's
   transaction and prepared statements.
2. **Storage (optional, Supabase).** Storage → create a private bucket
   `campusos`. Settings → Storage → S3 connection → create access keys. Set
   `STORAGE_PROVIDER=supabase`, `STORAGE_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`,
   `STORAGE_REGION=ap-south-1`, `STORAGE_BUCKET=campusos`, `STORAGE_ACCESS_KEY`,
   `STORAGE_SECRET_KEY`.
3. **App (Render).** New → Blueprint → select the repository; `render.yaml`
   creates the web service and the cron job. If you use Supabase, remove the
   `databases` block and set `DATABASE_URL` manually. Set `APP_URL` on both the
   web service and the cron job to the service URL.
4. Render runs `npm run db:migrate` before each deploy (`preDeployCommand`), then
   `npm start` (binds `$PORT`). Health check: `/api/health`.
5. **First administrator.** The seed is for development only — never run
   `db:seed` in production. Create the institution and a `SUPER_ADMIN` with a
   one-off SQL insert or a provisioning script, then invite everyone else from
   **Admin → Access & Privacy**.

## Single server (Docker)

```bash
docker build -t campusos .
docker run -d -p 3000:3000 --env-file .env -v campusos-files:/app/.storage campusos
```

The container runs migrations on start. With a persistent volume you may use
`STORAGE_PROVIDER=local` and `ALLOW_LOCAL_STORAGE=true`.

## Without Docker

```bash
npm ci
npm run db:migrate
npm run build
npm start
```

## Upgrading a v1 database

Run `npm run db:migrate` against it. The runner detects a v1 schema created by
`db:push`, records the baseline, and applies the 2.0 migrations. Nothing is
dropped. Back up first anyway:

```bash
pg_dump --format=custom "$DATABASE_URL" > campusos-$(date +%F).dump
```

## Database role

Run the application as a dedicated role rather than a superuser:

```sql
CREATE ROLE campusos_app LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE campusos TO campusos_app;
GRANT USAGE ON SCHEMA public TO campusos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusos_app;
REVOKE UPDATE, DELETE ON audit_logs, grievance_events, consent_records FROM campusos_app;
```

Migrations need a role that can alter the schema; run them with the owner role.

## Scheduled jobs

```cron
*/10 * * * * curl -fsS -X POST https://campus.example.edu/api/jobs/run \
  -H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json" -d '{}'
```

With the secret, one call runs, for every tenant: grievance SLA escalation,
scheduled notice publishing, notice expiry; and platform-wide: notification
delivery planning, delivery, and sweeping expired rate-limit buckets and tokens.
Every job is idempotent — a missed run self-corrects on the next.

## Backups

Supabase and Render Postgres take daily backups on paid plans; enable
point-in-time recovery for production. Additionally keep your own nightly
`pg_dump`. Files in S3/Supabase Storage should have bucket versioning enabled.

## CI

`.github/workflows/ci.yml` runs on every push and PR: install, typecheck, lint,
migrate a fresh Postgres 16, seed, test, build; plus `npm audit` (high+) and a
gitleaks secret scan. Configure Render's auto-deploy to wait for checks
("Deploy only after CI checks pass") so a failing build never ships.
