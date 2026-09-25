/* global URL, document, window */
// Smoke crawler: visits routes as a signed-in user at desktop and phone widths and
// reports HTTP errors, console/page errors, horizontal overflow and dead links.
// Usage (needs Playwright: npm i -D playwright && npx playwright install chromium):
//   node scripts/smoke/crawl.mjs "/student,/student/attendance" student@demo.campusos.local
// PLAYWRIGHT_CHROMIUM overrides the browser path.
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const PW = process.env.PW || 'CampusOS@2026';
const ROUTES = process.argv[2].split(',');
const email = process.argv[3];
const b = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
if (email !== '-') {
  const r = await page.request.post(BASE + '/api/auth/login', { data: { email, password: PW }, headers: { origin: BASE } });
  if (!r.ok()) { console.log('LOGIN FAILED', email, r.status(), await r.text()); process.exit(1); }
}
const problems = [];
const linkSet = new Set();
let errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
for (const route of ROUTES) {
  for (const vw of [[1440, 900], [390, 844]]) {
    errs = [];
    await page.setViewportSize({ width: vw[0], height: vw[1] });
    let resp;
    try { resp = await page.goto(BASE + route, { waitUntil: 'load', timeout: 30000 }); await page.waitForTimeout(800); } catch (e) { problems.push(`${route} @${vw[0]}: NAV ${e.message.slice(0, 80)}`); continue; }
    const final = new URL(page.url()).pathname;
    const status = resp?.status();
    if (status >= 400) problems.push(`${route} @${vw[0]}: HTTP ${status}`);
    if (vw[0] === 390) {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (over > 1) problems.push(`${route} @390: horizontal overflow ${over}px`);
    } else {
      const hrefs = await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href')));
      hrefs.forEach((h) => linkSet.add(h.split('#')[0]));
    }
    for (const e of errs) problems.push(`${route} @${vw[0]}: ${e}`);
    if (final !== route && vw[0] === 1440) console.log(`  ${route} → ${final}`);
  }
}
// check collected links
for (const h of linkSet) {
  if (h.startsWith('/api/auth/logout')) continue;
  const r = await page.request.get(BASE + h, { maxRedirects: 5 });
  if (r.status() >= 400) problems.push(`LINK ${h}: HTTP ${r.status()}`);
}
console.log(`${email}: ${ROUTES.length} routes, ${linkSet.size} links, ${problems.length} problems`);
for (const p of problems) console.log('  ✗ ' + p);
await b.close();
