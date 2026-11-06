import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { allow } from "@/lib/auth/rate-limit";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

const Draft = z.object({
  kind: z.enum(["standard", "simplified"]),
  customerId: z.string().describe("id من قائمة العملاء أو نص فاضي"),
  customerName: z.string().describe("اسم العميل كما كتبه المستخدم إذا ما لقيته في القائمة، أو نص فاضي"),
  lines: z.array(z.object({ name: z.string(), qty: z.number(), price: z.number(), discount: z.number(), cat: z.enum(["S", "Z", "E", "O"]), reason: z.string() })),
  notes: z.string(),
});

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "المساعد الذكي غير مفعّل على هذا الخادم" }, { status: 503 });
  const ctx = await requireCtx();
  if (!(await allow(`ai:${ctx.org.id}`, 60, 3600))) return NextResponse.json({ error: "وصلت حد الاستخدام المؤقت. حاول بعد شوي." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return NextResponse.json({ error: "اكتب وصف الفاتورة" }, { status: 400 });

  const customers = await q<{ id: string; name: string; kind: string }>("SELECT id, name, kind FROM customers WHERE org_id = $1 ORDER BY name LIMIT 300", [ctx.org.id]);
  const products = await q<{ id: string; name: string; price: number; vat_cat: string; exemption: string | null }>("SELECT id, name, price, vat_cat, exemption FROM products WHERE org_id = $1 ORDER BY name LIMIT 300", [ctx.org.id]);

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Draft) },
      system:
        "أنت مساعد فوترة داخل نظام زيمارا للفوترة الإلكترونية السعودية. حوّل طلب المستخدم إلى مسودة فاتورة. " +
        "الفاتورة الضريبية (standard) للمنشآت، والمبسطة (simplified) للأفراد أو البيع النقدي. " +
        "استخدم أسماء وأسعار المنتجات من القائمة إذا تطابقت، وإذا ما حدد المستخدم سعر استخدم سعر المنتج. الأسعار قبل الضريبة. " +
        "الخصم مبلغ بالريال على البند، وصفر إذا ما ذكر. cat هو S للخاضع 15% ما لم يكن المنتج غير ذلك، وreason رمز الإعفاء للمنتج أو نص فاضي. " +
        "لا تخترع عملاء أو منتجات غير مذكورة.",
      messages: [{ role: "user", content: `العملاء: ${JSON.stringify(customers)}\nالمنتجات: ${JSON.stringify(products)}\n\nطلب المستخدم: ${text}` }],
    });
    if (res.stop_reason === "refusal") return NextResponse.json({ error: "ما قدر المساعد يجهز هذا الطلب. اكتبه بطريقة ثانية." }, { status: 422 });
    const out = res.parsed_output;
    if (!out) return NextResponse.json({ error: "ما قدرت أفهم الطلب. جرّب تكتبه بتفاصيل أكثر." }, { status: 422 });
    const validCustomer = customers.some((c) => c.id === out.customerId) ? out.customerId : "";
    await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "ai.draft", detail: `${out.lines.length} بند` });
    return NextResponse.json({ ...out, customerId: validCustomer });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "المساعد مشغول. حاول بعد دقيقة." }, { status: 429 });
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      return NextResponse.json({ error: "المساعد غير متاح الحين." }, { status: 502 });
    }
    throw e;
  }
}
