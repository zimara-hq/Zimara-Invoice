import Link from "next/link";
import { q, one } from "@/lib/db";
import { requireCtx, sellerOf } from "@/lib/org";
import { validateSeller } from "@/lib/zatca/validate";
import { PageHead } from "@/components/PageHead";
import { DocTable, type DocRow } from "@/components/DocTable";
import { money } from "@/lib/time";
import { envName } from "@/lib/labels";

export const metadata = { title: "الرئيسية" };

export default async function Dashboard() {
  const { org, user } = await requireCtx();
  const [k] = await q<{ month_sales: number; quarter_vat: number; unpaid: number; pending: number; docs: number }>(
    `SELECT
       COALESCE(sum(CASE WHEN date_trunc('month', issue_date) = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh') THEN CASE WHEN doc_type='credit' THEN -gross_total ELSE gross_total END END),0) AS month_sales,
       COALESCE(sum(CASE WHEN date_trunc('quarter', issue_date) = date_trunc('quarter', now() AT TIME ZONE 'Asia/Riyadh') THEN CASE WHEN doc_type='credit' THEN -vat_total ELSE vat_total END END),0) AS quarter_vat,
       COALESCE(sum(CASE WHEN doc_type='invoice' THEN gross_total
         - COALESCE((SELECT sum(amount) FROM payments p WHERE p.document_id = d.id),0)
         - COALESCE((SELECT sum(c.gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type='credit'),0) END),0) AS unpaid,
       count(*) FILTER (WHERE zatca_status IN ('pending','failed'))::int AS pending,
       count(*)::int AS docs
     FROM documents d WHERE org_id = $1`,
    [org.id],
  );
  const recent = await q<DocRow>("SELECT id, number, kind, doc_type, gross_total, zatca_status, zatca_mode, issued_at, buyer_snapshot->>'name' AS buyer FROM documents WHERE org_id = $1 ORDER BY issued_at DESC LIMIT 8", [org.id]);
  const egs = await one<{ icv: number; cert_expires_at: string; env: string }>("SELECT icv, cert_expires_at, env FROM egs_units WHERE org_id = $1 AND active", [org.id]);
  const top = await q<{ name: string; total: number }>("SELECT COALESCE(buyer_snapshot->>'name','عميل نقدي') AS name, sum(gross_total) AS total FROM documents WHERE org_id = $1 AND doc_type='invoice' GROUP BY 1 ORDER BY 2 DESC LIMIT 5", [org.id]);
  const companyOk = validateSeller(sellerOf(org)).length === 0;
  const steps: [boolean, string, string][] = [
    [!!user.email_verified_at, "تأكيد البريد الإلكتروني", "/app"],
    [companyOk, "بيانات المنشأة والعنوان الوطني", "/app/setup"],
    [!!egs, "الربط مع الهيئة (تسجيل وحدة الإصدار)", "/app/zatca"],
    [k.docs > 0, "إصدار أول فاتورة", "/app/invoices/new"],
  ];
  const daysLeft = Math.max(0, Math.ceil((Date.parse("2027-02-01T00:00:00+03:00") - Date.now()) / 864e5));
  const max = top[0]?.total || 1;
  return (
    <div className="page">
      <PageHead title={`هلا ${user.name.split(" ")[0]}`}><Link className="btn primary" href="/app/invoices/new">فاتورة جديدة</Link></PageHead>
      {steps.some((s) => !s[0]) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h2>جهّز حسابك</h2>
          <ul className="issues">
            {steps.map(([done, label, href]) => (
              <li key={label}><span className={`dot ${done ? "o" : "w"}`}>{done ? "✓" : "•"}</span>{done ? <span>{label}</span> : <Link href={href}>{label}</Link>}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid g4">
        <Kpi label="مبيعات هذا الشهر" value={money(k.month_sales)} hint="شامل الضريبة" />
        <Kpi label="ضريبة المخرجات هذا الربع" value={money(k.quarter_vat)} hint="تقديرية حسب المستندات الصادرة" />
        <Kpi label="مستحقات غير محصلة" value={money(k.unpaid)} hint="الفواتير ناقص المدفوع والإشعارات" />
        <Kpi label="بانتظار الإرسال للهيئة" value={String(k.pending)} hint="المبسطة تُشارك خلال 24 ساعة" />
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.7fr) minmax(min(100%, 280px), 1fr)", marginTop: 14, alignItems: "start" }}>
        <div className="card"><div className="row between"><h2 style={{ margin: 0 }}>آخر المستندات</h2><Link href="/app/invoices">كل المستندات</Link></div><div style={{ marginTop: 12 }}><DocTable rows={recent} compact /></div></div>
        <div className="stack">
          <div className="card"><h3>الموجة 25 من الربط</h3><p className="small muted">آخر موعد للمنشآت اللي تجاوزت إيراداتها 187,500 ر.س: 1 فبراير 2027</p><div className="kpi"><div className="value">{daysLeft} <span className="small" style={{ fontFamily: "var(--body)" }}>يوم</span></div></div></div>
          <div className="card"><h3>حالة الربط</h3>{egs ? <dl className="kv"><dt>البيئة</dt><dd>{envName(egs.env)}</dd><dt>عداد الفواتير</dt><dd className="num">{egs.icv}</dd><dt>صلاحية الشهادة</dt><dd>{new Date(egs.cert_expires_at).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn")}</dd></dl> : <p className="small muted">غير مفعّل. <Link href="/app/zatca">فعّل الربط</Link></p>}</div>
          {top.length > 0 && <div className="card"><h3>أكبر العملاء</h3><div className="bars">{top.map((t) => <div className="bar" key={t.name}><span>{t.name}</span><span className="num">{money(t.total)}</span><div className="track"><div className="fill" style={{ width: `${Math.max(4, (t.total / max) * 100)}%` }} /></div></div>)}</div></div>}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="card kpi"><div className="label">{label}</div><div className="value">{value}</div><div className="hint muted">{hint}</div></div>;
}
