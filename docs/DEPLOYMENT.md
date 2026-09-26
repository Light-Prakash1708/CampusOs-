# Deployment

CampusOS is one Next.js app on Node plus PostgreSQL. It needs no Redis, queue
or worker process. Every external service is optional and is switched on by
environment variables; see `INTEGRATIONS.md`.

## What you need

- Node 20+ (22 recommended)
- PostgreSQL 15+: Render Postgres, Supabase, RDS, or self-hosted
- HTTPS termination (every platform below provides it)
- A scheduler that can POST to `/api/jobs/run` every 5–15 minutes

## Local development

```bash
cp .env.example .env            # DEMO_MODE=true, console email, local storage
npm ci
npm run db:setup                # migrate + fictional demo seed
npm run dev                     # http://localhost:3000
```

For a clean slate, run `npm run db:reset`. It works only on a local database.
More detail is in `LOCAL_DEVELOPMENT.md`.

## Environment variables

`.env.example` lists every variable. `src/lib/env.ts` validates them at boot.
In production, an invalid configuration exits with a list of what to fix, and
the deploy then fails its health check instead of serving errors.

Production refuses:

- `DEMO_MODE=true`
- a placeholder `AUTH_SECRET`
- a missing `CRON_SECRET`
- `EMAIL_PROVIDER=console`
- `STORAGE_PROVIDER=local` (unless `ALLOW_LOCAL_STORAGE=true` on a single persistent server)

Use `none` for any integration you haven't set up yet; the product then says
the feature isn't available rather than failing.

**Secrets.** Never commit `.env`. `AUTH_SECRET`, `CRON_SECRET`, API keys,
storage keys and database passwords belong only in the platform's secret
store (Render environment variables) or GitHub Actions secrets. CI runs
gitleaks on every push. `NEXT_PUBLIC_*` variables are compiled into the
browser bundle, so never put a secret in one.

## Database

**Migrations** live in `drizzle/migrations`: numbered, forward-only and
additive. `npm run db:migrate` applies pending migrations, one transaction
each, and records them in `drizzle.__drizzle_migrations`.

The migration runner also:

- baselines a v1 database that was created with `db:push`;
- re-applies the **Data API hardening** after every run (see Supabase below).

To change the schema:

1. Edit `src/lib/db/schema`.
2. Run `npx drizzle-kit generate --name <what>`.
3. Append any hand-written SQL (checks, triggers, backfills) below a `-- Hand-written` marker.
4. Commit.

CI fails if the schema and the migrations disagree.

**Upgrading a v1 database.** Back up first:

```bash
pg_dump --format=custom "$DATABASE_URL" > campusos-$(date +%F).dump
npm run db:migrate
```

Nothing is dropped.

**Database role (recommended).** Run the app as a least-privilege role and
migrations as the owner:

```sql
CREATE ROLE campusos_app LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE campusos TO campusos_app;
GRANT USAGE ON SCHEMA public TO campusos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusos_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO campusos_app;
REVOKE UPDATE, DELETE ON audit_logs, grievance_events, consent_records FROM campusos_app;
```

## Render + Supabase (recommended)

**1. Database (Supabase).**

- Create a project in the Mumbai (`ap-south-1`) region.
- Use the **session pooler** URL (port 5432) as `DATABASE_URL`. The transaction pooler (6543) doesn't support the migration runner.
- Set `DATABASE_SSL=require`.
- CampusOS doesn't use Supabase Auth or its Data API. All access goes through the server, which enforces sessions, RBAC and tenancy.

**2. Data API lockdown (automatic).** Supabase publishes the `public` schema
to the `anon` and `authenticated` roles through PostgREST, which anyone holding
the anon key can reach. When those roles exist, `db:migrate`:

- revokes their privileges;
- enables row-level security on every table, with a policy that admits every role except those two.

This runs after every migration, so new tables are covered too. The app keeps
working as the owner or as `campusos_app`. It's tested in
`tests/deployment.test.ts`. You can also turn the Data API off entirely in
Supabase (Settings → API).

**3. Storage (optional).**

- In Supabase, create a **private** bucket named `campusos`.
- Under Storage → S3 connection, create access keys.
- Set:
  - `STORAGE_PROVIDER=supabase`
  - `STORAGE_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`
  - `STORAGE_REGION=ap-south-1`
  - `STORAGE_BUCKET=campusos`
  - `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`

