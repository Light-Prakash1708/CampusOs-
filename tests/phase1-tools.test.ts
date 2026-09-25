import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, pool } from '@/lib/db';
import * as t from '@/lib/db/schema';
import { isBuilt, type FeatureFlag } from '@/lib/features';
import { mostUsed, orderTools, resolveTool, TOOLS, toolsFor, type ToolDefinition } from '@/lib/tools';
import { ADMIN_NAV, FACULTY_NAV, MOBILE_NAV, QUICK_CREATE, STUDENT_NAV } from '@/components/layout/navigation';
import { permissionsForRoles } from '@/lib/auth/permissions';
import { updateFeatureFlags } from '@/services/institution-settings';
import { listToolsFor, recordToolOpen } from '@/services/tools';
import { buildPersonalDataExport } from '@/services/privacy';
import { registerForEvent, setSaved } from '@/services/events';
import { checkIn, createEvent, issueCertificates } from '@/services/events/organizer';
import { createTenant, createUser, ctxFor, dropTenant, meta, type TestTenant } from './helpers';

/* ------------------------ no flag exposes a dead route --------------------- */

/** '/student/attendance#subjects' → src/app/student/attendance/page.tsx */
function pageExists(href: string): boolean {
  const clean = href.split(/[?#]/)[0]!;
  return existsSync(path.join(process.cwd(), 'src/app', clean, 'page.tsx'));
}

/** Would this entry ever render as a link? (built module, not planned) */
function canRenderAsLink(item: { feature?: FeatureFlag; plannedPhase?: number }): boolean {
  if (item.plannedPhase !== undefined) return false;
  return !item.feature || isBuilt(item.feature);
}

describe('routes behind navigation', () => {
  it('every sidebar entry that can render points at a real page', () => {
    for (const group of [...STUDENT_NAV, ...FACULTY_NAV, ...ADMIN_NAV]) {
      for (const item of group.items) {
        if (!canRenderAsLink(item)) continue;
        expect(pageExists(item.href), `${item.label} → ${item.href}`).toBe(true);
      }
    }
  });

  it('every mobile tab (or its fallback) points at a real page', () => {
    for (const items of Object.values(MOBILE_NAV)) {
      for (const item of items) {
        if (item.href.startsWith('#')) continue;
        const shown = canRenderAsLink(item) ? item : item.fallback;
        if (!shown) continue;
        expect(pageExists(shown.href), `${item.label} → ${shown.href}`).toBe(true);
      }
    }
  });

  it('every quick-create action that can render as a link points at a real page', () => {
    for (const items of Object.values(QUICK_CREATE)) {
      for (const item of items) {
        if (!canRenderAsLink(item)) continue;
        expect(pageExists(item.href), `${item.label} → ${item.href}`).toBe(true);
      }
    }
  });

  it('every tool is either linkable to a real page or explicitly planned', () => {
    for (const tool of TOOLS) {
      const planned = tool.plannedPhase !== undefined || (tool.feature && !isBuilt(tool.feature));
      if (planned) {
        expect(tool.href, `${tool.key} is planned and must not carry a link`).toBeUndefined();
      } else {
        expect(tool.href, `${tool.key} needs an href`).toBeTruthy();
        expect(pageExists(tool.href!), `${tool.key} → ${tool.href}`).toBe(true);
      }
    }
  });

  it('every link the app shell builds per portal points at a real page', () => {
    // AppShell composes these from the portal name (avatar, bell, AI, inbox).
    const shell: Record<'student' | 'faculty' | 'admin', string[]> = {
      student: ['/student/profile', '/student/notifications', '/student/assistant', '/student/announcements'],
      faculty: ['/faculty/profile', '/faculty/notifications', '/faculty/copilot', '/faculty/announcements'],
      admin: ['/admin/profile', '/admin/notifications', '/admin/assistant', '/admin/communications'],
    };
    for (const hrefs of Object.values(shell)) for (const h of hrefs) expect(pageExists(h), h).toBe(true);
    for (const h of ['/account/security', '/account/privacy']) expect(pageExists(h), h).toBe(true);
  });

  it('the Tools hub itself exists and is in the student sidebar', () => {
    expect(pageExists('/tools')).toBe(true);
    expect(STUDENT_NAV.flatMap((g) => g.items).some((i) => i.href === '/tools')).toBe(true);
  });
});

/* ------------------------------- registry --------------------------------- */

const student = { featureFlags: { events_enabled: true, resource_hub_enabled: true, ai_assistant_enabled: true }, permissions: permissionsForRoles('STUDENT') as Set<string> };

describe('tool registry', () => {
  const byKey = (k: string) => TOOLS.find((x) => x.key === k)!;

  it('resolves available, planned, disabled and hidden tools', () => {
    expect(resolveTool(byKey('attendance'), student)?.status).toBe('AVAILABLE');
    const jobs = resolveTool(byKey('opportunities'), { ...student, featureFlags: { opportunity_hub_enabled: true } });
    expect(jobs).toMatchObject({ status: 'PLANNED', statusLabel: 'Coming in Phase 5', href: undefined });
    expect(resolveTool(byKey('cgpa'), student)).toMatchObject({ status: 'PLANNED', statusLabel: 'Coming in Phase 8' });
    expect(resolveTool(byKey('events'), { ...student, featureFlags: { events_enabled: false } })).toMatchObject({
      status: 'DISABLED',
      statusLabel: 'Off at your college',
      href: undefined,
    });
    // No permission → not shown at all.
    expect(resolveTool(byKey('attendance'), { ...student, permissions: new Set() })).toBeNull();
  });

  it('orders by the student’s own usage, then planned by phase', () => {
    const tools = toolsFor(student, { events: 9, timetable: 3 });
    const keys = tools.map((x) => x.key);
    expect(keys.slice(0, 2)).toEqual(['events', 'timetable']);
    const firstPlanned = tools.findIndex((x) => x.status === 'PLANNED');
    expect(tools.slice(0, firstPlanned).every((x) => x.status === 'AVAILABLE')).toBe(true);
    const phases = tools.filter((x) => x.status === 'PLANNED').map((x) => x.plannedPhase ?? 99);
    expect(phases).toEqual([...phases].sort((a, b) => a - b));
    // Without usage the editorial registry order stands.
    expect(toolsFor(student).filter((x) => x.status === 'AVAILABLE')[0]!.key).toBe('attendance');
  });

  it('planned tools can never be ranked up by usage', () => {
    const tools = toolsFor(student, { cgpa: 500 });
    expect(tools.find((x) => x.key === 'cgpa')!.openCount).toBe(0);
  });

  it('“most used” needs at least two opens and only lists available tools', () => {
    const tools = orderTools(TOOLS.map((d: ToolDefinition) => resolveTool(d, student, d.key === 'events' ? 2 : d.key === 'timetable' ? 1 : 0)!).filter(Boolean));
    expect(mostUsed(tools).map((x) => x.key)).toEqual(['events']);
  });
});

/* ------------------------------ integration ------------------------------- */

let A: TestTenant;
let B: TestTenant;

beforeAll(async () => {
  A = await createTenant();
  B = await createTenant();
  for (const id of [A.id, B.id]) {
    await db.update(t.institutions).set({ featureFlags: { events_enabled: true, event_discovery_enabled: true } }).where(eq(t.institutions.id, id));
  }
});

afterAll(async () => {
  await dropTenant(A.id);
  await dropTenant(B.id);
  await pool.end();
});

describe('feature flags cannot switch on unbuilt modules', () => {
  it('refuses to enable Tracker, Communities or Opportunities, but allows built modules', async () => {
    const superAdmin = await ctxFor((await createUser(A, { role: 'SUPER_ADMIN' })).id);
    for (const flag of ['personal_tracker_enabled', 'clubs_enabled', 'opportunity_hub_enabled'] as const) {
      await expect(updateFeatureFlags(superAdmin, { [flag]: true }, meta())).rejects.toMatchObject({ status: 422, code: 'MODULE_NOT_BUILT' });
    }
    // Switching an unbuilt module OFF is always allowed (e.g. clearing old data).
    await expect(updateFeatureFlags(superAdmin, { personal_tracker_enabled: false }, meta())).resolves.toBeTruthy();
    const after = await updateFeatureFlags(superAdmin, { grievance_enabled: true }, meta());
    expect(after.grievance_enabled).toBe(true);
    expect(after.personal_tracker_enabled).toBe(false);
  });
});

describe('tool usage', () => {
  it('counts opens per student, orders their hub, and refuses planned or unknown tools', async () => {
    const s1 = await ctxFor((await createUser(A)).id);
    const s2 = await ctxFor((await createUser(A)).id);
    await recordToolOpen(s1, 'events');
    await recordToolOpen(s1, 'events');
    expect(await recordToolOpen(s1, 'events')).toEqual({ key: 'events', openCount: 3 });
    await expect(recordToolOpen(s1, 'cgpa')).rejects.toMatchObject({ status: 409 });
    await expect(recordToolOpen(s1, 'not-a-tool')).rejects.toMatchObject({ status: 404 });

    expect((await listToolsFor(s1))[0]).toMatchObject({ key: 'events', openCount: 3 });
    // Another student's usage is untouched and invisible.
    expect((await listToolsFor(s2)).find((x) => x.key === 'events')!.openCount).toBe(0);
  });
});

describe('personal data export', () => {
  it('includes cross-college registrations, saved events, certificates and tool usage — and nobody else’s', async () => {
    const hostAdmin = await ctxFor((await createUser(B, { role: 'ADMIN' })).id);
    const start = new Date(Date.now() + 2 * 86_400_000);
    const ev = await createEvent(
      hostAdmin,
      {
        title: `Export test ${Math.random().toString(36).slice(2, 7)}`,
        category: 'WORKSHOP', visibility: 'PUBLIC', mode: 'OFFLINE', startsAt: start,
        endsAt: new Date(start.getTime() + 3600_000), registrationRequired: true, registrationMode: 'INSTANT',
        waitlistEnabled: true, priceInr: 0, certificateOffered: true, teamSizeMin: 1, teamSizeMax: 1,
      },
      meta(),
    );
    const saved = await createEvent(
      hostAdmin,
      {
        title: `Saved test ${Math.random().toString(36).slice(2, 7)}`,
        category: 'SEMINAR', visibility: 'PUBLIC', mode: 'ONLINE', startsAt: start,
        endsAt: new Date(start.getTime() + 3600_000), registrationRequired: false, registrationMode: 'INSTANT',
        waitlistEnabled: false, priceInr: 0, certificateOffered: false, teamSizeMin: 1, teamSizeMax: 1,
      },
      meta(),
    );

    const me = await ctxFor((await createUser(A)).id);
    const other = await ctxFor((await createUser(A)).id);
    const reg = await registerForEvent(me, ev.id);
    await registerForEvent(other, ev.id);
    await setSaved(me, saved.id, true);
    await checkIn(hostAdmin, ev.id, { code: reg.code! });
    await issueCertificates(hostAdmin, ev.id, {}, meta());
    await recordToolOpen(me, 'timetable');

    const data = await buildPersonalDataExport(me);
    expect(data.events.registrations.map((r) => r.eventId)).toEqual([ev.id]); // stored under college B
    expect(data.events.registrations[0]).toMatchObject({ status: 'REGISTERED', passCode: reg.code });
    expect(data.events.saved.map((s) => s.eventId)).toContain(saved.id);
    expect(data.events.saved.map((s) => s.eventId)).toContain(ev.id); // registering auto-follows
    expect(data.events.certificates).toHaveLength(1);
    expect(data.events.certificates[0]!.verificationCode).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(data.tools.usage).toEqual([expect.objectContaining({ tool: 'timetable', opened: 1 })]);

    // Nothing belonging to the other attendee leaks in.
    const text = JSON.stringify(data);
    expect(text).not.toContain(other.userId);
    expect(text).not.toContain(other.email);
  });
});
