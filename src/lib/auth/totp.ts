import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238 / RFC 4226): 6 digits, 30-second steps, HMAC-SHA1 — what
 * Google Authenticator, Microsoft Authenticator, 1Password and others use.
 * Implemented with node:crypto only.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / TOTP_STEP_SECONDS);
}

export function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * Returns the matched step (±1 step of clock drift) or null. Callers must
 * reject a step ≤ the last one used, so a code works once.
 */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const step = currentStep(now);
  for (const s of [step - 1, step, step + 1]) {
    const expected = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(expected, Buffer.from(digits))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, account: string, issuer = 'CampusOS'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}

/* --------------------------- encryption at rest ---------------------------- */

function key(): Buffer {
  const explicit = process.env.MFA_ENCRYPTION_KEY;
  if (explicit && explicit.length >= 32) return createHash('sha256').update(explicit).digest();
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'campusos-dev-mfa-key').update('campusos:mfa-secret:v1').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decryptSecret(blob: string): string {
  const [v, iv, tag, enc] = blob.split('.');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('bad secret format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(enc, 'base64url')), decipher.final()]).toString('utf8');
}

/* ------------------------------ recovery codes ----------------------------- */

export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = base32Encode(randomBytes(8)).slice(0, 10).toLowerCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
}

/* ------------------------------ login challenge ---------------------------- */

/** A short-lived, signed "password was right, now prove the second factor" ticket. */
export function signChallenge(payload: { uid: string; iid: string; epoch: number }, ttlSeconds = 300): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
  const mac = createHmac('sha256', process.env.AUTH_SECRET ?? 'campusos-dev').update(`mfa-challenge.${body}`).digest('base64url');
  return `${body}.${mac}`;
}

export function readChallenge(token: string): { uid: string; iid: string; epoch: number } | null {
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', process.env.AUTH_SECRET ?? 'campusos-dev').update(`mfa-challenge.${body}`).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { uid: string; iid: string; epoch: number; exp: number };
    if (typeof p.exp !== 'number' || p.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: p.uid, iid: p.iid, epoch: p.epoch };
  } catch {
    return null;
  }
}
