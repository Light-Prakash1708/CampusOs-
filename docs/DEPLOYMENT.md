# Deployment

## What you need

- Node 20+ runtime (any host that runs Next.js: a VM, a container, Vercel)
- PostgreSQL 16 (managed or self-hosted; Supabase works — it is Postgres)
- HTTPS termination
- A cron scheduler

Deliberately *not* required: Redis, a message broker, a Python runtime, or a
separate worker process. One app, one database.

## Environment

```bash
NODE_ENV=production
APP_URL="https://campus.college.edu"

DATABASE_URL="postgresql://user:pass@host:5432/campusos"
AUTH_SECRET="<openssl rand -base64 48>"
SESSION_MAX_AGE="28800"

DEMO_MODE="false"          # MUST be false
NEXT_PUBLIC_DEMO_PASSWORD=""

AI_PROVIDER="local"        # or "anthropic"
ANTHROPIC_API_KEY=""
AI_MONTHLY_BUDGET_USD="50"

CRON_SECRET="<openssl rand -base64 32>"
```

### Pre-flight checks

- `AUTH_SECRET` is at least 32 characters and **not** the example value. The app
  refuses to start otherwise.
- `DEMO_MODE=false`. Demo accounts and the role switcher are unreachable in a
  production build regardless, but set it explicitly.
- `DATABASE_URL` does not point at a database containing the demo tenant.

## Deploying

```bash
npm ci
npm run db:generate                              # emit migration SQL
psql "$DATABASE_URL" -f drizzle/<migration>.sql
psql "$DATABASE_URL" -f drizzle/0001_hard_constraints.sql
npm run build
npm start
```

`0001_hard_constraints.sql` is idempotent and **must** be applied. Without it
the schema exists but no-double-booking, append-only history and full-text
search do not.

Do not run `db:seed` against production.

## Database role

Run the application as a dedicated role rather than a superuser:

```sql
CREATE ROLE campusos_app LOGIN PASSWORD '…';
GRANT CONNECT ON DATABASE campusos TO campusos_app;
GRANT USAGE ON SCHEMA public TO campusos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO campusos_app;

-- Reinforce append-only history at the privilege level as well as the trigger.
REVOKE UPDATE, DELETE ON audit_logs FROM campusos_app;
REVOKE UPDATE, DELETE ON grievance_events FROM campusos_app;
```

Belt and braces: the triggers stop the application, the grants stop anything
holding its credentials.

## Scheduled jobs

```cron
*/15 * * * * curl -fsS -X POST https://campus.college.edu/api/jobs/run \
  -H "x-cron-secret: $CRON_SECRET" >> /var/log/campusos-jobs.log 2>&1
```

Runs SLA escalation, scheduled publishing and expiry. Idempotent and
clock-driven, so a missed run self-corrects.

## First institution

1. Insert the institution row (slug, name, timezone, feature flags).
2. Create one `SUPER_ADMIN` with a bcrypt hash.
3. Sign in and use **Data Import** for departments, programmes, sections,
   rooms, subjects, faculty and students.
4. Configure the academic year, term and period grid.
5. Generate and publish a timetable.

### Overlay mode

A college cannot replace its ERP overnight, and pretending otherwise is how
these deployments fail. CampusOS is designed to sit alongside the incumbent:
import from it on a schedule, run communication and readdressal in CampusOS
first (the workflows with the clearest immediate benefit), then move timetabling
and attendance once people trust it.

## Operations

**Health:** `GET /api/health` returns database connectivity and latency; 503
when unreachable. Point your uptime monitor here, not at `/`.

**Logs:** structured to stdout. Server errors carry a `requestId` that is also
returned to the user, so a support ticket maps to a log line.

**Backups:** ordinary `pg_dump`. Everything is in Postgres; there is no other
stateful component. Verify restores — an unverified backup is a hope.

**Scaling:** the app is stateless (sessions live in the database), so scale
horizontally behind a load balancer. `DB_POOL_MAX` defaults to 10 per instance;
size it against your Postgres `max_connections`.

## Cost

For a 2,000-student college: one small VM (2 vCPU / 4 GB) and a small managed
Postgres. AI is optional, capped, and zero with the offline provider.
