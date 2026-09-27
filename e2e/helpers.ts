import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = process.env.DEMO_PASSWORD ?? 'CampusOS!Demo2026';
export const ACCOUNTS = {
  student: 'student@demo.campusos.local',
  faculty: 'faculty@demo.campusos.local',
  admin: 'admin@demo.campusos.local',
} as const;

/** Signs in through the real form. */
export async function signInWithForm(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 });
}

const AUTH_DIR = 'e2e/.auth';

/**
 * Signs in with a same-origin API call (used where login isn't the subject).
 * Each role signs in once per run and its session cookies are reused, so the
 * suite stays under the sign-in rate limit.
 */
export async function signIn(page: Page, role: keyof typeof ACCOUNTS) {
  const file = `${AUTH_DIR}/${role}.json`;
  if (existsSync(file)) {
    await page.context().addCookies(JSON.parse(readFileSync(file, 'utf8')));
    await page.goto('/login');
    if ((await page.evaluate(() => fetch('/api/auth/sessions').then((r) => r.status))) === 200) return;
  }
  await page.goto('/login');
  const status = await page.evaluate(
    async ([email, password]) => {
      const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
      return r.status;
    },
    [ACCOUNTS[role], PASSWORD],
  );
  expect(status, `sign-in as ${role}`).toBe(200);
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(await page.context().cookies()));
}

/** Same-origin fetch from the page, so cookies and CSRF/origin checks apply as in the app. */
export async function api(page: Page, path: string, init?: { method?: string; body?: unknown }) {
  return page.evaluate(
    async ([p, i]) => {
      const r = await fetch(p, {
        method: i?.method ?? 'GET',
        headers: i?.body ? { 'content-type': 'application/json' } : undefined,
        body: i?.body ? JSON.stringify(i.body) : undefined,
      });
      const type = r.headers.get('content-type') ?? '';
      const text = type.includes('zip') ? '' : await r.text();
      return { status: r.status, type, text };
    },
    [path, init] as const,
  );
}

/** Fails the test on any uncaught page error or 5xx response. */
export function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  return () => expect(errors, 'no page errors or 5xx').toEqual([]);
}
