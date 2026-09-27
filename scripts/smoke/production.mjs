// READ-ONLY production smoke check (pilot guardian mode).
//
//   node scripts/smoke/production.mjs https://campus.example.edu [expected-commit-sha] [--expect-demo]
//
// Anonymous requests only. It never signs in, never submits a form and never
// writes to the database, so it is safe to run against a live pilot tenant
// after every deploy. Exits 1 on any failure. Needs Node 18+ (global fetch).
//
// Signed-in checks (MFA, notices, grievances, evidence pack) are manual and
// listed in docs/PRODUCTION_SMOKE_TEST.md: they must not create records in a
// real college's data from a script.
/* global fetch */

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? '').replace(/\/$/, '');
const expectedSha = args.find((a) => /^[0-9a-f]{7,40}$/i.test(a)) ?? null;
const expectDemo = args.includes('--expect-demo');
if (!base) {
  console.error('Usage: node scripts/smoke/production.mjs <base-url> [commit-sha] [--expect-demo]');
  process.exit(2);
}
const https = base.startsWith('https://');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
}
async function get(path, init = {}) {
  return fetch(base + path, { redirect: 'manual', ...init, headers: { 'user-agent': 'campusos-prod-smoke', ...(init.headers ?? {}) } });
}

// 1. Health: database reachable, every migration applied, the release we deployed.
try {
  const r = await get('/api/health');
  const body = await r.json().catch(() => null);
  const d = body?.data ?? {};
  check('health: 200 healthy', r.status === 200 && d.status === 'healthy', `${r.status} ${d.status ?? ''}`);
  check('health: no pending migrations', d.migrations?.pending === 0, JSON.stringify(d.migrations ?? {}));
  if (expectedSha) {
    const rel = String(d.release ?? '');
    check('health: release is the expected commit', rel.length > 0 && (rel.startsWith(expectedSha) || expectedSha.startsWith(rel)), `release=${rel || 'unset'}`);
  }
  check('health: no secrets in body', !/postgres(ql)?:\/\/|AUTH_SECRET|password/i.test(JSON.stringify(body)), '');
} catch (e) {
  check('health reachable', false, String(e));
}

// 2. Public pages and security headers.
for (const path of ['/', '/login', '/privacy', '/offline']) {
  try {
    const r = await get(path);
    check(`${path}: 200`, r.status === 200, String(r.status));
    if (path === '/login') {
      const csp = r.headers.get('content-security-policy') ?? '';
      const scriptSrc = csp.split(';').find((p) => p.trim().startsWith('script-src')) ?? '';
      check('CSP enforced with nonce', /'nonce-[^']+'/.test(scriptSrc), scriptSrc.slice(0, 80));
      check("CSP has no 'unsafe-inline'/'unsafe-eval' for scripts", !/unsafe-(inline|eval)/.test(scriptSrc), '');
      check('X-Content-Type-Options: nosniff', r.headers.get('x-content-type-options') === 'nosniff', '');
      check('clickjacking protection', r.headers.get('x-frame-options') === 'DENY' || /frame-ancestors 'none'/.test(csp), '');
      check('Referrer-Policy set', !!r.headers.get('referrer-policy'), '');
      if (https) check('HSTS set', /max-age=\d{7,}/.test(r.headers.get('strict-transport-security') ?? ''), '');
    }
  } catch (e) {
    check(`${path} reachable`, false, String(e));
  }
}

// 3. Anonymous visitors are kept out of portals and APIs.
for (const path of ['/student', '/faculty', '/admin', '/admin/reports', '/account/privacy']) {
  const r = await get(path);
  const loc = r.headers.get('location') ?? '';
  check(`anon ${path} → sign-in`, [302, 303, 307, 308].includes(r.status) && /\/login/.test(loc), `${r.status} ${loc}`);
}
for (const path of ['/api/reports/evidence', '/api/admin/grievance-committee', '/api/account/mfa', '/api/student/announcements']) {
  const r = await get(path);
  check(`anon GET ${path} refused`, r.status === 401 || r.status === 403, String(r.status));
}

// 4. Demo sign-in: must be off on a pilot host, on only on the demo host.
//    On a pilot host the disabled endpoint answers 404 before touching anything.
//    On a demo host this starts a session in the demo college only.
{
  const r = await get('/api/auth/demo', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ role: 'student' }) });
  if (expectDemo) check('demo sign-in works (demo host)', r.status === 200, String(r.status));
  else check('demo endpoint disabled (pilot host)', r.status === 404, `${r.status} — set DEMO_TENANT_ENABLED=false on pilot hosts`);
}

// 5. Installable app.
{
  const m = await get('/manifest.webmanifest');
  check('manifest served', m.status === 200, String(m.status));
  const sw = await get('/sw.js');
  const text = sw.status === 200 ? await sw.text() : '';
  check('service worker served', sw.status === 200, String(sw.status));
  // The worker caches by allowlist (build assets, icons, fonts, /offline); nothing else.
  check('service worker caches static assets only', /_next\/static/.test(text) && !/startsWith\(['"]\/api/.test(text) && !/cache\.put\([^)]*navigate/.test(text), '');
}

// Report
let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed against ${base}`);
process.exit(failed ? 1 : 0);
