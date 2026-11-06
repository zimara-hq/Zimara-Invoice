import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { one, q } from "@/lib/db";
import { canIssue, requireCtx } from "@/lib/org";
import { balanceOf } from "@/lib/invoicing";
import { verifyStoredDocument } from "@/lib/zatca/sign";
import { CAT_NAMES, EXEMPTIONS, type LineInput, type Totals } from "@/lib/zatca/model";
import { prettyXml } from "@/lib/zatca/xml";
import { PageHead } from "@/components/PageHead";
import { docLabel, ZatcaPill } from "@/components/Badges";
import { PaymentForm, PrintButton } from "@/components/forms/DocActions";
import { retrySubmission } from "../../actions";
import { fmtDate, fmtDateTime, money } from "@/lib/time";
import { PAY_MEANS } from "@/lib/labels";

export const metadata = { title: "مستند" };

interface Doc {
  id: string; number: string; uuid: string; kind: string; doc_type: string; icv: number; pih: string; hash: string; signature: string; qr: string; xml: string;
  issue_date: string; issue_time: string; issued_at: string; supply_date: string | null; due_date: string | null; pay_means: string; notes: string | null; reason: string | null;
  ref_document_id: string | null; seller_snapshot: Record<string, string>; buyer_snapshot: Record<string, string> | null; lines: LineInput[]; totals: Totals;
  gross_total: number; zatca_status: string; zatca_mode: string; zatca_response: Record<string, unknown> | null; zatca_at: string | null; cleared_xml: string | null; certificate: string;
}

const addr = (p: Record<string, string> | null) => (p ? [p.street, p.building, p.district, p.city, p.postal].filter(Boolean).join("، ") : "");

