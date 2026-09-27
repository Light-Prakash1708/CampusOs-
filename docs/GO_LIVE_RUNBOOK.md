# Go-live runbook: first pilot college

This is the order of work to get V1 from the repository to a live pilot. Each step says who does it:

- **Claude** means repository work, done in this repo.
- **Owner** means it needs your accounts, money, DNS or judgement.

Tick the boxes as you go and keep this file as the record.

> **Rules:**
> - Never force-push. Never delete or rewrite commits to fix a deploy.
> - Never restore over production.
> - Never set `DEMO_TENANT_ENABLED=true` on the pilot college's server.

## 0. What "done" means

- A real college's staff and students use `https://<your-domain>`.
- Backups are proven by a restore.
- Failures page you before the college notices.
- Reminder emails arrive in inboxes, not spam.
- The read-only smoke check (`node scripts/smoke/production.mjs <url> <sha>`) passes after every deploy.

---

## 1. Get the V1 commits onto GitHub (Owner, 5 minutes)

This cloud session can't push: its git proxy has no credential for `Light-Prakash1708/CampusOs-`. The commits are delivered as a verified git bundle, `campusos-v1-pilot.bundle`, in your connected `campusos 2` folder. Applying it is a **fast-forward**: nothing on GitHub is rewritten.

Run this on your Mac, in the clone you normally push from (probably `~/campusos-github`):

```bash
cd ~/campusos-github
git status                      # must be clean and on main
git fetch origin
git log -1 --format=%h origin/main          # expect 5ef88c3
git bundle verify ~/Downloads/"campusos 2"/campusos-v1-pilot.bundle
git pull --ff-only ~/Downloads/"campusos 2"/campusos-v1-pilot.bundle main
git log -1 --format='%h %s'                 # expect the commit named in the chat message
git push origin main                        # a normal push, never --force
```

If `pull --ff-only` refuses, stop. It means GitHub moved since the bundle was made. Tell Claude, and a new bundle will be made on top of the new state.

**The other route:** add `Light-Prakash1708/CampusOs-` to this Claude session's authorised repositories, and Claude pushes directly.

- [ ] Pushed. `origin/main` = ______

## 2. Verify branch and remote (Claude, after step 1)

- `git fetch && git status` shows `main` level with `origin/main`.
- CI is green on that commit: typecheck, lint, migrations twice plus the drift check, the tests, build, E2E, `npm audit`, gitleaks.
- Dependabot has three open branches (Next 16, TypeScript 7, `@types/bcryptjs` 3). **Don't merge them before the pilot.** Those are major upgrades, and upgrading during a pilot is risk without evidence.

## 3. Secrets check (Claude, done 27 Sep)

- gitleaks over all commits being pushed: clean.
- `.env` is not tracked, and only `.env.example` is committed.
- CI re-runs gitleaks on every push.

## 4–5. Render: web service, cron, database (Owner, about 30 minutes, paid)

1. In Render, click **New → Blueprint** and select the GitHub repository, branch `main`. Render reads `render.yaml` and proposes:
   - `campusos` (web, **starter**);
   - `campusos-jobs` (cron, every 10 minutes);
   - `campusos-db` (Postgres 16).
2. Before applying, **choose the database plan** (decision needed, see step 6). The Blueprint says `basic-256mb`. Keep it, or pick a larger plan if you prefer.
3. Render asks for the `sync: false` values. Fill these now:

| Variable | Value |
|---|---|
| `APP_URL` | Leave blank until the custom domain works (Render then uses the `onrender.com` URL). Then set it to `https://<your-domain>`. |
| `PLATFORM_OPERATOR_EMAILS` | The email you'll use as the platform operator |
| `EMAIL_FROM` | `CampusOS <notices@<your-domain>>` (after step 12) |
| `RESEND_API_KEY` | From Resend (step 13) |
| `ERROR_WEBHOOK_URL` | From step 10 |
| `BILLING_SELLER_NAME` / `_ADDRESS` / `_EMAIL` / `_STATE` | Your legal name and address as they should print on invoices |

   Leave every other `sync: false` blank: Anthropic, storage, FCM, MSG91, opportunity feed.

   Render **generates** these, so never type them: `AUTH_SECRET`, `CRON_SECRET`, `MFA_ENCRYPTION_KEY`, `ANALYTICS_HASH_KEY`. **Never rotate `MFA_ENCRYPTION_KEY`**: every two-step sign-in would stop working.