Files are only ever served through 5-minute signed URLs after an
authorisation check. The bucket is never public.

**4. App (Render).** Go to New → Blueprint and select the repository;
`render.yaml` creates:

- the web service: builds with `npm ci --include=dev && npm run build`, runs `npm run db:migrate` as the pre-deploy step, starts with `npm start`, and health-checks `/api/health`;
- the cron job, which calls `/api/jobs/run` every 10 minutes;
- optionally, a Render Postgres database. If you're using Supabase, remove the `databases` block and set `DATABASE_URL` by hand.

`APP_URL` is optional on Render, which falls back to `RENDER_EXTERNAL_URL`.
Set it on the web service and the cron job when you add a custom domain. The
exact settings, variables and troubleshooting steps are in
[`DEPLOYMENT.md`](../DEPLOYMENT.md) at the repository root.

**5. First administrator.** Never run `db:seed` in production. Provision the
college and its first super-admin instead:

```bash
npm run provision -- --slug kbi --name "Kolkata Business Institute" --short KBI \
  --city Kolkata --admin-email registrar@kbi.edu.in --admin-first Anita --admin-last Roy
```

It prints a one-time invitation link, valid for 7 days, and no password is
ever set or shown. Everyone else is invited from **Admin → Access & Privacy**.

## Health checks

`GET /api/health` responses:

| Status | Meaning |
|---|---|
| **200** `healthy` | The database is reachable and every migration this build expects is applied |
| **503** `migrations_pending` | The build is newer than the schema, so it doesn't take traffic until `db:migrate` runs |
| **503** `unhealthy` | The database is unreachable |

The response includes the `release` (the git commit on Render) and migration
counts. It never includes connection strings, secrets or personal data.

## CI and deployment

**`.github/workflows/ci.yml`** does validation only. It runs on pull requests,
pushes to `main`, and manual triggers. Steps:

- install, whitespace check, typecheck, lint;
- migrate a fresh Postgres 16 twice (idempotence) and check for schema drift;
- seed, test, build (with the Next.js build cache);
- `npm audit` (high and above) and a gitleaks secret scan.

**`.github/workflows/deploy.yml`** deploys only after CI succeeds on `main`
(or when triggered manually). It needs the repository secrets
`RENDER_DEPLOY_HOOK_URL` and `APP_URL`. It triggers the Render deploy, then
polls `/api/health` until that commit reports `healthy`. Without the secrets
it skips. Use either this workflow or Render's own
`autoDeployTrigger: checksPass`, not both.

**`.github/dependabot.yml`** proposes weekly npm updates and monthly GitHub
Actions updates.

## Scheduled jobs

```bash
curl -fsS -X POST https://campus.example.edu/api/jobs/run \
  -H "x-cron-secret: $CRON_SECRET" -H "content-type: application/json" -d '{}'
```

One call runs:

- **For every college:** grievance SLA escalation, scheduled notice publishing and notice expiry.
- **Platform-wide:** notification planning and delivery, and sweeping expired rate-limit buckets and tokens.

Every job is idempotent, so a missed run corrects itself on the next.

## Observability

- **Logs:** one JSON object per line in production (`LOG_LEVEL`). Secrets, tokens and cookies are redacted by key name.
- **Errors:** API errors, server render errors (`onRequestError`) and browser crashes (`/api/client-errors`, rate-limited) all go through `reportError`. Set `ERROR_REPORTER=webhook` and `ERROR_WEBHOOK_URL` to forward a small scrubbed event (error, route, request id, release) to any JSON collector. Request bodies and user data are never sent.

## Single server (Docker)

```bash
docker build -t campusos .
docker run -d -p 3000:3000 --env-file .env -v campusos-files:/app/.storage campusos
```

The container runs migrations on start. With a persistent volume you may use
`STORAGE_PROVIDER=local` with `ALLOW_LOCAL_STORAGE=true`.

## Rollback

- **Code:** redeploy the previous release in Render (Deploys → Rollback), or revert the commit and let CI and deploy run.
- **Schema:** migrations are additive, so the previous release runs against the newer schema. There are no down-migrations. To undo one, write a new forward migration.
- **Data:** restore from backup (below). Test restores periodically.

## Backups

Supabase and Render Postgres take daily backups on paid plans; enable
point-in-time recovery for production. Also keep your own nightly
`pg_dump`, and enable bucket versioning for S3 or Supabase Storage.