export default async function DocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ issued?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const { issued } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const d = await one<Doc>("SELECT d.*, e.certificate FROM documents d JOIN egs_units e ON e.id = d.egs_id WHERE d.id = $1 AND d.org_id = $2", [id, ctx.org.id]);
  if (!d) notFound();
  const ref = d.ref_document_id ? await one<{ id: string; number: string }>("SELECT id, number FROM documents WHERE id = $1", [d.ref_document_id]) : null;
  const notes = await q<{ id: string; number: string; doc_type: string; gross_total: number }>("SELECT id, number, doc_type, gross_total FROM documents WHERE ref_document_id = $1 ORDER BY issued_at", [d.id]);
  const payments = await q<{ amount: number; method: string; paid_at: string }>("SELECT amount, method, paid_at FROM payments WHERE document_id = $1 ORDER BY paid_at", [d.id]);
  const balance = d.doc_type === "invoice" ? await balanceOf(ctx.org.id, d.id) : 0;
  const check = verifyStoredDocument(d.xml, d.hash, d.signature, d.certificate);
  const qrSvg = await QRCode.toString(d.qr, { type: "svg", errorCorrectionLevel: "M", margin: 1 });
  const title = d.doc_type === "invoice" ? (d.kind === "standard" ? ["فاتورة ضريبية", "Tax Invoice"] : ["فاتورة ضريبية مبسطة", "Simplified Tax Invoice"]) : d.doc_type === "credit" ? ["إشعار دائن", "Credit Note"] : ["إشعار مدين", "Debit Note"];
  const s = d.seller_snapshot;
  const b = d.buyer_snapshot;
  const errs = (d.zatca_response?.validationResults as { errorMessages?: { code: string; message: string }[] } | undefined)?.errorMessages ?? [];

  return (
    <div className="page">
      <PageHead title={d.number}>
        <ZatcaPill status={d.zatca_status} mode={d.zatca_mode} />
        <PrintButton />
        <a className="btn" href={`/app/invoices/${d.id}/xml`}>تنزيل XML</a>
        <Link className="btn" href="/app/invoices">كل المستندات</Link>
      </PageHead>
      {issued && <div className="notice ok no-print" style={{ marginBottom: 14 }}>تم إصدار {docLabel(d.kind, d.doc_type)} وتوقيعها رقمياً.</div>}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(min(100%, 280px), 320px)", alignItems: "start" }}>
        <div className="stack" style={{ minWidth: 0 }}>
          <article className="paper">
            <div className="ph">
              <div><h2>{title[0]}</h2><div className="en">{title[1]}</div></div>
              <div style={{ textAlign: "left" }}>
                <div className="num" style={{ fontSize: "1rem", fontWeight: 600 }}>{d.number}</div>
                <div className="small">تاريخ الإصدار: <span className="num">{d.issue_date} {d.issue_time}</span></div>
                {d.supply_date && <div className="small">تاريخ التوريد: <span className="num">{d.supply_date}</span></div>}
                {d.due_date && <div className="small">تاريخ الاستحقاق: <span className="num">{d.due_date}</span></div>}
                {ref && <div className="small">مرجع الفاتورة: <span className="num">{ref.number}</span></div>}
              </div>
            </div>
            <div className="parties">
              <div className="pbox"><b>البائع · Seller</b>{s.nameAr}<br /><span className="small">الرقم الضريبي: <span className="num">{s.vat}</span></span><br /><span className="small">السجل التجاري: <span className="num">{s.crn}</span></span><br /><span className="small">{addr(s)}</span></div>
              <div className="pbox"><b>المشتري · Buyer</b>{b ? <>{b.name}{b.vat && <><br /><span className="small">الرقم الضريبي: <span className="num">{b.vat}</span></span></>}{b.crn && <><br /><span className="small">السجل التجاري: <span className="num">{b.crn}</span></span></>}<br /><span className="small">{addr(b)}</span></> : "عميل نقدي"}</div>
            </div>
            <div className="tbl">
              <table>
                <thead><tr><th>#</th><th>البيان</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الضريبة</th><th>الإجمالي</th></tr></thead>
                <tbody>
                  {d.lines.map((l, i) => {
                    const lt = d.totals.lines[i];
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td className="wrap">{l.name}{l.cat !== "S" && <><br /><span className="small" style={{ color: "#675a7a" }}>{CAT_NAMES[l.cat]}{l.reason ? ` · ${EXEMPTIONS[l.reason] ?? l.reason}` : ""}</span></>}</td>
                        <td className="num">{l.qty}</td><td className="num">{money(l.price)}</td><td className="num">{money(l.discount)}</td><td className="num">{money(lt.vat)}</td><td className="num">{money(lt.gross)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="totals">
              <div className="qr" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="رمز الاستجابة السريعة" role="img" />
              <div className="sum">
                <span>الإجمالي قبل الضريبة</span><span><span className="num">{money(d.totals.net)}</span> ر.س</span>
                <span>ضريبة القيمة المضافة</span><span><span className="num">{money(d.totals.vat)}</span> ر.س</span>
                <span className="t">الإجمالي المستحق</span><span className="t"><span className="num">{money(d.totals.gross)}</span> ر.س</span>
              </div>
            </div>
            <p className="small">طريقة الدفع: {PAY_MEANS[d.pay_means] ?? d.pay_means}</p>
            {d.reason && <p className="small"><b>سبب الإشعار:</b> {d.reason}</p>}
            {d.notes && <p className="small">{d.notes}</p>}
            <div className="stamp">UUID {d.uuid} · ICV {d.icv}<br />Hash {d.hash}</div>
          </article>
          <details className="card no-print"><summary>ملف XML</summary><pre className="xml" style={{ marginTop: 10 }}>{prettyXml(d.cleared_xml ?? d.xml)}</pre></details>
        </div>

        <div className="stack no-print">
          <div className="card">
            <h3>حالة الهيئة</h3>
            <div className="row"><ZatcaPill status={d.zatca_status} mode={d.zatca_mode} /></div>
            <p className="small muted">
              {d.zatca_mode === "local" ? "محاكاة محلية: المستند موقّع لكن ما انرسل لمنصة فاتورة." : d.zatca_status === "cleared" ? `اعتمدته الهيئة ${fmtDateTime(d.zatca_at)}` : d.zatca_status === "reported" ? `تمت مشاركته ${fmtDateTime(d.zatca_at)}` : d.zatca_status === "rejected" ? "رفضته الهيئة. صحّح الأخطاء وأصدر مستند جديد (ما يمكن تعديل المرفوض)." : "بنعيد المحاولة تلقائياً. المهلة النظامية للمبسطة 24 ساعة."}
            </p>
            {errs.length > 0 && <ul className="issues">{errs.map((e, k) => <li key={k}><span className="dot e">!</span><span className="small">{e.code}: {e.message}</span></li>)}</ul>}
            <ul className="issues">
              <li><span className={`dot ${check.hashOk ? "o" : "e"}`}>{check.hashOk ? "✓" : "!"}</span><span className="small">البصمة مطابقة لمحتوى XML</span></li>
              <li><span className={`dot ${check.signatureOk ? "o" : "e"}`}>{check.signatureOk ? "✓" : "!"}</span><span className="small">التوقيع الرقمي صحيح</span></li>
            </ul>
            {["pending", "failed"].includes(d.zatca_status) && <form action={retrySubmission}><input type="hidden" name="id" value={d.id} /><button className="btn" style={{ marginTop: 8 }}>إعادة الإرسال الحين</button></form>}
          </div>
          {d.doc_type === "invoice" && (
            <div className="card">
              <h3>السداد</h3>
              <p className="small">المتبقي <span className="num">{money(Math.max(0, balance))}</span> ر.س</p>
              {payments.length > 0 && <ul className="small" style={{ paddingInlineStart: 18 }}>{payments.map((p, k) => <li key={k}><span className="num">{money(p.amount)}</span> · {p.method} · {fmtDate(p.paid_at)}</li>)}</ul>}
              {notes.length > 0 && <ul className="small" style={{ paddingInlineStart: 18 }}>{notes.map((n) => <li key={n.id}><Link href={`/app/invoices/${n.id}`} className="num">{n.number}</Link> · {n.doc_type === "credit" ? "−" : "+"}<span className="num">{money(n.gross_total)}</span></li>)}</ul>}
              {canIssue(ctx.role) && balance > 0.004 && <PaymentForm id={d.id} balance={balance} />}
            </div>
          )}
          {d.doc_type === "invoice" && canIssue(ctx.role) && (
            <div className="card stack" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}>تصحيح المستند</h3>
              <Link className="btn" href={`/app/invoices/new?ref=${d.id}&type=credit`}>إصدار إشعار دائن</Link>
              <Link className="btn" href={`/app/invoices/new?ref=${d.id}&type=debit`}>إصدار إشعار مدين</Link>
              <p className="small muted" style={{ margin: 0 }}>المستند الصادر ما يمكن تعديله أو حذفه. هذا متطلب نظامي.</p>
            </div>
          )}
          <div className="card"><h3>بيانات التشفير</h3><dl className="kv"><dt>ICV</dt><dd className="num">{d.icv}</dd><dt>PIH</dt><dd className="code">{d.pih}</dd><dt>Hash</dt><dd className="code">{d.hash}</dd></dl></div>
        </div>
      </div>
    </div>
  );
}
