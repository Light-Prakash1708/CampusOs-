import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateEnv, publicBaseUrl } from '@/lib/env';

/**
 * Structural checks on render.yaml, without a YAML dependency: the Blueprint
 * is written one `- key:` per env var, with the source on the next line.
 */
const blueprint = readFileSync('render.yaml', 'utf8');

type Source = { kind: 'value'; value: string } | { kind: 'sync' } | { kind: 'generated' } | { kind: 'linked' };

function envVars(section: string): Map<string, Source> {
  const out = new Map<string, Source>();
  const lines = section.split('\n').map((l) => l.replace(/\s+#.*$/, '').trimEnd());
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*- key: ([A-Z0-9_]+)$/.exec(lines[i]);
    if (!m) continue;
    const next = lines[i + 1]?.trim() ?? '';
    let src: Source;
    if (next.startsWith('value:')) src = { kind: 'value', value: next.slice(6).trim().replace(/^"(.*)"$/, '$1') };
    else if (next === 'sync: false') src = { kind: 'sync' };
    else if (next === 'generateValue: true') src = { kind: 'generated' };
    else if (next === 'fromDatabase:' || next === 'fromService:') src = { kind: 'linked' };
    else throw new Error(`env var ${m[1]} has no recognised source: "${next}"`);
    if (out.has(m[1])) throw new Error(`env var ${m[1]} declared twice`);
    out.set(m[1], src);
  }
  return out;
}

const [webSection, cronSection] = blueprint.split(/\n {2}- type: cron\n/);
const web = envVars(webSection);
const cron = envVars(cronSection.split(/\ndatabases:\n/)[0]);

describe('render.yaml blueprint', () => {
  it('declares the web service commands, health check and Node version', () => {
    expect(webSection).toMatch(/^\s+runtime: node$/m);
    expect(webSection).toMatch(/^\s+buildCommand: npm ci --include=dev && npm run build$/m);
    expect(webSection).toMatch(/^\s+preDeployCommand: npm run db:migrate$/m);
    expect(webSection).toMatch(/^\s+startCommand: npm start$/m);
    expect(webSection).toMatch(/^\s+healthCheckPath: \/api\/health$/m);
    expect(web.get('NODE_VERSION')).toEqual({ kind: 'value', value: '22' });
    expect(readFileSync('.node-version', 'utf8').trim()).toBe('22');
  });

  it('starts the server on the platform port', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.scripts.start).toContain('${PORT:-3000}');
    expect(pkg.scripts['db:migrate']).toBe('tsx scripts/migrate.ts');
  });

  it('never holds a credential value', () => {
    const credential = /(KEY|SECRET|TOKEN|PASSWORD|DSN|WEBHOOK_URL|DATABASE_URL|PRIVATE)/;
    for (const vars of [web, cron]) {
      for (const [key, src] of vars) {
        if (credential.test(key)) expect({ key, kind: src.kind }).not.toEqual({ key, kind: 'value' });
      }
    }
    // Nothing that looks like a key, token or connection string with a password.
    expect(blueprint).not.toMatch(/postgres(ql)?:\/\/[^\s"]*:[^\s"]*@/);
    expect(blueprint).not.toMatch(/\b(sk-ant-|re_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{12})/);
  });

  it('wires the database, generates secrets and shares CRON_SECRET with the cron job', () => {
    expect(web.get('DATABASE_URL')?.kind).toBe('linked');
    expect(web.get('AUTH_SECRET')?.kind).toBe('generated');
    expect(web.get('CRON_SECRET')?.kind).toBe('generated');
    expect(cron.get('CRON_SECRET')?.kind).toBe('linked');
    expect(cronSection).toContain('x-cron-secret: $CRON_SECRET');
    expect(cronSection).toContain('/api/jobs/run');
  });

  it('only declares variables the application reads', () => {
    const known = new Set([
      ...readFileSync('src/lib/env.ts', 'utf8').matchAll(/^\s{4}([A-Z0-9_]+):/gm),
    ].map((m) => m[1]));
    for (const extra of ['NODE_VERSION', 'NEXT_TELEMETRY_DISABLED', 'LOG_LEVEL', 'DB_POOL_MAX', 'NEXT_PUBLIC_DEFAULT_TIMEZONE', 'CAMPUSOS_HOSTPORT']) known.add(extra);
    for (const key of [...web.keys(), ...cron.keys()]) expect(known, key).toContain(key);
  });

  it('boots in production with the blueprint defaults and no optional credentials', () => {
    const source: Record<string, string> = {};
    for (const [key, src] of web) if (src.kind === 'value') source[key] = src.value;
    Object.assign(source, {
      DATABASE_URL: 'postgresql://campusos:x@dpg-internal/campusos',
      AUTH_SECRET: 'a'.repeat(44),
      CRON_SECRET: 'b'.repeat(44),
      RENDER_EXTERNAL_URL: 'https://campusos.onrender.com',
    });
    const result = validateEnv(source);
    expect(result.issues).toEqual([]);
    expect(result.env?.APP_URL).toBe('https://campusos.onrender.com');
    expect(result.env?.NODE_ENV).toBe('production');
    expect(result.env?.DEMO_MODE).toBe(false);
  });

  it('refuses to boot without the database or generated secrets', () => {
    const result = validateEnv({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://campusos.onrender.com' });
    expect(result.ok).toBe(false);
    const text = result.issues.join('\n');
    expect(text).toContain('DATABASE_URL');
    expect(text).toContain('AUTH_SECRET');
  });

  it('prefers an explicit APP_URL over the Render URL', () => {
    expect(publicBaseUrl({ APP_URL: 'https://campus.example.edu', RENDER_EXTERNAL_URL: 'https://x.onrender.com' })).toBe('https://campus.example.edu');
    expect(publicBaseUrl({ RENDER_EXTERNAL_URL: 'https://x.onrender.com' })).toBe('https://x.onrender.com');
    expect(publicBaseUrl({})).toBeUndefined();
  });
});
