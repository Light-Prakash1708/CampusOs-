import { sql, type SQL } from 'drizzle-orm';

/**
 * A Postgres uuid[] from a JS array, as bound parameters.
 *
 * Interpolating an array directly (`${ids}::uuid[]`) makes Drizzle emit
 * `($1, $2)::uuid[]` — a ROW, which Postgres refuses to cast ("cannot cast type
 * record to uuid[]"), and a single element becomes a malformed array literal.
 * This builds `ARRAY[$1, $2]::uuid[]` (or an empty typed array) instead.
 */
export function uuidArray(ids: readonly string[]): SQL {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  )}]::uuid[]`;
}