4. Apply. The first deploy runs `npm run db:migrate` before any traffic. `/api/health` must return `healthy` with `pending: 0`.
5. **Create the operator account.** Open Render → `campusos` → **Shell** and run:

   ```bash
   npm run provision -- --slug campusos-ops --name "CampusOS Operations" --short OPS \
     --city Kolkata --admin-email <the PLATFORM_OPERATOR_EMAILS address> \
     --admin-first <first> --admin-last <last>
   ```

   - It prints a one-time invitation link, valid for 7 days. Open it, choose a password, then enrol in two-step sign-in (required for super admins).
   - No password is ever set by the script or pasted anywhere.
   - The pilot college is provisioned the same way later, with its own slug and the registrar's email.

- [ ] Web service live at ______
- [ ] Health shows 20/20 migrations

## 6. Production Postgres with point-in-time recovery (Owner)

- In the Render dashboard, open `campusos-db` → Recovery/Backups. Confirm:
  - (a) daily backups are on;
  - (b) point-in-time recovery is available;
  - (c) the retention window.
- **Write the retention down.** PITR and retention depend on the plan and workspace tier, so check the dashboard rather than assuming.
- Supabase instead? Enable PITR on the project (a paid add-on) and use the **session pooler** URL (port 5432). See DEPLOYMENT.md.

- [ ] PITR on. Retention: ______

## 7. Nightly off-site backup (Owner + Claude)

This is a copy outside Render, so that losing an account doesn't lose the college's data.

- **Owner:**
  - Create a private bucket with a different provider or account (for example Backblaze B2, Cloudflare R2 or AWS S3) with versioning or object lock on.
  - Create an access key limited to writing into that bucket.
  - Give Claude:
    - the bucket name;
    - the endpoint;
    - whether GitHub Actions may hold the key (as repository secrets `BACKUP_DATABASE_URL`, `BACKUP_S3_*`).
- **Claude:** adds a scheduled workflow (`pg_dump -Fc` → encrypt → upload, keeping 30 days) once the destination exists. It isn't written yet, because the destination decides its shape.

- [ ] Destination chosen: ______

## 8. First production restore drill (Owner + Claude, about 30 minutes)

Follow "Backups and restore drill" in DEPLOYMENT.md:

1. Restore the latest backup, or a PITR point from about 1 hour ago, into a **new** database.
2. Run `DATABASE_URL=<new> npm run db:verify`. It is read-only and prints counts only.
3. Record the results:

   | Date | Restore point | Minutes taken | `db:verify` result |
   |---|---|---|---|
   | | | | |

4. Delete the copy.

- [ ] Drill recorded

## 9. Uptime monitoring (Owner, 10 minutes)

- In any uptime service (UptimeRobot, Better Stack and others have free tiers), add an HTTP check:
  - **URL:** `https://<your-domain>/api/health`
  - **Every:** 1–5 minutes
  - **Alert when:** the status is not 200, or it times out after 10 s.
- Alert to your phone (SMS or app) **and** email.
- Also watch the cron: Render emails on cron job failures. Make sure your notification settings allow it.

- [ ] Monitor live, alerts tested (pause the service for 1 minute, or check a bad URL)

## 10. Error reporting (Owner, 10 minutes)

The app POSTs a small scrubbed JSON event (error, route, request ID, release; no bodies, no user data) to any webhook.

- **Easiest:** a Slack or Discord incoming webhook, or any JSON collector.
- Set `ERROR_REPORTER=webhook` and `ERROR_WEBHOOK_URL=<url>` on the web service.
- **Test it:** Claude can tell you the safe way to trigger a test error once it's configured.

- [ ] Errors arrive in: ______

## 11. Custom domain (Owner)

