import 'server-only';

/**
 * Manual-effort baselines used by the productivity ledger.
 *
 * These are ESTIMATES with a stated basis, not measurements. They are defined
 * once here so the number shown in the UI before saving is provably the same
 * number written to `time_saved_events` on save.
 */

/** Minutes a lecturer would plausibly spend writing a lesson plan by hand. */
export function baselineManualMinutes(durationMinutes: number): number {
  // 45 minutes for a standard 55-minute period, scaled linearly, then clamped.
  return Math.min(180, Math.max(20, Math.round((durationMinutes / 55) * 45)));
}
