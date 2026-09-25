import type { PoolConfig } from 'pg';

/**
 * Connection settings shared by the app pool, the migration runner and scripts.
 *
 * TLS is controlled by DATABASE_SSL:
 *   disable  — plain TCP (local development, private networks)
 *   require  — TLS without certificate verification (Supabase/Render poolers
 *              commonly present certificates signed by a private CA)
 *   verify   — TLS with verification; supply DATABASE_CA_CERT (PEM) if the
 *              provider's CA is not in the system store
 *
 * Default: `disable` for loopback hosts, `require` for everything else.
 */
export type SslMode = 'disable' | 'require' | 'verify';

const LOOPBACK = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)(:|\/)/i;

export function resolveSslMode(connectionString: string, explicit = process.env.DATABASE_SSL): SslMode {
  if (explicit === 'disable' || explicit === 'require' || explicit === 'verify') return explicit;
  if (/sslmode=disable/i.test(connectionString)) return 'disable';
  return LOOPBACK.test(connectionString) ? 'disable' : 'require';
}

export function poolConfig(connectionString: string): PoolConfig {
  const mode = resolveSslMode(connectionString);
  const ssl =
    mode === 'disable'
      ? false
      : mode === 'require'
        ? { rejectUnauthorized: false }
        : { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT || undefined };

  return {
    // pg parses sslmode from the URL and would override `ssl`; strip it so the
    // explicit setting above is authoritative.
    connectionString: connectionString.replace(/([?&])sslmode=[^&]*(&|$)/i, '$1').replace(/[?&]$/, ''),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl,
  };
}
