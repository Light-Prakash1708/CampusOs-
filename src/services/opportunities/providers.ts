import 'server-only';
import { z } from 'zod';

/**
 * OPPORTUNITY FEED PROVIDERS
 * ---------------------------------------------------------------------------
 * A college may subscribe to a feed of internships and jobs (its placement
 * portal, a regional consortium, a partner job board). Providers only FETCH
 * and VALIDATE; the service imports items as PENDING, and an administrator
 * approves each one before students see it. With no provider configured the
 * import button says so — CampusOS never fabricates listings.
 *
 *   OPPORTUNITY_FEED_PROVIDER = none | json-feed
 *   OPPORTUNITY_FEED_URL      = https URL returning FeedItem[] (or { items: FeedItem[] })
 *   OPPORTUNITY_FEED_TOKEN    = optional bearer token
 *
 * Adding a provider: implement OpportunityFeedProvider, register it in
 * `getFeedProvider`, add its env vars to src/lib/env.ts and docs/CAREER.md.
 */

export const FeedItem = z.object({
  id: z.string().trim().min(1).max(200),
  kind: z.enum(['INTERNSHIP', 'JOB', 'HACKATHON', 'COMPETITION', 'SCHOLARSHIP', 'FELLOWSHIP']),
  title: z.string().trim().min(2).max(200),
  organization: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  location: z.string().max(200).nullish(),
  workMode: z.enum(['ONSITE', 'REMOTE', 'HYBRID']).default('ONSITE'),
  compensation: z.string().max(200).nullish(),
  applyUrl: z.string().url().refine((u) => /^https?:\/\//.test(u), 'http(s) only').nullish(),
  deadline: z.coerce.date().nullish(),
  eligibility: z.string().max(2000).nullish(),
  skills: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
});
export type FeedItem = z.infer<typeof FeedItem>;

export interface FeedResult {
  items: FeedItem[];
  /** Items that failed validation (index and first problem), for the admin. */
  rejected: { index: number; problem: string }[];
}

export interface OpportunityFeedProvider {
  readonly name: string;
  fetch(): Promise<FeedResult>;
}

const MAX_BYTES = 2_000_000;
const MAX_ITEMS = 500;

export class JsonFeedProvider implements OpportunityFeedProvider {
  readonly name = 'json-feed';
  constructor(
    private readonly url: string,
    private readonly token?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetch(): Promise<FeedResult> {
    const res = await this.fetchImpl(this.url, {
      headers: { Accept: 'application/json', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`The feed answered HTTP ${res.status}.`);
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new Error('The feed is larger than 2 MB.');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('The feed is not valid JSON.');
    }
    const list = Array.isArray(raw) ? raw : Array.isArray((raw as { items?: unknown })?.items) ? (raw as { items: unknown[] }).items : null;
    if (!list) throw new Error('The feed must be a JSON array, or an object with an "items" array.');
    const items: FeedItem[] = [];
    const rejected: FeedResult['rejected'] = [];
    list.slice(0, MAX_ITEMS).forEach((entry, index) => {
      const parsed = FeedItem.safeParse(entry);
      if (parsed.success) items.push(parsed.data);
      else rejected.push({ index, problem: parsed.error.issues[0]?.message ?? 'invalid' });
    });
    return { items, rejected };
  }
}

/** The configured provider, or null when none is set up. */
export function getFeedProvider(): OpportunityFeedProvider | null {
  const provider = process.env.OPPORTUNITY_FEED_PROVIDER ?? 'none';
  if (provider === 'json-feed' && process.env.OPPORTUNITY_FEED_URL) {
    return new JsonFeedProvider(process.env.OPPORTUNITY_FEED_URL, process.env.OPPORTUNITY_FEED_TOKEN || undefined);
  }
  return null;
}
