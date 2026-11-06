import { q, type Db } from "./db";

export async function audit(e: { orgId?: string | null; userId?: string | null; action: string; detail?: string; ip?: string | null }, db?: Db) {
  await q("INSERT INTO audit_log(org_id, user_id, action, detail, ip) VALUES ($1,$2,$3,$4,$5)", [e.orgId ?? null, e.userId ?? null, e.action, e.detail ?? null, e.ip ?? null], db);
}
