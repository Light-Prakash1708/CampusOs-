import { describe, it, expect } from 'vitest';
import { validateEnv } from '@/lib/env';
import { fail, pgErrorOf } from '@/lib/api';
import { resolveSslMode, poolConfig } from '@/lib/db/config';
import { isCrossSiteMutation } from '@/lib/http';
import { permissionsForRoles, portalForRole } from '@/lib/auth/permissions';
import { FEATURE_FLAGS, isBuilt, isEnabled, plannedLabel } from '@/lib/features';
import {
  planDelivery,
  inQuietHours,
  minutesUntilQuietEnds,
  localMinutesIn,
  THROTTLE_PER_HOUR,
  type PlannerInput,
} from '@/services/notifications/planner';
import { escapeHtml, passwordResetEmail, notificationEmail } from '@/services/notifications/templates';
import { detectKind, validateUpload, sanitizeFileName } from '@/services/storage/validate';
import { signatureScanner, noScanner } from '@/services/storage/scanner';
import { LocalStorageProvider, S3StorageProvider, assertSafeKey } from '@/services/storage/providers';
import {
  PRIVACY_DEFAULTS,
  consentChanges,
  leaderboardIdentity,
  anonymousHandle,
  visibleProfileFields,
} from '@/services/privacy/rules';
import { DATA_CATEGORIES } from '@/services/privacy/catalogue';

/* ---------------------------------- env ----------------------------------- */

const baseEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u@localhost/db',
  AUTH_SECRET: 'x'.repeat(40),
  APP_URL: 'http://localhost:3000',
};

describe('environment validation', () => {
  it('accepts a minimal development configuration with zero third-party accounts', () => {
    const r = validateEnv(baseEnv);
    expect(r.ok).toBe(true);
    expect(r.env?.STORAGE_PROVIDER).toBe('local');
    expect(r.env?.EMAIL_PROVIDER).toBe('console');
    expect(r.env?.AI_PROVIDER).toBe('local');
  });

  it('requires credentials only for the providers that are selected', () => {
    const r = validateEnv({ ...baseEnv, AI_PROVIDER: 'anthropic', STORAGE_PROVIDER: 's3', EMAIL_PROVIDER: 'resend' });
    expect(r.ok).toBe(false);
    const joined = r.issues.join('\n');
    expect(joined).toContain('ANTHROPIC_API_KEY');
    expect(joined).toContain('STORAGE_BUCKET');
    expect(joined).toContain('RESEND_API_KEY');
  });

  it('refuses unsafe production settings', () => {
    const r = validateEnv({ ...baseEnv, NODE_ENV: 'production', DEMO_MODE: 'true', AUTH_SECRET: 'dev-only-insecure-secret-change-me-please-1234' });
    expect(r.ok).toBe(false);
    const joined = r.issues.join('\n');
    expect(joined).toContain('DEMO_MODE');
    expect(joined).toContain('AUTH_SECRET');
    expect(joined).toContain('CRON_SECRET');
    expect(joined).toContain('EMAIL_PROVIDER');
  });

  it('rejects a short AUTH_SECRET', () => {
    expect(validateEnv({ ...baseEnv, AUTH_SECRET: 'short' }).ok).toBe(false);
  });
});

describe('database TLS mode', () => {
  it('disables TLS for loopback hosts and requires it elsewhere', () => {
    expect(resolveSslMode('postgresql://u@localhost:5432/db', undefined)).toBe('disable');
    expect(resolveSslMode('postgresql://u@127.0.0.1:5432/db', undefined)).toBe('disable');
    expect(resolveSslMode('postgresql://u@db.abc.supabase.co:5432/postgres', undefined)).toBe('require');
    expect(resolveSslMode('postgresql://u@host/db?sslmode=disable', undefined)).toBe('disable');
    expect(resolveSslMode('postgresql://u@localhost/db', 'verify')).toBe('verify');
  });
  it('strips sslmode from the URL so the explicit setting wins', () => {
    expect(poolConfig('postgresql://u@h/db?sslmode=require').connectionString).toBe('postgresql://u@h/db');
  });
});

/* --------------------------------- CSRF ----------------------------------- */

