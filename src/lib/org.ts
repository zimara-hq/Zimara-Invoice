import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { one } from "./db";
import { requireUser, type SessionUser } from "./auth/session";
import { validateSeller } from "./zatca/validate";

export type Role = "owner" | "admin" | "accountant" | "viewer";

export interface Org {
  id: string;
  name_ar: string;
  name_en: string | null;
  vat: string | null;
  crn: string | null;
  street: string | null;
  building: string | null;
  district: string | null;
  city: string | null;
  postal: string | null;
  phone: string | null;
  email: string | null;
  industry: string;
  plan: string;
  plan_status: string;
  trial_ends_at: string;
  current_period_end: string | null;
  zatca_mode: "local" | "developer-portal" | "simulation" | "production";
}

export interface Ctx { user: SessionUser; org: Org; role: Role }

export const requireCtx = cache(async (): Promise<Ctx> => {
  const user = await requireUser();
  const row = await one<Org & { role: Role }>(
    `SELECT o.*, m.role FROM memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = $1 ORDER BY m.created_at LIMIT 1`,
    [user.id],
  );
  if (!row) redirect("/signup");
  const { role, ...org } = row;
  return { user, org, role };
});

export function sellerOf(org: Org) {
  return { nameAr: org.name_ar, vat: org.vat ?? "", crn: org.crn ?? "", street: org.street, building: org.building, district: org.district, city: org.city, postal: org.postal, country: "SA" };
}

export function subscriptionState(org: Org) {
  const now = Date.now();
  if (org.plan === "trial") {
    const left = Math.ceil((Date.parse(org.trial_ends_at) - now) / 864e5);
    return { active: left > 0, trial: true, daysLeft: Math.max(0, left) };
  }
  const active = org.plan_status === "active" && (!org.current_period_end || Date.parse(org.current_period_end) > now);
  return { active, trial: false, daysLeft: null as number | null };
}

/** Why issuing is blocked right now, or null when allowed. */
export function issueBlocker(ctx: Ctx, hasEgs: boolean): string | null {
  if (ctx.role === "viewer") return "صلاحيتك عرض فقط. اطلب من مالك الحساب صلاحية محاسب.";
  if (!ctx.user.email_verified_at) return "أكّد بريدك الإلكتروني أول. أرسلنا لك رابط التأكيد.";
  if (validateSeller(sellerOf(ctx.org)).length) return "كمّل بيانات المنشأة (الرقم الضريبي والسجل والعنوان الوطني).";
  if (!hasEgs) return "فعّل الربط مع الهيئة من صفحة «الربط مع الهيئة».";
  if (!subscriptionState(ctx.org).active) return "انتهت فترة التجربة. اشترك في باقة عشان تكمل الإصدار. فواتيرك السابقة تبقى متاحة للعرض والتنزيل.";
  return null;
}

export const canManage = (role: Role) => role === "owner" || role === "admin";
export const canIssue = (role: Role) => role !== "viewer";
