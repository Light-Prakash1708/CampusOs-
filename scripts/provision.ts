/**
 * PROVISION A COLLEGE (production-safe; the seed is for development only)
 * ---------------------------------------------------------------------------
 *   npm run provision -- --slug kbi --name "Kolkata Business Institute" \
 *     --short KBI --city Kolkata --admin-email registrar@kbi.edu.in \
 *     --admin-first Anita --admin-last Roy
 *
 * Creates the institution (if the slug is new) and a SUPER_ADMIN account in
 * the INVITED state, then prints a one-time invitation link (7 days). No
 * password is ever set or printed: the administrator chooses one when they
 * open the link. Re-running for an existing invited admin issues a fresh link
 * and revokes the old one; an already-active account is left untouched.
 *
 * Runs with the `react-server` export condition so the server-only modules it
 * reuses (token issuing) load outside Next.js.
 */
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { and, eq } from 'drizzle-orm';
import { db, pool } from '../src/lib/db';
import * as t from '../src/lib/db/schema';
import { issueToken } from '../src/services/auth/tokens';
import { appUrl } from '../src/lib/env';

async function main() {
  const { values: a } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      short: { type: 'string' },
      city: { type: 'string' },
      state: { type: 'string', default: 'West Bengal' },
      timezone: { type: 'string', default: 'Asia/Kolkata' },
      'admin-email': { type: 'string' },
      'admin-first': { type: 'string' },
      'admin-last': { type: 'string' },
    },
  });
  const missing = ['slug', 'name', 'admin-email', 'admin-first', 'admin-last'].filter((k) => !a[k as keyof typeof a]);
  if (missing.length) throw new Error(`Missing: ${missing.map((m) => `--${m}`).join(', ')}`);
  if (!/^[a-z0-9-]{2,40}$/.test(a.slug!)) throw new Error('--slug must be 2–40 lowercase letters, digits or hyphens.');
  const email = a['admin-email']!.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--admin-email is not a valid address.');

  let [inst] = await db.select().from(t.institutions).where(eq(t.institutions.slug, a.slug!)).limit(1);
  if (!inst) {
    [inst] = await db
      .insert(t.institutions)
      .values({ slug: a.slug!, name: a.name!, shortName: a.short ?? null, city: a.city ?? null, state: a.state ?? null, timezone: a.timezone! })
      .returning();
    console.log(`[provision] created institution ${inst!.name} (${inst!.slug})`);
  } else {
    console.log(`[provision] institution ${inst.slug} already exists — reusing it`);
  }

  let [user] = await db
    .select()
    .from(t.users)
    .where(and(eq(t.users.institutionId, inst!.id), eq(t.users.email, email)))
    .limit(1);
  if (user && user.status === 'ACTIVE') {
    console.log(`[provision] ${email} is already an active account — nothing to do.`);
    return;
  }
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ institutionId: inst!.id, email, firstName: a['admin-first']!, lastName: a['admin-last']!, role: 'SUPER_ADMIN', status: 'INVITED' })
      .returning();
    console.log(`[provision] created SUPER_ADMIN ${email} (invited)`);
  }
  const { raw, expiresAt } = await issueToken({ institutionId: inst!.id, userId: user!.id, purpose: 'INVITE', sentTo: email });
  console.log(`\n  Invitation link (one-time, expires ${expiresAt.toISOString()}):\n  ${appUrl(`/invite?token=${raw}`)}\n`);
  console.log('  Share it privately with the administrator. Nothing else is stored in plain text.');
}

main()
  .catch((e) => {
    console.error('[provision] failed:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