describe('cross-site mutation guard', () => {
  it('allows same-origin and non-browser requests', () => {
    expect(isCrossSiteMutation('POST', 'https://campus.edu', 'campus.edu', undefined)).toBe(false);
    expect(isCrossSiteMutation('POST', null, 'campus.edu', undefined)).toBe(false);
    expect(isCrossSiteMutation('GET', 'https://evil.com', 'campus.edu', undefined)).toBe(false);
    expect(isCrossSiteMutation('POST', 'https://app.campus.edu', 'internal:3000', 'https://app.campus.edu')).toBe(false);
  });
  it('blocks mutations from other origins', () => {
    expect(isCrossSiteMutation('POST', 'https://evil.com', 'campus.edu', undefined)).toBe(true);
    expect(isCrossSiteMutation('DELETE', 'null', 'campus.edu', undefined)).toBe(true);
    expect(isCrossSiteMutation('PATCH', 'not a url', 'campus.edu', undefined)).toBe(true);
  });
});

/* ------------------------------ roles & flags ------------------------------ */

describe('CampusOS 2.0 roles and capabilities', () => {
  it('gives every role the right to manage their own privacy', () => {
    for (const role of ['STUDENT', 'FACULTY', 'ADMIN', 'FINANCE', 'CAMPUS_REP']) {
      expect(permissionsForRoles(role).has('privacy:manage_own'), role).toBe(true);
    }
  });
  it('keeps community roles additive and non-administrative', () => {
    const rep = permissionsForRoles('STUDENT', ['CAMPUS_REP', 'CLUB_ADMIN']);
    expect(rep.has('campus_rep:act')).toBe(true);
    expect(rep.has('club:manage')).toBe(true);
    expect(rep.has('assignment:submit')).toBe(true);
    expect(rep.has('user:invite')).toBe(false);
    expect(rep.has('event:moderate')).toBe(false);
    expect(portalForRole('CAMPUS_REP')).toBe('student');
  });
  it('restricts invitations, approvals and privacy requests to administrators', () => {
    expect(permissionsForRoles('STUDENT').has('user:invite')).toBe(false);
    expect(permissionsForRoles('FACULTY').has('user:approve_registration')).toBe(false);
    expect(permissionsForRoles('ADMIN').has('user:invite')).toBe(true);
    expect(permissionsForRoles('ADMIN').has('privacy:handle_requests')).toBe(true);
    expect(permissionsForRoles('ADMIN').has('institution:manage')).toBe(false);
    expect(permissionsForRoles('SUPER_ADMIN').has('institution:manage')).toBe(true);
  });
  it('ships every 2.0 module switched off by default', () => {
    const modules = [
      'library_enabled', 'gamification_enabled', 'personal_tracker_enabled', 'leaderboards_enabled', 'clubs_enabled',
      'event_discovery_enabled', 'opportunity_hub_enabled', 'ai_coach_enabled', 'ai_memory_enabled',
      'campus_channels_enabled', 'campus_rep_enabled', 'billing_enabled',
    ] as const;
    for (const m of modules) {
      expect(FEATURE_FLAGS[m].defaultValue, m).toBe(false);
      expect(isEnabled({}, m)).toBe(false);
      // A stored `true` only takes effect once the module is actually built.
      expect(isEnabled({ [m]: true }, m)).toBe(isBuilt(m));
    }
  });
  it('never lets a flag switch on a module that is not built', () => {
    for (const m of ['clubs_enabled', 'opportunity_hub_enabled', 'ai_coach_enabled'] as const) {
      expect(isBuilt(m)).toBe(false);
      expect(isEnabled({ [m]: true }, m)).toBe(false);
      expect(plannedLabel(m)).toMatch(/^Coming in Phase \d+$/);
    }
    expect(isBuilt('events_enabled')).toBe(true);
    expect(plannedLabel('events_enabled')).toBeNull();
    expect(isEnabled({ events_enabled: true }, 'events_enabled')).toBe(true);
    // Phase 8 shipped these: built, off by default, and switchable per college.
    for (const m of ['personal_tracker_enabled', 'gamification_enabled', 'leaderboards_enabled'] as const) {
      expect(isBuilt(m)).toBe(true);
      expect(isEnabled({ [m]: true }, m)).toBe(true);
    }
  });
});

/* ------------------------- notification planning -------------------------- */

