# Integrations

Every external service sits behind a provider interface with a working
development fallback. That means:

- The app builds, tests and runs with **no credentials at all**.
- To go live you add keys and set one environment variable. No code changes.
- Missing keys for a provider you've selected stop production boot, with the exact variable named (`src/lib/env.ts`).
- Features whose provider is `none` say so in the UI rather than pretending to work.

| Integration | Selector | Development fallback | Production options | Credentials |
|---|---|---|---|---|
| AI assistant and copilot | `AI_PROVIDER` | `local`: offline, deterministic tool router over real data (no model) | `anthropic` | `ANTHROPIC_API_KEY` (+ `AI_MODEL`, `AI_MAX_TOKENS`, budgets) |
| File storage | `STORAGE_PROVIDER` | `local` (`./.storage`) | `s3` (AWS/R2/MinIO), `supabase`, `none` | `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` |
| Malware scanning | `MALWARE_SCANNER` | `none` | `signature` (built-in checks) | — |
| Email | `EMAIL_PROVIDER` | `console` (printed to the server log) | `resend`, `none` | `RESEND_API_KEY`, `EMAIL_FROM` |
| Push | `PUSH_PROVIDER` | `none` / `console` | `fcm` (HTTP v1) | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` |
| SMS | `SMS_PROVIDER` | `none` / `console` | `msg91` (DLT templates) | `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID` |
| WhatsApp | `WHATSAPP_PROVIDER` | `none` / `console` | — (planned; `whatsapp_enabled` stays off until a provider exists) | — |
| Opportunity feed | `OPPORTUNITY_FEED_PROVIDER` | `none`: listings are added by the college or shared by students | `json-feed` (any https JSON feed; items import as pending for approval) | `OPPORTUNITY_FEED_URL`, `OPPORTUNITY_FEED_TOKEN` |
| Error reporting | `ERROR_REPORTER` | `none` (structured logs only) | `webhook` (any JSON collector) | `ERROR_WEBHOOK_URL` |
| Database | `DATABASE_URL` | local PostgreSQL | Render Postgres, Supabase (session pooler), RDS | connection string, `DATABASE_SSL` |
| Deploy hook (GitHub Actions) | secrets | not used (skips) | Render deploy hook | `RENDER_DEPLOY_HOOK_URL`, `APP_URL` |

Where each provider lives in the code:

- **AI:** `src/services/ai/providers.ts`
- **Storage:** `src/services/storage/providers.ts`
- **Notifications:** `src/services/notifications/providers.ts`
- **Error reporting:** `src/lib/logger.ts#reportError`
- **Opportunity feeds:** `src/services/opportunities/providers.ts` (see `CAREER.md`)

**Not used, deliberately:**

- **Supabase Auth and the Data API.** Sign-in is CampusOS's own DB-backed session system, and the Data API is locked down automatically (`DEPLOYMENT.md`).
- **Weather.** No feature needs it yet.
- **Payments.** `billing_enabled` is marked as planned. No Razorpay code ships until billing is built.

## Adding a provider

1. Add an implementation of the existing interface next to the others.
2. Add its selector value and credentials to `src/lib/env.ts`. Add a production check that the credentials are present when it's selected.
3. Document it here and in `.env.example`.
4. Test it with the provider mocked at the `fetch` boundary. Never call the real service in CI.
