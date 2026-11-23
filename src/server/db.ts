import 'server-only';
import postgres from 'postgres';

/**
 * Direct Postgres access. Two modes:
 *  - asUser(userId, fn): a transaction running as the `authenticated` role with the
 *    verified user id in request.jwt.claims, so every RLS policy applies exactly as it
 *    would for a Supabase client. All app and MCP data access goes through this.
 *  - privileged: used only for things that must happen before a user is known
 *    (resolving MCP bearer tokens, OAuth client/code bookkeeping).
 */
export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const g = globalThis as unknown as { __ffSql?: Sql };

export function sql(): Sql {
  if (!g.__ffSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    g.__ffSql = postgres(url, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      prepare: false, // required for the Supabase transaction pooler (port 6543)
      idle_timeout: 20,
      types: { numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) } },
      transform: { undefined: null },
    });
  }
  return g.__ffSql;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error('Invalid user id');
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  return (await sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
    await tx`set local role authenticated`;
    return fn(tx);
  })) as T;
}

export function privileged(): Sql {
  return sql();
}

export async function closeDb() {
  const s = g.__ffSql;
  g.__ffSql = undefined;
  await s?.end();
}