function input(over: Partial<PlannerInput> = {}): PlannerInput {
  return {
    priority: 'IMPORTANT',
    category: 'ACADEMIC',
    mandatory: false,
    tenantChannels: { EMAIL: true, PUSH: true, SMS: true, WHATSAPP: true },
    providerReady: { EMAIL: true, PUSH: true, SMS: true, WHATSAPP: true },
    recipient: { email: 'a@b.c', emailVerified: true, phone: '+919800000000', hasPushSubscription: true },
    settings: { emailEnabled: true, pushEnabled: true, smsEnabled: true, quietHoursEnabled: false, quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    categoryPrefs: {},
    recentCounts: {},
    localMinutes: 12 * 60,
    now: new Date('2026-09-25T06:30:00Z'),
    ...over,
  };
}
const actions = (i: PlannerInput) => Object.fromEntries(planDelivery(i).map((d) => [d.channel, d.action === 'SEND' ? 'SEND' : d.reason]));

describe('notification delivery planner', () => {
  it('routes by priority', () => {
    expect(actions(input({ priority: 'CRITICAL' }))).toMatchObject({ EMAIL: 'SEND', PUSH: 'SEND', SMS: 'SEND', WHATSAPP: 'not_opted_in' });
    expect(actions(input({ priority: 'IMPORTANT' }))).toMatchObject({ EMAIL: 'SEND', PUSH: 'SEND', SMS: 'priority_in_app_only' });
    expect(actions(input({ priority: 'NORMAL' }))).toMatchObject({ EMAIL: 'priority_in_app_only', PUSH: 'SEND' });
    expect(Object.values(actions(input({ priority: 'INFORMATIONAL' })))).toEqual(Array(4).fill('priority_in_app_only'));
  });

  it('respects the student’s channel and category choices', () => {
    expect(actions(input({ settings: { ...input().settings, emailEnabled: false } })).EMAIL).toBe('user_disabled_channel');
    expect(actions(input({ categoryPrefs: { PUSH: false } })).PUSH).toBe('user_disabled_category');
  });

  it('lets only MANDATORY institutional notices override personal preferences', () => {
    const off = { ...input().settings, emailEnabled: false, pushEnabled: false, smsEnabled: false };
    expect(actions(input({ priority: 'CRITICAL', settings: off })).EMAIL).toBe('user_disabled_channel');
    const forced = actions(input({ priority: 'CRITICAL', mandatory: true, settings: off }));
    expect(forced).toMatchObject({ EMAIL: 'SEND', PUSH: 'SEND', SMS: 'SEND', WHATSAPP: 'SEND' });
  });

  it('never sends on a channel the institution or deployment has not enabled', () => {
    expect(actions(input({ mandatory: true, tenantChannels: { EMAIL: false, PUSH: true, SMS: true, WHATSAPP: true } })).EMAIL).toBe('tenant_channel_disabled');
    expect(actions(input({ mandatory: true, providerReady: { EMAIL: true, PUSH: false, SMS: true, WHATSAPP: true } })).PUSH).toBe('provider_not_configured');
  });

  it('requires contact details and a verified email', () => {
    expect(actions(input({ recipient: { ...input().recipient, emailVerified: false } })).EMAIL).toBe('email_unverified');
    expect(actions(input({ priority: 'CRITICAL', recipient: { ...input().recipient, phone: null } })).SMS).toBe('no_contact');
    expect(actions(input({ recipient: { ...input().recipient, hasPushSubscription: false } })).PUSH).toBe('no_contact');
  });

  it('throttles non-mandatory bursts per channel', () => {
    expect(actions(input({ recentCounts: { EMAIL: THROTTLE_PER_HOUR.EMAIL } })).EMAIL).toBe('throttled');
    expect(actions(input({ mandatory: true, recentCounts: { EMAIL: 999 } })).EMAIL).toBe('SEND');
  });

  it('defers interruptive channels until quiet hours end, except critical ones', () => {
    const quiet = { ...input().settings, quietHoursEnabled: true };
    const at23 = input({ settings: quiet, localMinutes: 23 * 60 });
    const push = planDelivery(at23).find((d) => d.channel === 'PUSH')!;
    const email = planDelivery(at23).find((d) => d.channel === 'EMAIL')!;
    expect(push.action).toBe('SEND');
    if (push.action === 'SEND') expect(push.runAfter.getTime() - at23.now.getTime()).toBe(8 * 3600_000);
    if (email.action === 'SEND') expect(email.runAfter).toEqual(at23.now);
    const critical = planDelivery({ ...at23, priority: 'CRITICAL' }).find((d) => d.channel === 'PUSH')!;
    if (critical.action === 'SEND') expect(critical.runAfter).toEqual(at23.now);
  });

  it('handles quiet windows that wrap midnight', () => {
    expect(inQuietHours(23 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(3 * 60, '22:00', '07:00')).toBe(true);
    expect(inQuietHours(12 * 60, '22:00', '07:00')).toBe(false);
    expect(inQuietHours(13 * 60, '12:00', '14:00')).toBe(true);
    expect(minutesUntilQuietEnds(23 * 60, '07:00')).toBe(8 * 60);
  });

  it('computes local time in the institution’s timezone', () => {
    // 06:30 UTC is 12:00 in Kolkata.
    expect(localMinutesIn(new Date('2026-09-25T06:30:00Z'), 'Asia/Kolkata')).toBe(12 * 60);
  });
});

describe('email templates', () => {
  it('escapes interpolated values', () => {
    expect(escapeHtml('<script>"x"&\'')).toBe('&lt;script&gt;&quot;x&quot;&amp;&#39;');
    const m = notificationEmail({ to: 'a@b', institutionName: 'KBI', title: '<img src=x onerror=alert(1)>', body: 'hi', url: null, priority: 'NORMAL' });
    expect(m.html).not.toContain('<img src=x');
  });
  it('puts the reset link in both parts and says when it expires', () => {
    const m = passwordResetEmail({ to: 'a@b', firstName: 'A', institutionName: 'KBI', url: 'https://x/reset?token=abc', expiresMinutes: 30 });
    expect(m.text).toContain('https://x/reset?token=abc');
    expect(m.html).toContain('https://x/reset?token=abc');
    expect(m.text).toContain('30 minutes');
  });
});

/* -------------------------------- storage --------------------------------- */

const PDF = new Uint8Array([...Buffer.from('%PDF-1.7\n'), ...new Uint8Array(100)]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const DOCX = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...Buffer.from('....[Content_Types].xml....word/document.xml')]);
const EXE = new Uint8Array([...Buffer.from('MZ'), 0x90, 0x00, ...new Uint8Array(40)]);

describe('upload validation', () => {
  it('detects types from content, not from the name', () => {
    expect(detectKind(PDF)).toBe('pdf');
    expect(detectKind(PNG)).toBe('png');
    expect(detectKind(DOCX)).toBe('docx');
    expect(detectKind(EXE)).toBeNull();
  });
  it('accepts a matching file and stores the detected MIME type', () => {
    const r = validateUpload({ name: 'notes.pdf', bytes: PDF, purpose: 'RESOURCE', maxBytes: 1_000_000 });
    expect(r).toMatchObject({ ok: true, kind: 'pdf', mime: 'application/pdf' });
  });
  it('rejects disguised, oversize, empty and disallowed files', () => {
    expect(validateUpload({ name: 'virus.pdf', bytes: EXE, purpose: 'RESOURCE', maxBytes: 1e6 })).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' });
    expect(validateUpload({ name: 'photo.pdf', bytes: PNG, purpose: 'RESOURCE', maxBytes: 1e6 })).toMatchObject({ ok: false, code: 'TYPE_MISMATCH' });
    expect(validateUpload({ name: 'big.pdf', bytes: PDF, purpose: 'RESOURCE', maxBytes: 10 })).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    expect(validateUpload({ name: 'a.pdf', bytes: new Uint8Array(), purpose: 'RESOURCE', maxBytes: 1e6 })).toMatchObject({ ok: false, code: 'EMPTY' });
    expect(validateUpload({ name: 'a.pdf', bytes: PDF, purpose: 'AVATAR', maxBytes: 1e6 })).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' });
    expect(validateUpload({ name: 'a.pdf', bytes: PDF, purpose: 'NOPE', maxBytes: 1e6 })).toMatchObject({ ok: false, code: 'BAD_PURPOSE' });
  });
  it('sanitises file names', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Users\\a\\report<1>.pdf')).toBe('report1.pdf');
    expect(sanitizeFileName('\u0000')).toBe('file');
  });
});

