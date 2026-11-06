"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { one, q, tx } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import { clientIp, createSession, currentUser, destroyAllSessions, destroySession } from "@/lib/auth/session";
import { consumeAuthToken, createAuthToken } from "@/lib/auth/tokens";
import { allow } from "@/lib/auth/rate-limit";
import { appUrl, sendMail } from "@/lib/mail";
import { SITE } from "@/lib/site";

export interface FormState { error?: string; ok?: string; values?: Record<string, string>; t?: number }

function keep(fd: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  fd.forEach((val, k) => { if (typeof val === "string" && !k.startsWith("$") && !/password/i.test(k)) v[k] = val; });
  return v;
}

const email = z.string().trim().toLowerCase().email("البريد الإلكتروني غير صحيح").max(200);

async function sendVerification(userId: string, to: string) {
  const token = await createAuthToken(userId, "verify_email", 60 * 48);
  await sendMail(to, "أكّد بريدك في زيمارا", `أهلاً بك في زيمارا.\n\nأكّد بريدك من هذا الرابط (صالح 48 ساعة):\n${appUrl("/verify?token=" + token)}\n\nإذا ما سجلت في زيمارا تجاهل الرسالة.`);
}

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const ip = (await clientIp()) ?? "unknown";
  if (!(await allow(`signup:${ip}`, 5, 3600))) return { error: "محاولات كثيرة. حاول بعد ساعة.", values: keep(fd), t: Date.now() };
  const parsed = z.object({
    name: z.string().trim().min(2, "اكتب اسمك").max(120),
    email,
    phone: z.string().trim().max(20).regex(/^(\+?966|0)?5\d{8}$/, "رقم الجوال غير صحيح").or(z.literal("")),
    company: z.string().trim().min(2, "اكتب اسم المنشأة").max(200),
    password: z.string(),
    terms: z.literal("on", { message: "لازم توافق على الشروط وسياسة الخصوصية" }),
    marketing: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message, values: keep(fd), t: Date.now() };
  const v = parsed.data;
  const pwErr = passwordProblems(v.password, v.email);
  if (pwErr) return { error: pwErr, values: keep(fd), t: Date.now() };
  if (await one("SELECT 1 FROM users WHERE email = $1", [v.email])) return { error: "هذا البريد مسجل. سجّل دخول أو استرجع كلمة المرور.", values: keep(fd), t: Date.now() };

  const hash = await hashPassword(v.password);
  const userId = await tx(async (c) => {
    const u = await one<{ id: string }>(
      "INSERT INTO users(email, name, phone, password_hash, terms_version, terms_accepted_at, marketing_opt_in) VALUES ($1,$2,$3,$4,$5,now(),$6) RETURNING id",
      [v.email, v.name, v.phone || null, hash, SITE.termsVersion, v.marketing === "on"], c,
    );
    const o = await one<{ id: string }>("INSERT INTO organizations(name_ar, trial_ends_at, email) VALUES ($1, now() + interval '14 days', $2) RETURNING id", [v.company, v.email], c);
    await q("INSERT INTO memberships(org_id, user_id, role) VALUES ($1,$2,'owner')", [o!.id, u!.id], c);
    await audit({ orgId: o!.id, userId: u!.id, action: "account.signup", detail: `موافقة على الشروط ${SITE.termsVersion}`, ip }, c);
    return u!.id;
  });
  await sendVerification(userId, v.email);
  await createSession(userId);
  redirect("/app/setup");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const ip = (await clientIp()) ?? "unknown";
  const parsed = z.object({ email, password: z.string().min(1).max(200) }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "اكتب البريد وكلمة المرور", values: keep(fd), t: Date.now() };
  const { email: em, password } = parsed.data;
  if (!(await allow(`login:ip:${ip}`, 30, 900)) || !(await allow(`login:email:${em}`, 10, 900))) return { error: "محاولات كثيرة. انتظر 15 دقيقة وحاول مرة ثانية.", values: keep(fd), t: Date.now() };
  const u = await one<{ id: string; password_hash: string; locked_until: string | null }>("SELECT id, password_hash, locked_until FROM users WHERE email = $1", [em]);
  if (u?.locked_until && Date.parse(u.locked_until) > Date.now()) return { error: "الحساب مقفل مؤقتاً بسبب محاولات خاطئة. حاول بعد 15 دقيقة أو استرجع كلمة المرور.", values: keep(fd), t: Date.now() };
  const ok = u ? await verifyPassword(u.password_hash, password) : await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$YWJj", password);
  if (!u || !ok) {
    if (u) await q("UPDATE users SET failed_logins = failed_logins + 1, locked_until = CASE WHEN failed_logins + 1 >= 8 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $1", [u.id]);
    await audit({ userId: u?.id ?? null, action: "auth.login_failed", detail: em, ip });
    return { error: "البريد أو كلمة المرور غير صحيحة", values: keep(fd), t: Date.now() };
  }
  await q("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [u.id]);
  await createSession(u.id);
  await audit({ userId: u.id, action: "auth.login", ip });
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/app") ? next : "/app");
}

export async function logout() {
  const u = await currentUser();
  await destroySession();
  if (u) await audit({ userId: u.id, action: "auth.logout" });
  redirect("/login");
}

export async function forgot(_: FormState, fd: FormData): Promise<FormState> {
  const ip = (await clientIp()) ?? "unknown";
  const parsed = email.safeParse(fd.get("email"));
  if (!parsed.success) return { error: "البريد الإلكتروني غير صحيح" };
  if (!(await allow(`forgot:${ip}`, 5, 3600)) || !(await allow(`forgot:${parsed.data}`, 3, 3600))) return { error: "محاولات كثيرة. حاول بعد ساعة." };
  const u = await one<{ id: string }>("SELECT id FROM users WHERE email = $1", [parsed.data]);
  if (u) {
    const token = await createAuthToken(u.id, "reset_password", 30);
    await sendMail(parsed.data, "استرجاع كلمة المرور في زيمارا", `طلبت استرجاع كلمة المرور.\n\nاضبط كلمة مرور جديدة من هذا الرابط (صالح 30 دقيقة):\n${appUrl("/reset?token=" + token)}\n\nإذا ما طلبت هذا تجاهل الرسالة، وكلمة مرورك ما تتغير.`);
    await audit({ userId: u.id, action: "auth.reset_requested", ip });
  }
  return { ok: "إذا كان البريد مسجل عندنا، بيوصلك رابط الاسترجاع خلال دقائق." };
}

export async function reset(_: FormState, fd: FormData): Promise<FormState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const row = await one<{ email: string }>("SELECT u.email FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE t.kind = 'reset_password' AND t.token_hash = encode(digest($1, 'sha256'), 'hex') AND t.used_at IS NULL AND t.expires_at > now()", [token]);
  if (!row) return { error: "الرابط منتهي أو مستخدم. اطلب رابط جديد." };
  const pwErr = passwordProblems(password, row.email);
  if (pwErr) return { error: pwErr };
  const used = await consumeAuthToken("reset_password", token);
  if (!used) return { error: "الرابط منتهي أو مستخدم. اطلب رابط جديد." };
  await q("UPDATE users SET password_hash = $1, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $2", [await hashPassword(password), used.user_id]);
  await destroyAllSessions(used.user_id);
  await audit({ userId: used.user_id, action: "auth.password_reset" });
  return { ok: "تم تغيير كلمة المرور. سجّل دخولك بكلمة المرور الجديدة." };
}

export async function resendVerification(): Promise<FormState> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (u.email_verified_at) return { ok: "بريدك مؤكد." };
  if (!(await allow(`verify:${u.id}`, 3, 3600))) return { error: "أرسلنا لك أكثر من رابط. انتظر شوي." };
  await sendVerification(u.id, u.email);
  return { ok: "أرسلنا رابط التأكيد لبريدك." };
}
