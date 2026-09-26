// Authorization probe for tracker, library, opportunities, AI and event-edit APIs.
// Usage: start the app (next start), then `node scripts/smoke/authz-modules.mjs`.
/* global URL */
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function as(email) {
  const ctx = await b.newContext();
  if (email) {
    const r = await ctx.request.post(BASE + '/api/auth/login', { data: { email, password: 'CampusOS@2026' }, headers: { origin: BASE } });
    if (!r.ok()) throw new Error('login ' + email + ' ' + r.status());
  }
  return ctx;
}
const problems = [];
let checks = 0;
async function api(ctx, who, method, path, body) {
  checks++;
  const r = await ctx.request.fetch(BASE + path, { method, data: body, headers: { origin: BASE }, maxRedirects: 0 });
  if (r.status() < 400) problems.push(`${who} ${method} ${path} → ${r.status()}`);
}
async function page(ctx, who, path, mustNotLand) {
  checks++;
  const r = await ctx.request.get(BASE + path, { maxRedirects: 5 });
  const landed = new URL(r.url()).pathname;
  if (r.status() === 200 && landed.startsWith(mustNotLand)) problems.push(`${who} reached ${path} (landed ${landed})`);
}
const Z = '00000000-0000-4000-8000-000000000000';
const anon = await as(null);
for (const [m, p] of [['GET', '/api/tracker'], ['GET', '/api/progress'], ['GET', '/api/leaderboard'], ['GET', '/api/library/me'], ['GET', '/api/library/books'], ['GET', '/api/opportunities'], ['GET', '/api/ai/conversations'], ['POST', '/api/ai/ask'], ['GET', `/api/events/${Z}/ics`]])
  await api(anon, 'anonymous', m, p, {});
for (const p of ['/student/tracker', '/student/library', '/student/opportunities', '/admin/library', '/admin/opportunities']) await page(anon, 'anonymous', p, p);
const student = await as('student@demo.campusos.local');
for (const [m, p, body] of [
  ['POST', '/api/library/books', { title: 'x', totalCopies: 1 }],
  ['POST', '/api/library/loans', { bookId: Z, borrower: 'student@demo.campusos.local' }],
  ['POST', `/api/library/loans/${Z}/return`, {}],
  ['POST', `/api/opportunities/${Z}/moderate`, { action: 'APPROVE' }],
  ['POST', '/api/opportunities/import', {}],
  ['POST', `/api/ai/actions/${Z}`, { decision: 'confirm' }],
  ['GET', `/api/ai/conversations/${Z}`],
  ['PATCH', `/api/events/${Z}`, {}],
  ['POST', `/api/events/${Z}/cancel`, { reason: 'nope nope' }],
  ['POST', `/api/tracker/goals/${Z}/checkin`, {}],
  ['PATCH', `/api/tracker/tasks/${Z}`, { done: true }],
]) await api(student, 'student', m, p, body);
for (const p of ['/admin/library', '/admin/opportunities']) await page(student, 'student', p, '/admin');
const faculty = await as('faculty@demo.campusos.local');
for (const [m, p, body] of [['GET', '/api/tracker'], ['POST', '/api/tracker/tasks', { title: 'x' }], ['GET', '/api/progress'], ['POST', '/api/library/loans', { bookId: Z, borrower: 'a' }]])
  await api(faculty, 'faculty', m, p, body);
console.log(`${checks} checks, ${problems.length} problems`);
for (const p of problems) console.log('  ✗', p);
await b.close();
