/* global URL */
// Authorization probe: every cross-role page/API request must be refused or redirected.
// Usage: node scripts/smoke/authz.mjs (against a running server with demo data).
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
async function as(email) {
  const ctx = await b.newContext();
  if (email) {
    const r = await ctx.request.post(BASE + '/api/auth/login', { data: { email, password: 'CampusOS@2026' }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error('login ' + email + ' ' + r.status());
  }
  return ctx;
}
const problems = [];
async function page(ctx, who, path, mustNotLand) {
  const r = await ctx.request.get(BASE + path, { maxRedirects: 5 });
  const landed = new URL(r.url()).pathname;
  if (r.status() === 200 && landed.startsWith(mustNotLand)) problems.push(`${who} reached ${path} (landed ${landed})`);
}
async function api(ctx, who, method, path, body) {
  const r = await ctx.request.fetch(BASE + path, { method, data: body, headers: { origin: BASE }, maxRedirects: 0 });
  if (r.status() < 400) problems.push(`${who} ${method} ${path} → ${r.status()}`);
}
const anon = await as(null);
for (const p of ['/student', '/student/attendance', '/tools', '/faculty', '/admin', '/admin/settings', '/organize', '/account/privacy'])
  await page(anon, 'anonymous', p, p);
for (const [m, p] of [['GET', '/api/attendance'], ['GET', '/api/tools'], ['GET', '/api/events'], ['GET', '/api/privacy/export'], ['GET', '/api/admin/settings/attendance'], ['GET', '/api/search?q=ab']])
  await api(anon, 'anonymous', m, p);
const student = await as('student@demo.campusos.local');
for (const p of ['/admin', '/admin/settings', '/admin/students', '/admin/audit', '/faculty', '/faculty/attendance'])
  await page(student, 'student', p, p.split('/').slice(0, 2).join('/'));
for (const [m, p, body] of [
  ['PUT', '/api/admin/settings/attendance', { defaultMinimumPct: 10, warningMarginPct: 1, aggregateMinimumPct: null }],
  ['PATCH', '/api/admin/settings/features', { flags: { events_enabled: false } }],
  ['POST', '/api/faculty/attendance', { offeringId: '492f7b1b-9fc1-4aa6-836f-b5419e27b98c', date: '2026-09-20', records: [] }],
  ['GET', '/api/admin/registrations'],
  ['POST', '/api/admin/users/invite', { email: 'x@y.z', firstName: 'a', lastName: 'b', role: 'ADMIN' }],
  ['POST', '/api/timetable/publish', {}],
  ['GET', '/api/admin/privacy/deletion-requests'],
]) await api(student, 'student', m, p, body);
const faculty = await as('faculty@demo.campusos.local');
for (const p of ['/admin', '/admin/settings', '/student/attendance', '/tools'])
  await page(faculty, 'faculty', p, p.startsWith('/admin') ? '/admin' : p);
for (const [m, p, body] of [
  ['PUT', '/api/admin/settings/attendance', { defaultMinimumPct: 10, warningMarginPct: 1, aggregateMinimumPct: null }],
  ['GET', '/api/attendance'],
  ['PATCH', '/api/admin/settings/features', { flags: { events_enabled: false } }],
]) await api(faculty, 'faculty', m, p, body);
const admin = await as('admin@demo.campusos.local');
await api(admin, 'admin', 'PATCH', '/api/admin/settings/features', { flags: { events_enabled: true } }); // super-admin only
await api(admin, 'admin', 'GET', '/api/attendance'); // no personal attendance
console.log(problems.length ? problems.join('\n') : 'no authorization leaks found');
await b.close();
