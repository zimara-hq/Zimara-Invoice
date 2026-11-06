"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { one, q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { canIssue, canManage, issueBlocker, requireCtx } from "@/lib/org";
import { issueDocument, IssueError, balanceOf, submitDocument } from "@/lib/invoicing";
import { onboard, type CheckResult, type Mode } from "@/lib/onboarding";
import { clientIp, destroyAllSessions } from "@/lib/auth/session";
import { hashPassword, passwordProblems, verifyPassword } from "@/lib/auth/password";
import type { Issue } from "@/lib/zatca/validate";

export interface ActionState { error?: string; ok?: string; issues?: Issue[]; checks?: CheckResult[]; values?: Record<string, string>; t?: number }

function keep(fd: FormData): Record<string, string> {
  const v: Record<string, string> = {};
  fd.forEach((val, k) => { if (typeof val === "string" && !k.startsWith("$")) v[k] = val; });
  return v;
}

const opt = (max: number) => z.string().trim().max(max).transform((v) => v || null);
const digits = (n: number, msg: string) => z.string().trim().regex(new RegExp(`^\\d{${n}}$`), msg).or(z.literal("")).transform((v) => v || null);

const CompanySchema = z.object({
  name_ar: z.string().trim().min(2, "اسم المنشأة بالعربي مطلوب").max(200),
  name_en: opt(200),
  vat: z.string().trim().regex(/^3\d{13}3$/, "الرقم الضريبي لازم يكون 15 رقم، يبدأ بـ 3 وينتهي بـ 3").or(z.literal("")).transform((v) => v || null),
  crn: digits(10, "رقم السجل التجاري لازم يكون 10 أرقام"),
  street: opt(200), building: digits(4, "رقم المبنى لازم يكون 4 أرقام"), district: opt(120), city: opt(120), postal: digits(5, "الرمز البريدي لازم يكون 5 أرقام"),
  phone: opt(20), email: opt(200), industry: z.string().trim().max(80).default("Technology"),
});

export async function saveCompany(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) return { error: "تعديل بيانات المنشأة لمالك الحساب أو المدير فقط", values: keep(fd), t: Date.now() };
  const p = CompanySchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message, values: keep(fd), t: Date.now() };
  const v = p.data;
  const hasEgs = await one("SELECT 1 FROM egs_units WHERE org_id = $1 AND active", [ctx.org.id]);
  if (hasEgs && (v.vat !== ctx.org.vat || v.crn !== ctx.org.crn)) return { error: "ما تقدر تغيّر الرقم الضريبي أو السجل بعد تسجيل وحدة الإصدار. تواصل معنا.", values: keep(fd), t: Date.now() };
  await q(
    `UPDATE organizations SET name_ar=$1, name_en=$2, vat=$3, crn=$4, street=$5, building=$6, district=$7, city=$8, postal=$9, phone=$10, email=$11, industry=$12, updated_at=now() WHERE id=$13`,
    [v.name_ar, v.name_en, v.vat, v.crn, v.street, v.building, v.district, v.city, v.postal, v.phone, v.email, v.industry || "Technology", ctx.org.id],
  );
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "org.update", ip: await clientIp() });
  revalidatePath("/app", "layout");
  if (fd.get("from") === "setup") redirect("/app/zatca");
  return { ok: "انحفظت بيانات المنشأة" };
}

export async function runOnboarding(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  if (!canManage(ctx.role)) return { error: "تسجيل وحدة الإصدار لمالك الحساب أو المدير فقط" };
  const mode = String(fd.get("mode")) as Mode;
  if (!["local", "developer-portal", "simulation", "production"].includes(mode)) return { error: "اختر البيئة" };
  if (mode === "production" && process.env.ZATCA_ALLOW_PRODUCTION !== "true") return { error: "بيئة الإنتاج تتفعّل بعد اجتياز الاختبار على بيئة المحاكاة وتفعيلها من إعدادات الخادم" };
  const r = await onboard(ctx.org.id, ctx.user.id, mode, String(fd.get("otp") ?? "").trim());
  revalidatePath("/app", "layout");
  return r.ok ? { ok: "تم تسجيل وحدة الإصدار وتفعيل الربط", checks: r.checks } : { error: r.error, checks: r.checks };
}

export async function issueAction(input: unknown): Promise<ActionState & { id?: string }> {
  const ctx = await requireCtx();
  const egs = await one("SELECT 1 FROM egs_units WHERE org_id = $1 AND active", [ctx.org.id]);
  const block = issueBlocker(ctx, !!egs);
  if (block) return { error: block };
  try {
    const r = await issueDocument(ctx.org.id, ctx.user.id, input);
    revalidatePath("/app", "layout");
    return { ok: r.number, id: r.id, issues: r.warnings };
  } catch (e) {
    if (e instanceof IssueError) return { error: e.message, issues: e.issues };
    console.error(e);
    return { error: "صار خطأ وما انحفظ المستند. حاول مرة ثانية." };
  }
}

export async function retrySubmission(fd: FormData) {
  const ctx = await requireCtx();
  const id = String(fd.get("id"));
  if (!(await one("SELECT 1 FROM documents WHERE id = $1 AND org_id = $2", [id, ctx.org.id]))) return;
  await submitDocument(id);
  revalidatePath(`/app/invoices/${id}`);
}

