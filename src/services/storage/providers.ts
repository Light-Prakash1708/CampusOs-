import 'server-only';
import { mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

/**
 * STORAGE PROVIDERS
 * ---------------------------------------------------------------------------
 *   STORAGE_PROVIDER=local     files under STORAGE_LOCAL_PATH on this server.
 *                              Fine for development and a single persistent VM;
 *                              refused in production unless ALLOW_LOCAL_STORAGE.
 *   STORAGE_PROVIDER=s3        any S3-compatible store: AWS S3, Cloudflare R2,
 *                              MinIO, Backblaze B2 …
 *   STORAGE_PROVIDER=supabase  Supabase Storage through its S3-compatible
 *                              endpoint (https://<ref>.supabase.co/storage/v1/s3).
 *                              Same adapter; no Supabase SDK coupling.
 *   STORAGE_PROVIDER=none      uploads disabled; the UI says so.
 *
 * Objects are private. Reads go through `GET /api/files/:id`, which authorises
 * the caller and then either streams (local) or redirects to a short-lived
 * pre-signed URL (S3). No object is ever publicly listable.
 *
 * `aws4fetch` (≈6 kB, zero dependencies) does SigV4 signing over fetch; it was
 * chosen over the AWS SDK to keep the server bundle small.
 */

export interface StorageProvider {
  readonly name: 'local' | 's3' | 'supabase';
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** Local provider only: read bytes for streaming. */
  read?(key: string): Promise<Buffer>;
  /** Remote providers: a short-lived URL the browser may GET directly. */
  signedUrl?(key: string, opts: { expiresSec: number; downloadName?: string }): Promise<string>;
  delete(key: string): Promise<void>;
}

/** Keys are generated server-side, but guard anyway: no traversal, no absolute paths. */
export function assertSafeKey(key: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9/_.-]{0,400}$/.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local' as const;
  private root: string;
  constructor(root: string) {
    this.root = path.resolve(root);
  }
  private full(key: string) {
    assertSafeKey(key);
    const p = path.resolve(this.root, key);
    if (!p.startsWith(this.root + path.sep)) throw new Error('Storage key escapes root');
    return p;
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.full(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, bytes, { flag: 'wx' }); // never overwrite
  }
  async read(key: string) {
    return readFile(this.full(key));
  }
  async exists(key: string) {
    try {
      await stat(this.full(key));
      return true;
    } catch {
      return false;
    }
  }
  async delete(key: string) {
    await rm(this.full(key), { force: true });
  }
}

export class S3StorageProvider implements StorageProvider {
  private client: AwsClient;
  constructor(
    readonly name: 's3' | 'supabase',
    private endpoint: string,
    private bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
  ) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region });
    this.endpoint = endpoint.replace(/\/+$/, '');
  }

  /** Path-style addressing: works with S3, R2, MinIO and Supabase alike. */
  objectUrl(key: string): string {
    assertSafeKey(key);
    const encoded = key.split('/').map(encodeURIComponent).join('/');
    return `${this.endpoint}/${encodeURIComponent(this.bucket)}/${encoded}`;
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    const res = await this.client.fetch(this.objectUrl(key), {
      method: 'PUT',
      body: new Uint8Array(bytes) as unknown as BodyInit,
      headers: { 'content-type': contentType, 'content-length': String(bytes.length) },
    });
    if (!res.ok) throw new Error(`storage put failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  }

  async signedUrl(key: string, opts: { expiresSec: number; downloadName?: string }) {
    const url = new URL(this.objectUrl(key));
    url.searchParams.set('X-Amz-Expires', String(Math.min(Math.max(opts.expiresSec, 30), 3600)));
    if (opts.downloadName) {
      url.searchParams.set(
        'response-content-disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`,
      );
    }
    const signed = await this.client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } });
    return signed.url;
  }

  async delete(key: string) {
    const res = await this.client.fetch(this.objectUrl(key), { method: 'DELETE' });
    if (!res.ok && res.status !== 404) throw new Error(`storage delete failed: ${res.status}`);
  }
}

let override: StorageProvider | null | undefined;

/** Test seam. */
export function setStorageProvider(next: StorageProvider | null | undefined): void {
  override = next;
}

/** The configured provider, or null when uploads are disabled. */
export function getStorageProvider(): StorageProvider | null {
  if (override !== undefined) return override;
  const e = process.env;
  const mode = e.STORAGE_PROVIDER ?? 'local';
  if (mode === 'none') return null;
  if (mode === 's3' || mode === 'supabase') {
    if (!e.STORAGE_ENDPOINT || !e.STORAGE_BUCKET || !e.STORAGE_ACCESS_KEY || !e.STORAGE_SECRET_KEY) return null;
    return new S3StorageProvider(
      mode,
      e.STORAGE_ENDPOINT,
      e.STORAGE_BUCKET,
      e.STORAGE_ACCESS_KEY,
      e.STORAGE_SECRET_KEY,
      e.STORAGE_REGION ?? 'auto',
    );
  }
  if (e.NODE_ENV === 'production' && e.ALLOW_LOCAL_STORAGE !== 'true') return null;
  return new LocalStorageProvider(e.STORAGE_LOCAL_PATH ?? './.storage');
}

export function maxUploadBytes(): number {
  return Math.round(Number(process.env.STORAGE_MAX_FILE_MB ?? 20) * 1024 * 1024);
}
