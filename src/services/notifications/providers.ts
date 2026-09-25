import 'server-only';
import { SignJWT, importPKCS8 } from 'jose';
import { logger } from '@/lib/logger';

/**
 * NOTIFICATION PROVIDERS
 * ---------------------------------------------------------------------------
 * Core notification logic (who gets what, on which channel, when) never talks
 * to a vendor directly. It talks to these four interfaces. Each vendor is an
 * adapter selected by environment variable, so swapping Resend for SES, or
 * MSG91 for another DLT-registered SMS gateway, is one new class.
 *
 *   EMAIL_PROVIDER     console | resend | none
 *   PUSH_PROVIDER      none | console | fcm
 *   SMS_PROVIDER       none | console | msg91
 *   WHATSAPP_PROVIDER  none | console
 *
 * `console` adapters print the message to the server log. They exist for
 * development (so a password-reset link can be clicked locally) and are
 * rejected by env validation in production. `none` means the channel is off
 * and every delivery on it is recorded as SKIPPED with that reason — nothing
 * claims to have been sent when it was not.
 */

export interface SendResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string;
  /** True when the failure is permanent (bad address) and retrying is pointless. */
  permanent?: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Tag for provider analytics, e.g. 'password_reset'. */
  tag?: string;
}

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  url?: string | null;
  priority: 'high' | 'normal';
}

export interface SmsMessage {
  to: string;
  /** Plain text; DLT templates render it via variables. */
  text: string;
  variables?: Record<string, string>;
}

export interface WhatsAppMessage {
  to: string;
  text: string;
}

export interface EmailProvider {
  readonly name: string;
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<SendResult>;
}
export interface PushProvider {
  readonly name: string;
  readonly delivers: boolean;
  send(message: PushMessage): Promise<SendResult>;
}
export interface SmsProvider {
  readonly name: string;
  readonly delivers: boolean;
  send(message: SmsMessage): Promise<SendResult>;
}
export interface WhatsAppProvider {
  readonly name: string;
  readonly delivers: boolean;
  send(message: WhatsAppMessage): Promise<SendResult>;
}

/* ------------------------------- disabled --------------------------------- */

const off = (name: string) => ({
  name,
  delivers: false,
  async send(): Promise<SendResult> {
    return { ok: false, error: 'provider_not_configured', permanent: true };
  },
});

/* -------------------------------- console --------------------------------- */

function consoleProvider<T extends object>(channel: string): { name: string; delivers: boolean; send(m: T): Promise<SendResult> } {
  return {
    name: 'console',
    // Console "delivers" in the sense that a developer can read it. It is
    // refused in production by env validation.
    delivers: true,
    async send(message: T) {
      const id = `console-${Date.now().toString(36)}`;
      logger.info(`notify.${channel}.console`, { id, message: message as unknown as Record<string, unknown> });
      if (channel === 'email') {
        const m = message as unknown as EmailMessage;
        // Print the plain-text body verbatim so links are clickable in a terminal.
        console.log(`\n──── email to ${m.to} ────\nSubject: ${m.subject}\n\n${m.text}\n────────────────\n`);
      }
      return { ok: true, providerMessageId: id };
    },
  };
}

/* -------------------------------- Resend ---------------------------------- */

export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend';
  readonly delivers = true;
  constructor(
    private apiKey: string,
    private from: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
          tags: message.tag ? [{ name: 'category', value: message.tag }] : undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!res.ok) {
        return {
          ok: false,
          error: `resend ${res.status}: ${body.message ?? 'error'}`,
          permanent: res.status === 422 || res.status === 403,
        };
      }
      return { ok: true, providerMessageId: body.id ?? null };
    } catch (error) {
      return { ok: false, error: `resend network: ${(error as Error).message}` };
    }
  }
}

/* ------------------------------ FCM HTTP v1 ------------------------------- */

