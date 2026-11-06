import Link from "next/link";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { DocTable, type DocRow } from "@/components/DocTable";

export const metadata = { title: "المستندات" };

const TYPES: [string, string][] = [["all", "الكل"], ["standard", "ضريبية"], ["simplified", "مبسطة"], ["notes", "إشعارات"]];
const STATUS: [string, string][] = [["all", "كل الحالات"], ["unpaid", "غير مدفوعة"], ["pending", "بانتظار الهيئة"]];

export default async function Invoices({ searchParams }: { searchParams: Promise<{ type?: string; status?: string; q?: string }> }) {
  const { org } = await requireCtx();
  const sp = await searchParams;
  const type = sp.type ?? "all";
  const status = sp.status ?? "all";
  const term = (sp.q ?? "").trim().slice(0, 80);
  const where = ["d.org_id = $1"];
  const params: unknown[] = [org.id];
  if (type === "standard") where.push("d.doc_type = 'invoice' AND d.kind = 'standard'");
  if (type === "simplified") where.push("d.doc_type = 'invoice' AND d.kind = 'simplified'");
  if (type === "notes") where.push("d.doc_type <> 'invoice'");
  if (status === "pending") where.push("d.zatca_status IN ('pending','failed')");
  if (term) {
    params.push(`%${term}%`);
    const n = params.length;
    where.push(`(d.number ILIKE $${n} OR d.buyer_snapshot->>'name' ILIKE $${n})`);
  }
  let rows = await q<DocRow>(
    `SELECT d.id, d.number, d.kind, d.doc_type, d.gross_total, d.zatca_status, d.zatca_mode, d.issued_at, d.buyer_snapshot->>'name' AS buyer,
       CASE WHEN d.doc_type = 'invoice' THEN d.gross_total - COALESCE((SELECT sum(amount) FROM payments p WHERE p.document_id = d.id),0)
         - COALESCE((SELECT sum(c.gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type='credit'),0)
         + COALESCE((SELECT sum(c.gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type='debit'),0) ELSE 0 END AS balance
     FROM documents d WHERE ${where.join(" AND ")} ORDER BY d.issued_at DESC LIMIT 500`,
    params,
  );
  if (status === "unpaid") rows = rows.filter((r) => r.doc_type === "invoice" && (r.balance ?? 0) > 0.004);
  const link = (k: string, v: string) => {
    const p = new URLSearchParams({ type, status, ...(term ? { q: term } : {}), [k]: v });
    return `/app/invoices?${p}`;
  };
  return (
    <div className="page">
      <PageHead title="المستندات"><Link className="btn primary" href="/app/invoices/new">فاتورة جديدة</Link></PageHead>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div className="row">
          <nav className="seg" aria-label="النوع">{TYPES.map(([v, t]) => <Link key={v} href={link("type", v)} aria-current={type === v ? "true" : undefined}>{t}</Link>)}</nav>
          <nav className="seg" aria-label="الحالة">{STATUS.map(([v, t]) => <Link key={v} href={link("status", v)} aria-current={status === v ? "true" : undefined}>{t}</Link>)}</nav>
        </div>
        <form className="row" action="/app/invoices">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="status" value={status} />
          <input className="in" id="q" name="q" defaultValue={term} placeholder="رقم الفاتورة أو اسم العميل" style={{ width: 240 }} aria-label="بحث" />
          <button className="btn">بحث</button>
        </form>
      </div>
      <DocTable rows={rows} />
    </div>
  );
}