describe('malware scanner adapters', () => {
  it('never claims CLEAN when no scanner is configured', async () => {
    expect((await noScanner.scan(PDF)).status).toBe('NOT_SCANNED');
  });
  it('flags executables and the EICAR test signature', async () => {
    expect((await signatureScanner.scan(EXE)).status).toBe('INFECTED');
    const eicar = Buffer.from('%PDF-1.4 X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    expect((await signatureScanner.scan(eicar)).status).toBe('INFECTED');
    expect((await signatureScanner.scan(PDF)).status).toBe('CLEAN');
  });
});

describe('storage providers', () => {
  it('refuses keys that could escape the storage root', () => {
    expect(() => assertSafeKey('../etc/passwd')).toThrow();
    expect(() => assertSafeKey('/abs/path')).toThrow();
    expect(() => assertSafeKey('a//b')).toThrow();
    expect(() => assertSafeKey('tenant/resource/2026/09/x.pdf')).not.toThrow();
    const local = new LocalStorageProvider('/tmp/campusos-test');
    return expect(local.read('../../etc/passwd')).rejects.toThrow();
  });
  it('produces short-lived SigV4 pre-signed URLs for S3-compatible stores', async () => {
    const s3 = new S3StorageProvider('supabase', 'https://ref.supabase.co/storage/v1/s3', 'campusos', 'AKID', 'SECRET', 'ap-south-1');
    const url = new URL(await s3.signedUrl('t/resource/2026/09/a_b.pdf', { expiresSec: 300, downloadName: 'Notes.pdf' }));
    expect(url.origin + url.pathname).toBe('https://ref.supabase.co/storage/v1/s3/campusos/t/resource/2026/09/a_b.pdf');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/ap-south-1/s3/aws4_request');
  });
});

/* -------------------------------- privacy --------------------------------- */

describe('privacy rules', () => {
  it('defaults to private for everything optional', () => {
    expect(PRIVACY_DEFAULTS.leaderboardVisibility).toBe('PRIVATE');
    expect(PRIVACY_DEFAULTS.showStreaks).toBe(false);
    expect(PRIVACY_DEFAULTS.showEventParticipation).toBe(false);
    expect(PRIVACY_DEFAULTS.aiMemoryEnabled).toBe(false);
    expect(PRIVACY_DEFAULTS.aiCoachScopes).toEqual([]);
  });

  it('records a consent entry for every consent-bearing change and nothing else', () => {
    const after = { ...PRIVACY_DEFAULTS, leaderboardVisibility: 'ANONYMOUS' as const, aiMemoryEnabled: true, profileVisibility: 'PRIVATE' as const, aiCoachScopes: ['timetable' as const] };
    const changes = consentChanges(PRIVACY_DEFAULTS, after);
    expect(changes).toEqual(
      expect.arrayContaining([
        { purpose: 'leaderboard_participation', granted: true },
        { purpose: 'ai_memory', granted: true },
        { purpose: 'ai_coach:timetable', granted: true },
      ]),
    );
    expect(changes).toHaveLength(3);
    expect(consentChanges(after, after)).toHaveLength(0);
  });

  it('shows leaderboard identities only as the student chose', () => {
    const subject = { userId: 'u-1', displayName: 'Ananya Iyer' };
    expect(leaderboardIdentity({ leaderboardVisibility: 'PUBLIC' }, subject, 'viewer')).toEqual({ visible: true, label: 'Ananya Iyer', isSelf: false });
    const anon = leaderboardIdentity({ leaderboardVisibility: 'ANONYMOUS' }, subject, 'viewer');
    expect(anon.visible).toBe(true);
    expect(anon.label).not.toContain('Ananya');
    expect(anon.label).toBe(anonymousHandle('u-1'));
    expect(leaderboardIdentity({ leaderboardVisibility: 'PRIVATE' }, subject, 'viewer').visible).toBe(false);
    expect(leaderboardIdentity({ leaderboardVisibility: 'OPT_OUT' }, subject, 'viewer').visible).toBe(false);
    expect(leaderboardIdentity({ leaderboardVisibility: 'PRIVATE' }, subject, 'u-1')).toMatchObject({ visible: true, isSelf: true });
  });

  it('never exposes attendance or grades on a profile, whatever the settings', () => {
    const everything = { ...PRIVACY_DEFAULTS, showStreaks: true, showEventParticipation: true, showAchievements: true };
    const fields = visibleProfileFields(everything, false) as string[];
    expect(fields).not.toContain('attendance');
    expect(fields).not.toContain('grades');
    expect(visibleProfileFields({ ...everything, profileVisibility: 'PRIVATE' }, false)).toEqual(['name']);
    expect(visibleProfileFields(PRIVACY_DEFAULTS, false)).not.toContain('streaks');
  });

  it('documents every data category completely', () => {
    for (const c of DATA_CATEGORIES) {
      expect(c.stored.length, c.key).toBeGreaterThan(0);
      expect(c.usedFor.length, c.key).toBeGreaterThan(0);
      expect(c.visibleTo.length, c.key).toBeGreaterThan(0);
      expect(c.disableNote && c.retentionNote && c.deletionPolicy && c.exportPolicy, c.key).toBeTruthy();
    }
    const keys = DATA_CATEGORIES.map((c) => c.key);
    for (const required of ['account', 'academic', 'attendance', 'personal_tracking', 'events', 'goals', 'ai', 'notifications', 'leaderboard', 'library']) {
      expect(keys).toContain(required);
    }
  });
});

describe('database error mapping (v1 defect D12)', () => {
  it('finds the SQLSTATE on Drizzle-wrapped errors and maps unique violations to 409', async () => {
    const wrapped = Object.assign(new Error('Failed query'), {
      cause: { code: '23505', constraint: 'timetable_room_slot_uq' },
    });
    expect(pgErrorOf(wrapped).code).toBe('23505');
    const res = fail(wrapped);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.message).toBe('That room is already booked for this period.');
  });
});