export class FcmPushProvider implements PushProvider {
  readonly name = 'fcm';
  readonly delivers = true;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private projectId: string,
    private clientEmail: string,
    private privateKeyPem: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const key = await importPKCS8(this.privateKeyPem.replace(/\\n/g, '\n'), 'RS256');
    const now = Math.floor(Date.now() / 1000);
    const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(this.clientEmail)
      .setSubject(this.clientEmail)
      .setAudience('https://oauth2.googleapis.com/token')
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(key);
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !body.access_token) throw new Error(`fcm oauth failed: ${body.error ?? res.status}`);
    this.token = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }

  async send(message: PushMessage): Promise<SendResult> {
    try {
      const bearer = await this.accessToken();
      const res = await this.fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: message.token,
              notification: { title: message.title, body: message.body },
              data: message.url ? { url: message.url } : undefined,
              android: { priority: message.priority === 'high' ? 'HIGH' : 'NORMAL' },
              webpush: message.url ? { fcm_options: { link: message.url } } : undefined,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      const body = (await res.json().catch(() => ({}))) as { name?: string; error?: { status?: string; message?: string } };
      if (!res.ok) {
        const status = body.error?.status ?? String(res.status);
        return {
          ok: false,
          error: `fcm ${status}: ${body.error?.message ?? ''}`.trim(),
          // UNREGISTERED / INVALID_ARGUMENT tokens will never succeed.
          permanent: status === 'NOT_FOUND' || status === 'UNREGISTERED' || status === 'INVALID_ARGUMENT',
        };
      }
      return { ok: true, providerMessageId: body.name ?? null };
    } catch (error) {
      return { ok: false, error: `fcm: ${(error as Error).message}` };
    }
  }
}

/* --------------------------------- MSG91 ---------------------------------- */

/**
 * MSG91 Flow API. Indian SMS must use a DLT-registered template; the template
 * id is configured once and CampusOS passes the message as template variables.
 */
export class Msg91SmsProvider implements SmsProvider {
  readonly name = 'msg91';
  readonly delivers = true;
  constructor(
    private authKey: string,
    private templateId: string | undefined,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: SmsMessage): Promise<SendResult> {
    if (!this.templateId) {
      return { ok: false, error: 'MSG91_TEMPLATE_ID is not configured (DLT template required)', permanent: true };
    }
    const mobile = message.to.replace(/[^\d]/g, '');
    try {
      const res = await this.fetchImpl('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: this.authKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          template_id: this.templateId,
          short_url: '0',
          recipients: [{ mobiles: mobile.length === 10 ? `91${mobile}` : mobile, message: message.text, ...message.variables }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string; request_id?: string };
      if (!res.ok || body.type === 'error') {
        return { ok: false, error: `msg91: ${body.message ?? res.status}` };
      }
      return { ok: true, providerMessageId: body.request_id ?? body.message ?? null };
    } catch (error) {
      return { ok: false, error: `msg91 network: ${(error as Error).message}` };
    }
  }
}

/* -------------------------------- registry -------------------------------- */

export interface ProviderSet {
  email: EmailProvider;
  push: PushProvider;
  sms: SmsProvider;
  whatsapp: WhatsAppProvider;
}

let override: Partial<ProviderSet> | null = null;
let cached: ProviderSet | null = null;

/** Test seam: replace any provider (e.g. with an in-memory recorder). */
export function setProviders(next: Partial<ProviderSet> | null): void {
  override = next;
  cached = null;
}

export function getProviders(): ProviderSet {
  if (cached) return cached;
  const e = process.env;

  const email: EmailProvider =
    e.EMAIL_PROVIDER === 'resend' && e.RESEND_API_KEY
      ? new ResendEmailProvider(e.RESEND_API_KEY, e.EMAIL_FROM ?? 'CampusOS <no-reply@campusos.local>')
      : e.EMAIL_PROVIDER === 'none'
        ? off('none')
        : e.EMAIL_PROVIDER === 'console' || !e.EMAIL_PROVIDER
          ? consoleProvider<EmailMessage>('email')
          : off('none');

  const push: PushProvider =
    e.PUSH_PROVIDER === 'fcm' && e.FCM_PROJECT_ID && e.FCM_CLIENT_EMAIL && e.FCM_PRIVATE_KEY
      ? new FcmPushProvider(e.FCM_PROJECT_ID, e.FCM_CLIENT_EMAIL, e.FCM_PRIVATE_KEY)
      : e.PUSH_PROVIDER === 'console'
        ? consoleProvider<PushMessage>('push')
        : off('none');

  const sms: SmsProvider =
    e.SMS_PROVIDER === 'msg91' && e.MSG91_AUTH_KEY
      ? new Msg91SmsProvider(e.MSG91_AUTH_KEY, e.MSG91_TEMPLATE_ID)
      : e.SMS_PROVIDER === 'console'
        ? consoleProvider<SmsMessage>('sms')
        : off('none');

  // WhatsApp Business requires Meta-approved templates and opt-in; only the
  // console adapter ships in Phase 1. The channel is architected, not live.
  const whatsapp: WhatsAppProvider =
    e.WHATSAPP_PROVIDER === 'console' ? consoleProvider<WhatsAppMessage>('whatsapp') : off('none');

  cached = { email, push, sms, whatsapp, ...(override ?? {}) };
  return cached;
}
