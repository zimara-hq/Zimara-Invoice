import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { one, q } from "../db";
import { hashToken, randomToken } from "./tokens";

const PROD = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PROD ? "__Host-zimara_session" : "zimara_session";
const DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  email_verified_at: string | null;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip")) ?? null;
}

export async function createSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  await q("INSERT INTO sessions(id, user_id, expires_at, ip, user_agent) VALUES ($1,$2, now() + make_interval(days => $3), $4, $5)", [
    hashToken(token), userId, DAYS, await clientIp(), (h.get("user-agent") ?? "").slice(0, 300),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", maxAge: DAYS * 86400 });
}

export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await one<SessionUser & { sid: string }>(
    `UPDATE sessions s SET last_seen_at = now() FROM users u
     WHERE s.id = $1 AND s.expires_at > now() AND u.id = s.user_id
     RETURNING s.id AS sid, u.id, u.email, u.name, u.phone, u.email_verified_at`,
    [hashToken(token)],
  );
  return row ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q("DELETE FROM sessions WHERE id = $1", [hashToken(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string) {
  await q("DELETE FROM sessions WHERE user_id = $1", [userId]);
}
