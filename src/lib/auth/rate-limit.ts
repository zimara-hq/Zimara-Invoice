import { one } from "../db";

/** Fixed-window limiter stored in Postgres, so it holds across server instances. Returns true when allowed. */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await one<{ count: number }>(
    `INSERT INTO rate_limits(key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowSeconds],
  );
  return (row?.count ?? 0) <= limit;
}
