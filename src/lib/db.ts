import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

// numeric -> number, date -> 'YYYY-MM-DD' string (no timezone shifting)
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => Number(v));
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { __zimaraPool?: Pool };

export function pool(): Pool {
  if (!g.__zimaraPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    g.__zimaraPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
  }
  return g.__zimaraPool;
}

export type Db = Pick<PoolClient, "query">;

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = [], db: Db = pool()): Promise<T | null> {
  return (await db.query<T>(sql, params)).rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
