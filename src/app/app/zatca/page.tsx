import { q } from "@/lib/db";
import { requireCtx, sellerOf } from "@/lib/org";
import { validateSeller } from "@/lib/zatca/validate";
import { PageHead } from "@/components/PageHead";
import { OnboardForm } from "@/components/forms/OnboardForm";
import { envName } from "@/lib/labels";
import { fmtDateTime, fmtDate } from "@/lib/time";
import Link from "next/link";

export const metadata = { title: "الربط مع الهيئة" };

export default async function Zatca() {
  const { org } = await requireCtx();
  const units = await q<{ id: string; env: string; serial: string; icv: number; active: boolean; created_at: string; cert_expires_at: string; compliance_report: { name: string; ok: boolean }[] | null }>(
    "SELECT id, env, serial, icv, active, created_at, cert_expires_at, compliance_report FROM egs_units WHERE org_id = $1 ORDER BY created_at DESC",
    [org.id],
  );
  const active = units.find((u) => u.active);
  const sellerIssues = validateSeller(sellerOf(org));
  return (
    <div className="page">
      <PageHead title="الربط مع منصة فاتورة" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          {active ? (
            <div className="card">
              <div className="notice ok"><b>الربط مفعّل</b> على {envName(active.env)}.</div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>الرقم التسلسلي</dt><dd className="code">{active.serial}</dd>
                <dt>تاريخ التسجيل</dt><dd>{fmtDateTime(active.created_at)}</dd>
                <dt>صلاحية الشهادة</dt><dd>{fmtDate(active.cert_expires_at)}</dd>
                <dt>عداد الفواتير (ICV)</dt><dd className="num">{active.icv}</dd>
                <dt>المفتاح الخاص</dt><dd>مشفّر ومحفوظ في الخادم، ولا يُعرض</dd>
              </dl>
              {active.compliance_report && <><h3 style={{ marginTop: 14 }}>فحوصات الامتثال</h3><ul className="issues">{active.compliance_report.map((c) => <li key={c.name}><span className={`dot ${c.ok ? "o" : "e"}`}>{c.ok ? "✓" : "!"}</span>{c.name}</li>)}</ul></>}
            </div>
          ) : (
            <div className="notice warn">الربط غير مفعّل. ما تقدر تصدر فواتير قبل تسجيل وحدة الإصدار.</div>
          )}
          {sellerIssues.length > 0 ? (
            <div className="notice bad">كمّل بيانات المنشأة أول ({sellerIssues.length} ملاحظة). <Link href="/app/setup">بيانات المنشأة</Link></div>
          ) : (
            <OnboardForm allowProduction={process.env.ZATCA_ALLOW_PRODUCTION === "true"} />
          )}
        </div>
        <div className="stack">
          <div className="card">
            <h2>كيف تجيب رمز OTP</h2>
            <ol className="small" style={{ paddingInlineStart: 20, margin: 0 }}>
              <li>ادخل على بوابة فاتورة <span className="num">fatoora.zatca.gov.sa</span> بحساب منشأتك في الهيئة.</li>
              <li>اختر «تسجيل وحدة حل جديدة» (Onboard new solution unit).</li>
              <li>حدد عدد الرموز وولّد رمز OTP. الرمز صالح ساعة واحدة.</li>
              <li>ارجع هنا، اختر البيئة، والصق الرمز.</li>
            </ol>
            <p className="small muted">زيمارا يولّد المفتاح الخاص داخل الخادم (ما يطلع أبداً)، ويرسل طلب الشهادة، ويمرر فحوصات الامتثال على 6 أنواع مستندات، ثم يطلب شهادة الإنتاج.</p>
          </div>
          {units.length > 1 && (
            <div className="card"><h3>الوحدات السابقة</h3><ul className="small" style={{ paddingInlineStart: 18, margin: 0 }}>{units.filter((u) => !u.active).map((u) => <li key={u.id}>{envName(u.env)} · {fmtDate(u.created_at)} · ICV <span className="num">{u.icv}</span></li>)}</ul></div>
          )}
        </div>
      </div>
    </div>
  );
}
