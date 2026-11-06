// Applies db/migrations/*.sql in order, once each, inside a transaction.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const dir = path.join(process.cwd(), "db", "migrations");
const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined });
await client.connect();
try {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("applied", file);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  console.log("migrations up to date");
} finally {
  await client.end();
}
