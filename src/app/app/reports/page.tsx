import Link from "next/link";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { money } from "@/lib/time";

export const metadata = { title: "التقارير والضريبة" };

const PERIODS: [string, string, string][] = [["month", "هذا الشهر", "month"], ["quarter", "هذا الربع", "quarter"], ["year", "هذه السنة", "year"]];

export default async function Reports({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { org } = await requireCtx();
  const sp = await searchParams;
  const period = PERIODS.find((p) => p[0] === sp.period)?.[2] ?? "quarter";
  const rows = await q<{ cat: string; doc_type: string; taxable: number; tax: number }>(
    `SELECT s->>'cat' AS cat, d.doc_type, sum((s->>'taxable')::numeric) AS taxable, sum((s->>'tax')::numeric) AS tax
     FROM documents d, jsonb_array_elements(d.totals->'subtotals') s
     WHERE d.org_id = $1 AND d.zatca_status IN ('cleared','reported')
       AND date_trunc('${period}', d.issue_date) = date_trunc('${period}', (now() AT TIME ZONE 'Asia/Riyadh')::date)
     GROUP BY 1, 2`,
    [org.id],
  );
  const sum = (cat: string, types: string[], f: "taxable" | "tax") => rows.filter((r) => r.cat === cat && types.includes(r.doc_type)).reduce((a, r) => a + Number(r[f]), 0);
  const S = { base: sum("S", ["invoice", "debit"], "taxable"), vat: sum("S", ["invoice", "debit"], "tax") };
  const adj = { base: -["S", "Z", "E", "O"].reduce((a, c) => a + sum(c, ["credit"], "taxable"), 0), vat: -sum("S", ["credit"], "tax") };
  const aging = await q<{ bucket: number; amount: number }>(
    `SELECT CASE WHEN age <= 0 THEN 0 WHEN age <= 30 THEN 1 WHEN age <= 60 THEN 2 ELSE 3 END AS bucket, sum(balance) AS amount FROM (
       SELECT (now() AT TIME ZONE 'Asia/Riyadh')::date - COALESCE(due_date, issue_date) AS age,
         gross_total - COALESCE((SELECT sum(amount) FROM payments p WHERE p.document_id = d.id),0)
         - COALESCE((SELECT sum(c.gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type='credit'),0) AS balance
       FROM documents d WHERE d.org_id = $1 AND d.doc_type = 'invoice') x WHERE balance > 0.004 GROUP BY 1`,
    [org.id],
  );
  const buckets = [0, 1, 2, 3].map((b) => Number(aging.find((a) => a.bucket === b)?.amount ?? 0));
  const labels = ["لم تستحق", "متأخرة 1–30 يوم", "متأخرة 31–60 يوم", "متأخرة أكثر من 60 يوم"];
  const max = Math.max(1, ...buckets);
  return (
    <div className="page">
      <PageHead title="التقارير والإقرار الضريبي">
        <nav className="seg" aria-label="الفترة">{PERIODS.map(([v, t]) => <Link key={v} href={`/app/reports?period=${v}`} aria-current={period === v ? "true" : undefined}>{t}</Link>)}</nav>
        <a className="btn" href={`/api/export/sales?period=${period}`}>تصدير CSV</a>
      </PageHead>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card">
          <h2>مسودة إقرار ضريبة القيمة المضافة (المبيعات)</h2>
          <div className="tbl">
            <table>
              <thead><tr><th>البند</th><th>المبلغ</th><th>الضريبة</th></tr></thead>
              <tbody>
                <tr><td>المبيعات الخاضعة للنسبة الأساسية 15%</td><td className="num">{money(S.base)}</td><td className="num">{money(S.vat)}</td></tr>
                <tr><td>المبيعات الخاضعة للنسبة الصفرية</td><td className="num">{money(sum("Z", ["invoice", "debit"], "taxable"))}</td><td className="num">0.00</td></tr>
                <tr><td>المبيعات المعفاة</td><td className="num">{money(sum("E", ["invoice", "debit"], "taxable"))}</td><td className="num">0.00</td></tr>
                <tr><td>خارج نطاق الضريبة</td><td className="num">{money(sum("O", ["invoice", "debit"], "taxable"))}</td><td className="num">0.00</td></tr>
                <tr><td>تعديلات (إشعارات دائنة)</td><td className="num">{money(adj.base)}</td><td className="num">{money(adj.vat)}</td></tr>
                <tr><td><b>إجمالي ضريبة المخرجات</b></td><td></td><td className="num"><b>{money(S.vat + adj.vat)}</b></td></tr>
              </tbody>
            </table>
          </div>
          <p className="small muted">مبني على المستندات المعتمدة أو المشاركة مع الهيئة في الفترة. المشتريات وضريبة المدخلات تنضاف مع وحدة المشتريات. راجع الأرقام مع محاسبك قبل تقديم الإقرار.</p>
        </div>
        <div className="card">
          <h2>أعمار الذمم المدينة</h2>
          <div className="bars">{buckets.map((b, i) => <div className="bar" key={i}><span>{labels[i]}</span><span className="num">{money(b)}</span><div className="track"><div className="fill" style={{ width: `${b ? Math.max(3, (b / max) * 100) : 0}%` }} /></div></div>)}</div>
        </div>
      </div>
    </div>
  );
}
