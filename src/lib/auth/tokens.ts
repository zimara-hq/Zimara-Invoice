import crypto from "node:crypto";
import { one, q, type Db } from "../db";

export const randomToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function createAuthToken(userId: string, kind: "verify_email" | "reset_password", ttlMinutes: number, db?: Db) {
  const raw = randomToken();
  await q("UPDATE auth_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL", [userId, kind], db);
  await q("INSERT INTO auth_tokens(user_id, kind, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(mins => $4))", [userId, kind, hashToken(raw), ttlMinutes], db);
  return raw;
}

/** Marks the token used and returns its user, or null if invalid/expired/used. */
export async function consumeAuthToken(kind: "verify_email" | "reset_password", raw: string, db?: Db) {
  return one<{ user_id: string }>(
    "UPDATE auth_tokens SET used_at = now() WHERE kind = $1 AND token_hash = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
    [kind, hashToken(raw)],
    db,
  );
}