export async function addPayment(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  if (!canIssue(ctx.role)) return { error: "صلاحيتك عرض فقط" };
  const id = String(fd.get("id"));
  const amount = Math.round(Number(fd.get("amount")) * 100) / 100;
  const method = String(fd.get("method") ?? "").slice(0, 40);
  const doc = await one<{ number: string; doc_type: string }>("SELECT number, doc_type FROM documents WHERE id = $1 AND org_id = $2", [id, ctx.org.id]);
  if (!doc || doc.doc_type !== "invoice") return { error: "الفاتورة غير موجودة" };
  const bal = await balanceOf(ctx.org.id, id);
  if (!(amount > 0) || amount > bal + 0.004) return { error: "المبلغ لازم يكون أكبر من صفر وما يتجاوز المتبقي" };
  await q("INSERT INTO payments(org_id, document_id, amount, method, created_by) VALUES ($1,$2,$3,$4,$5)", [ctx.org.id, id, amount, method || "تحويل بنكي", ctx.user.id]);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "payment.add", detail: `${doc.number} · ${amount.toFixed(2)} ر.س` });
  revalidatePath(`/app/invoices/${id}`);
  return { ok: "تم تسجيل الدفعة" };
}

const CustomerSchema = z.object({
  id: z.string().uuid().or(z.literal("")),
  kind: z.enum(["business", "individual"]),
  name: z.string().trim().min(1, "اسم العميل مطلوب").max(200),
  vat: z.string().trim().regex(/^3\d{13}3$/, "الرقم الضريبي لازم 15 رقم يبدأ وينتهي بـ 3").or(z.literal("")).transform((v) => v || null),
  crn: opt(20), phone: opt(20), email: opt(200), street: opt(200),
  building: digits(4, "رقم المبنى لازم يكون 4 أرقام"), district: opt(120), city: opt(120), postal: digits(5, "الرمز البريدي لازم يكون 5 أرقام"),
});

export async function saveCustomer(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  if (!canIssue(ctx.role)) return { error: "صلاحيتك عرض فقط", values: keep(fd), t: Date.now() };
  const p = CustomerSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message, values: keep(fd), t: Date.now() };
  const v = p.data;
  const vals = [v.kind, v.name, v.vat, v.crn, v.phone, v.email, v.street, v.building, v.district, v.city, v.postal];
  if (v.id) await q("UPDATE customers SET kind=$1,name=$2,vat=$3,crn=$4,phone=$5,email=$6,street=$7,building=$8,district=$9,city=$10,postal=$11,updated_at=now() WHERE id=$12 AND org_id=$13", [...vals, v.id, ctx.org.id]);
  else await q("INSERT INTO customers(kind,name,vat,crn,phone,email,street,building,district,city,postal,org_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)", [...vals, ctx.org.id]);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "customer.save", detail: v.name });
  revalidatePath("/app/customers");
  redirect("/app/customers");
}

const ProductSchema = z.object({
  id: z.string().uuid().or(z.literal("")),
  name: z.string().trim().min(1, "الاسم مطلوب").max(300),
  price: z.coerce.number({ message: "السعر لازم يكون رقم" }).min(0, "السعر ما يكون سالب").max(1e12),
  vat_cat: z.enum(["S", "Z", "E", "O"]),
  exemption: z.string().trim().max(40).transform((v) => v || null),
  unit: z.string().trim().max(10).default("PCE"),
}).refine((v) => v.vat_cat === "S" || v.exemption, { message: "اختر سبب الإعفاء للصنف غير الخاضع لـ 15%" });

export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  if (!canIssue(ctx.role)) return { error: "صلاحيتك عرض فقط", values: keep(fd), t: Date.now() };
  const p = ProductSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message, values: keep(fd), t: Date.now() };
  const v = p.data;
  const exemption = v.vat_cat === "S" ? null : v.exemption;
  if (v.id) await q("UPDATE products SET name=$1, price=$2, vat_cat=$3, exemption=$4, unit=$5, updated_at=now() WHERE id=$6 AND org_id=$7", [v.name, v.price, v.vat_cat, exemption, v.unit || "PCE", v.id, ctx.org.id]);
  else await q("INSERT INTO products(name, price, vat_cat, exemption, unit, org_id) VALUES ($1,$2,$3,$4,$5,$6)", [v.name, v.price, v.vat_cat, exemption, v.unit || "PCE", ctx.org.id]);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "product.save", detail: v.name });
  revalidatePath("/app/products");
  redirect("/app/products");
}

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const cur = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  const u = await one<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [ctx.user.id]);
  if (!u || !(await verifyPassword(u.password_hash, cur))) return { error: "كلمة المرور الحالية غير صحيحة" };
  const pe = passwordProblems(next, ctx.user.email);
  if (pe) return { error: pe };
  await q("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [await hashPassword(next), ctx.user.id]);
  await destroyAllSessions(ctx.user.id);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "auth.password_changed" });
  redirect("/login");
}

export async function saveProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await requireCtx();
  const p = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(20), marketing: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "اكتب اسمك" };
  await q("UPDATE users SET name = $1, phone = $2, marketing_opt_in = $3, updated_at = now() WHERE id = $4", [p.data.name, p.data.phone || null, p.data.marketing === "on", ctx.user.id]);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "account.profile_update" });
  revalidatePath("/app", "layout");
  return { ok: "انحفظت بياناتك" };
}

export async function signOutEverywhere() {
  const ctx = await requireCtx();
  await destroyAllSessions(ctx.user.id);
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "auth.logout_all" });
  redirect("/login");
}
