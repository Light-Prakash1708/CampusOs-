/**
 * BACKFILL VERIFIED XP (safe to re-run)
 * ---------------------------------------------------------------------------
 *   npm run xp:backfill
 *
 * Gamification awards XP as things happen. Event check-ins and certificates
 * recorded BEFORE it was switched on have no XP yet; this awards it from those
 * real records, dated when they happened. Every award uses the same
 * idempotency key as the live path (`event:<id>`, `cert:<id>`), so running it
 * twice — or after the live path already paid — changes nothing.
 * Only students at colleges with gamification on are included.
 */
import 'dotenv/config';
import { eq, isNull, and } from 'drizzle-orm';
import { db, pool } from '../src/lib/db';
import * as t from '../src/lib/db/schema';
import { localDate, XP } from '../src/lib/gamification';
import { awardXp, gamificationOn, refreshProgress } from '../src/services/gamification';

async function main() {
  const insts = await db.select({ id: t.institutions.id, tz: t.institutions.timezone, flags: t.institutions.featureFlags }).from(t.institutions);
  const on = new Map(insts.filter((i) => gamificationOn(i.flags as Record<string, boolean>)).map((i) => [i.id, i.tz]));
  let awarded = 0;
  const touched = new Map<string, string>();

  const checkins = await db
    .select({ userId: t.eventRegistrations.userId, inst: t.users.institutionId, eventId: t.eventCheckins.eventId, title: t.events.title, at: t.eventCheckins.createdAt })
    .from(t.eventCheckins)
    .innerJoin(t.eventRegistrations, eq(t.eventRegistrations.id, t.eventCheckins.registrationId))
    .innerJoin(t.users, eq(t.users.id, t.eventRegistrations.userId))
    .innerJoin(t.events, eq(t.events.id, t.eventCheckins.eventId));
  for (const c of checkins) {
    const tz = on.get(c.inst);
    if (!tz) continue;
    const fresh = await awardXp(db, { userId: c.userId, institutionId: c.inst, amount: XP.EVENT_ATTENDED, source: 'EVENT_ATTENDED', verified: true, reason: `Checked in: ${c.title}`, refId: c.eventId, key: `event:${c.eventId}`, localDate: localDate(c.at, tz) });
    if (fresh) awarded++;
    touched.set(c.userId, c.inst);
  }

  const certs = await db
    .select({ id: t.eventCertificates.id, userId: t.eventCertificates.userId, inst: t.users.institutionId, title: t.events.title, at: t.eventCertificates.issuedAt })
    .from(t.eventCertificates)
    .innerJoin(t.users, eq(t.users.id, t.eventCertificates.userId))
    .innerJoin(t.events, eq(t.events.id, t.eventCertificates.eventId))
    .where(and(isNull(t.eventCertificates.revokedAt)));
  for (const c of certs) {
    const tz = on.get(c.inst);
    if (!tz) continue;
    const fresh = await awardXp(db, { userId: c.userId, institutionId: c.inst, amount: XP.CERTIFICATE_EARNED, source: 'CERTIFICATE_EARNED', verified: true, reason: `Certificate: ${c.title}`, refId: c.id, key: `cert:${c.id}`, localDate: localDate(c.at, tz) });
    if (fresh) awarded++;
    touched.set(c.userId, c.inst);
  }

  for (const [userId, inst] of touched) await refreshProgress(userId, inst, on.get(inst)!);
  console.log(`[xp:backfill] ${awarded} new award(s) for ${touched.size} student(s).`);
}

main()
  .catch((error) => {
    console.error('[xp:backfill] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
