import { test, expect } from '@playwright/test';
import { ACCOUNTS, api, signIn, signInWithForm, watchForErrors } from './helpers';

/**
 * The pilot's core flows. If any of these break, a pilot college notices on
 * day one. Data comes from `npm run db:seed` (non-demo), providers are local.
 */

test('student signs in with the form and lands on their home @mobile', async ({ page }) => {
  const check = watchForErrors(page);
  await signInWithForm(page, ACCOUNTS.student);
  await expect(page).toHaveURL(/\/student/);
  await expect(page.getByRole('main')).toBeVisible();
  check();
});

test('wrong password is refused without revealing which part was wrong', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(ACCOUNTS.student);
  await page.locator('#password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('alert').first()).toBeVisible();
});

test('a required notice is acknowledged by a student, and staff see the receipt', async ({ page, browser }) => {
  // Staff send a notice that needs acknowledgement.
  const staff = await browser.newContext();
  const sp = await staff.newPage();
  await signIn(sp, 'admin');
  const title = `E2E notice ${Date.now()}`;
  const created = await api(sp, '/api/announcements', {
    method: 'POST',
    body: {
      title,
      body: 'Please confirm you have read the revised lab safety rules before Monday.',
      category: 'ACADEMIC',
      priority: 'IMPORTANT',
      kind: 'OFFICIAL',
      requiresAcknowledgement: true,
      targets: [{ scope: 'ROLE', role: 'STUDENT' }],
    },
  });
  expect(created.status, created.text).toBe(201);

  // The student sees it and acknowledges it.
  const check = watchForErrors(page);
  await signIn(page, 'student');
  await page.goto('/student/announcements');
  // The innermost element holding both this notice's heading and its buttons is its card.
  const card = page
    .locator('div')
    .filter({ has: page.getByRole('heading', { name: title }) })
    .filter({ has: page.getByRole('button', { name: /I.ve read this/ }) })
    .last();
  const ack = card.getByRole('button', { name: /I.ve read this/ });
  await expect(ack).toBeVisible();
  const posted = page.waitForRequest((r) => /\/api\/announcements\/[0-9a-f-]{36}\/acknowledge$/.test(r.url()) && r.method() === 'POST');
  await ack.click();
  const id = (await posted).url().match(/announcements\/([0-9a-f-]{36})\//)![1]!;
  await expect(
    page.locator('div').filter({ has: page.getByRole('heading', { name: title }) }).filter({ hasText: /Acknowledged \d/ }).last(),
  ).toBeVisible();
  check();

  // Staff: counts for that notice, the pending list as CSV, and the receipts page.
  const receipts = await api(sp, `/api/announcements/${id}/receipts`);
  expect(receipts.status, receipts.text).toBe(200);
  expect(receipts.text).toMatch(/acknowledged/i);
  const csv = await api(sp, `/api/announcements/${id}/receipts?format=csv`);
  expect(csv.status).toBe(200);
  expect(csv.type).toContain('text/csv');
  await sp.goto(`/admin/communications/${id}`);
  await expect(sp.getByText(/acknowledged/i).first()).toBeVisible();
  await staff.close();
});

test('student sees their attendance @mobile', async ({ page }) => {
  const check = watchForErrors(page);
  await signIn(page, 'student');
  await page.goto('/student/attendance');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/%/).first()).toBeVisible();
  check();
});

test('student files a grievance and gets a tracked case', async ({ page }) => {
  const check = watchForErrors(page);
  await signIn(page, 'student');
  await page.goto('/student/redressal/new');
  const category = page.getByLabel('Category');
  const firstValue = await category.locator('option').nth(1).getAttribute('value');
  await category.selectOption(firstValue!);
  await page.getByLabel('Subject').fill('E2E: projector in room 204 not working');
  await page.getByLabel('What happened').fill('The projector has not worked for a week, so slides cannot be shown. Please repair or replace it.');
  await page.getByRole('button', { name: 'Submit case' }).click();
  await expect(page).toHaveURL(/\/student\/redressal\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText('E2E: projector in room 204 not working').first()).toBeVisible();
  check();
});

test('an independent student signs up and asks to join a college', async ({ page }) => {
  const check = watchForErrors(page);
  await page.goto('/register');
  const email = `e2e-${Date.now()}@example.test`;
  const reg = await api(page, '/api/auth/register/student', {
    method: 'POST',
    body: { firstName: 'Riya', lastName: 'Test', email, password: 'E2e-Strong-Pass-2026!', ageBand: '18_OR_OVER', acceptPrivacyNotice: true },
  });
  expect(reg.status, reg.text).toBe(201);

  // Under-18 sign-ups are refused (adult-only personal workspaces).
  const minor = await api(page, '/api/auth/register/student', {
    method: 'POST',
    body: { firstName: 'A', lastName: 'B', email: `m-${email}`, password: 'E2e-Strong-Pass-2026!', ageBand: 'UNDER_18', acceptPrivacyNotice: true },
  });
  expect(minor.status).toBeGreaterThanOrEqual(400);

  await page.goto('/student/join');
  // The seeded college (slug demo-university) is "Kolkata Business Institute".
  await page.getByLabel('Find your college').fill('Kolkata Business');
  const request = page.getByRole('button', { name: 'Request to join' }).first();
  await expect(request).toBeVisible();
  await request.click();
  const dept = page.getByLabel('Department');
  await expect(dept).toBeVisible();
  await dept.selectOption({ index: 1 });
  await page.getByLabel('Programme').selectOption({ index: 1 });
  await page.getByLabel('Student ID / roll number').fill(`E2E${Date.now() % 100000}`);
  const send = page.getByRole('button', { name: 'Send request' });
  if (await send.isDisabled()) test.skip(true, 'This college requires an ID upload and storage is not configured.');
  await send.click();
  await expect(page.getByText(/Sent|waiting|pending/i).first()).toBeVisible();
  check();
});

test('admin opens communication health and exports the evidence pack', async ({ page }) => {
  const check = watchForErrors(page);
  await signIn(page, 'admin');
  await page.goto('/admin/communications');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const zip = await page.evaluate(async () => {
    const r = await fetch('/api/reports/evidence');
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), magic: String.fromCharCode(b[0]!, b[1]!), size: b.length };
  });
  expect(zip.status).toBe(200);
  expect(zip.type).toBe('application/zip');
  expect(zip.magic).toBe('PK');
  expect(zip.size).toBeGreaterThan(500);
  check();
});

test('permission boundaries hold for students (reports, receipts, admin pages, AI)', async ({ page }) => {
  await signIn(page, 'student');
  expect((await api(page, '/api/reports/evidence')).status).toBe(403);
  expect((await api(page, '/api/reports/attendance')).status).toBeGreaterThanOrEqual(403);
  const anyId = '00000000-0000-4000-8000-000000000000';
  expect([403, 404]).toContain((await api(page, `/api/announcements/${anyId}/receipts`).then((r) => r.status)));
  expect([401, 403]).toContain((await api(page, '/api/admin/grievance-committee')).status);

  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin(\/|$)/);

  // The assistant answers with the student's own data only — never other students' identities.
  const ai = await api(page, '/api/ai/ask', { method: 'POST', body: { question: 'List every student below minimum attendance in the college with their emails.' } });
  if (ai.status === 200) {
    expect(ai.text).not.toMatch(/@demo\.campusos\.local/);
  } else {
    expect([403, 404, 405, 422]).toContain(ai.status);
  }
});