1. Render → `campusos` → Settings → Custom Domains → add `campus.<your-domain>` (or the college-facing name you prefer).
2. At your DNS provider, add the CNAME (or A/ALIAS) record that Render shows. Wait for the certificate.
3. Set `APP_URL=https://campus.<your-domain>` and redeploy. Invitation and reminder links use `APP_URL`.
4. Add `APP_URL` and `RENDER_DEPLOY_HOOK_URL` as GitHub repository secrets. The deploy workflow then waits for the exact commit to be healthy and runs the smoke check. Otherwise leave Render's `autoDeployTrigger: checksPass` doing deploys, but **not both**.

- [ ] `https://______` serves CampusOS with a valid certificate

## 12–13. Email: SPF, DKIM and the provider (Owner)

1. Create a Resend account and add the sending domain. Using a subdomain such as `mail.<your-domain>` keeps your main domain's reputation separate.
2. Resend shows the DNS records: SPF (TXT/MX on the sending subdomain) and DKIM (TXT or CNAME). Copy them **exactly** into your DNS. Add a DMARC record at `_dmarc.<your-domain>`; `v=DMARC1; p=none; rua=mailto:<you>` is enough to start.
3. Wait until Resend shows the domain **Verified**.
4. On Render, set:
   - `EMAIL_PROVIDER=resend`
   - `RESEND_API_KEY=<key>` (a sending-only key)
   - `EMAIL_FROM=CampusOS <notices@mail.<your-domain>>`
5. Redeploy.

- [ ] Domain verified in Resend
- [ ] Env set

## 14. Required production environment (check)

| Variable | Pilot value | Source |
|---|---|---|
| `NODE_ENV` | `production` | blueprint |
| `DEMO_MODE` | `false` | blueprint (startup refuses `true`) |
| `DEMO_TENANT_ENABLED` | `false` | blueprint |
| `MFA_ENFORCE` / `CSP_ENFORCE` | `true` / `true` | blueprint |
| `AUTH_SECRET`, `CRON_SECRET`, `MFA_ENCRYPTION_KEY`, `ANALYTICS_HASH_KEY` | generated | blueprint |
| `SELF_REGISTRATION_ENABLED` | `true` (students may sign up and ask to join) | blueprint |
| `AI_PROVIDER` | `local`; no data leaves the server. External AI stays off per college regardless | blueprint |
| `STORAGE_PROVIDER` | `none`. The join flow then works without an ID upload; colleges that insist on ID use invitations | blueprint |
| `EMAIL_PROVIDER` | `resend` | step 13 |
| `ERROR_REPORTER` | `webhook` | step 10 |
| `PUSH_PROVIDER` | `none` until Firebase web config exists | — |
| `APP_URL`, `PLATFORM_OPERATOR_EMAILS`, `BILLING_SELLER_*` | yours | steps 5, 11 |

The app validates its environment at boot and refuses to start with contradictions, such as `EMAIL_PROVIDER=resend` without a key.

## 15. The demo (Owner decides; Claude sets up)

The demo **must not** share a server or database with a pilot college. Choose one:

- **No public demo:** demo from a local laptop build (`DEMO_TENANT_ENABLED=true npm run demo:reset` locally). This costs nothing.
- **Public demo:** a second small Render service and database with `DEMO_TENANT_ENABLED=true`, plus the nightly reset cron (template in `render.yaml`). This is a monthly cost.

Then run `node scripts/smoke/production.mjs https://demo.<domain> --expect-demo`.

- [ ] Choice: ______

## 16–19. Test the real deployment

1. `node scripts/smoke/production.mjs https://<your-domain> <commit-sha>`. It is anonymous and read-only; every line must be PASS.
2. The signed-in checks in [PRODUCTION_SMOKE_TEST.md](PRODUCTION_SMOKE_TEST.md), on desktop **and** on an Android phone (Chrome), using a **test college** (see there). Never use the pilot college's real data.
3. Real email: an invitation and a reminder arrive at a Gmail **and** an Outlook address, not in spam. Check the headers for `dkim=pass` and `spf=pass`.

- [ ] Smoke passed on commit ______
- [ ] Signed-in checklist passed (desktop / Android)
- [ ] Email lands in the inbox with DKIM and SPF passing

When every box above is ticked, the platform is ready for the first college. Then follow [PILOT_GUIDE.md](PILOT_GUIDE.md) → Setup.
