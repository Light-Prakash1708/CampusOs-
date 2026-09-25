/**
 * DELIVERY PLANNER — pure, deterministic, unit-tested.
 * ---------------------------------------------------------------------------
 * Decides, for one notification and one recipient, which external channels
 * it goes to, when, and — when it does not — why. In-app delivery always
 * happens (the notification row IS the in-app message).
 *
 * Priority policy (disclosed to students in the Privacy Center):
 *
 *   CRITICAL       exam change, class cancellation, venue change, emergency
 *                  → email + push + SMS + WhatsApp (where enabled and opted in)
 *                  → ignores quiet hours
 *   IMPORTANT      deadline, event reminder, attendance risk
 *                  → email + push (+ WhatsApp if opted in); push waits for quiet hours to end
 *   NORMAL         new resource, club update, recommended event
 *                  → push only; waits for quiet hours to end
 *   INFORMATIONAL  gamification, leaderboard, promotional
 *                  → in-app only
 *
 * User preferences (global channel switches, per-category switches) are
 * always respected EXCEPT for `mandatory` notifications — institutional
 * emergency broadcasts — which reach every configured channel. That override
 * exists only for notices an administrator explicitly marks mandatory, and is
 * stated plainly in the Privacy Center.
 *
 * Throttling: non-mandatory external messages are capped per user per channel
 * per hour, so no notice storm can flood a phone.
 */

export type Channel = 'EMAIL' | 'PUSH' | 'SMS' | 'WHATSAPP';
export type Priority = 'CRITICAL' | 'IMPORTANT' | 'NORMAL' | 'INFORMATIONAL';

export const EXTERNAL_CHANNELS: Channel[] = ['EMAIL', 'PUSH', 'SMS', 'WHATSAPP'];

const CHANNELS_BY_PRIORITY: Record<Priority, Channel[]> = {
  CRITICAL: ['EMAIL', 'PUSH', 'SMS', 'WHATSAPP'],
  IMPORTANT: ['EMAIL', 'PUSH', 'WHATSAPP'],
  NORMAL: ['PUSH'],
  INFORMATIONAL: [],
};

/** Per-user, per-channel, per-hour caps for non-mandatory messages. */
export const THROTTLE_PER_HOUR: Record<Channel, number> = {
  EMAIL: 6,
  PUSH: 12,
  SMS: 2,
  WHATSAPP: 3,
};

export interface PlannerInput {
  priority: Priority;
  category: string;
  mandatory: boolean;
  /** Institution-level channel switches (feature flags). */
  tenantChannels: Record<Channel, boolean>;
  /** Whether a real (or console) provider is configured for the channel. */
  providerReady: Record<Channel, boolean>;
  recipient: {
    email: string | null;
    emailVerified: boolean;
    phone: string | null;
    hasPushSubscription: boolean;
  };
  /** Global switches from notification_settings (defaults when absent). */
  settings: {
    emailEnabled: boolean;
    pushEnabled: boolean;
    smsEnabled: boolean;
    quietHoursEnabled: boolean;
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "07:00"
  };
  /** Per-category, per-channel overrides from notification_preferences. */
  categoryPrefs: Partial<Record<Channel, boolean>>;
  /** External messages already sent/queued to this user in the last hour. */
  recentCounts: Partial<Record<Channel, number>>;
  /** Minutes since local midnight in the institution's timezone. */
  localMinutes: number;
  now: Date;
}

export type ChannelDecision =
  | { channel: Channel; action: 'SEND'; runAfter: Date }
  | { channel: Channel; action: 'SKIP'; reason: SkipReason };

export type SkipReason =
  | 'priority_in_app_only'
  | 'tenant_channel_disabled'
  | 'provider_not_configured'
  | 'no_contact'
  | 'email_unverified'
  | 'user_disabled_channel'
  | 'user_disabled_category'
  | 'not_opted_in'
  | 'throttled';

/** Reasons worth persisting as a SKIPPED row (the user's choices, limits, missing contact). */
export const RECORDED_SKIPS: SkipReason[] = [
  'no_contact',
  'email_unverified',
  'user_disabled_channel',
  'user_disabled_category',
  'throttled',
];

export function parseHm(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return 0;
  return Math.min(23, Number(m[1])) * 60 + Math.min(59, Number(m[2]));
}

/** Is `minutes` inside [start, end)? Handles windows that wrap midnight. */
export function inQuietHours(minutes: number, start: string, end: string): boolean {
  const s = parseHm(start);
  const e = parseHm(end);
  if (s === e) return false;
  return s < e ? minutes >= s && minutes < e : minutes >= s || minutes < e;
}

/** Minutes until the quiet window ends. */
export function minutesUntilQuietEnds(minutes: number, end: string): number {
  const e = parseHm(end);
  return (e - minutes + 24 * 60) % (24 * 60);
}

export function planDelivery(input: PlannerInput): ChannelDecision[] {
  const wanted = new Set(CHANNELS_BY_PRIORITY[input.priority]);
  // Mandatory broadcasts go everywhere the institution has switched on.
  if (input.mandatory) EXTERNAL_CHANNELS.forEach((c) => wanted.add(c));

  const quiet =
    input.settings.quietHoursEnabled &&
    inQuietHours(input.localMinutes, input.settings.quietHoursStart, input.settings.quietHoursEnd);

  return EXTERNAL_CHANNELS.map((channel): ChannelDecision => {
    const skip = (reason: SkipReason): ChannelDecision => ({ channel, action: 'SKIP', reason });

    if (!wanted.has(channel)) return skip('priority_in_app_only');
    if (!input.tenantChannels[channel]) return skip('tenant_channel_disabled');
    if (!input.providerReady[channel]) return skip('provider_not_configured');

    // Contact details.
    if (channel === 'EMAIL') {
      if (!input.recipient.email) return skip('no_contact');
      if (!input.recipient.emailVerified) return skip('email_unverified');
    }
    if ((channel === 'SMS' || channel === 'WHATSAPP') && !input.recipient.phone) return skip('no_contact');
    if (channel === 'PUSH' && !input.recipient.hasPushSubscription) return skip('no_contact');

    if (!input.mandatory) {
      // WhatsApp is strictly opt-in (Meta policy and plain courtesy).
      if (channel === 'WHATSAPP' && input.categoryPrefs.WHATSAPP !== true) return skip('not_opted_in');
      const global =
        channel === 'EMAIL'
          ? input.settings.emailEnabled
          : channel === 'PUSH'
            ? input.settings.pushEnabled
            : channel === 'SMS'
              ? input.settings.smsEnabled
              : true;
      if (!global) return skip('user_disabled_channel');
      if (input.categoryPrefs[channel] === false) return skip('user_disabled_category');
      if ((input.recentCounts[channel] ?? 0) >= THROTTLE_PER_HOUR[channel]) return skip('throttled');
    }

    // Timing: CRITICAL and mandatory go now; others respect quiet hours for
    // interruptive channels. Email is not interruptive and always goes now.
    let runAfter = input.now;
    const interruptive = channel !== 'EMAIL';
    if (quiet && interruptive && !input.mandatory && input.priority !== 'CRITICAL') {
      runAfter = new Date(
        input.now.getTime() +
          minutesUntilQuietEnds(input.localMinutes, input.settings.quietHoursEnd) * 60_000,
      );
    }
    return { channel, action: 'SEND', runAfter };
  });
}

/** Minutes since local midnight for `now` in an IANA timezone. */
export function localMinutesIn(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}
