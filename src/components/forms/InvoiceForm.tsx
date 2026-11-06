"use client";
import Link from "next/link";
import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CAT_NAMES, computeTotals, EXEMPTIONS, type VatCategory } from "@/lib/zatca/model";
import { validateDraft, type Issue } from "@/lib/zatca/validate";
import { issueAction } from "@/app/app/actions";
import { money } from "@/lib/time";

export interface FormCustomer { id: string; kind: string; name: string; vat: string | null; crn: string | null; street: string | null; building: string | null; district: string | null; city: string | null; postal: string | null }
export interface FormProduct { id: string; name: string; price: number; vat_cat: VatCategory; exemption: string | null; unit: string }
export interface FormOriginal { id: string; number: string; kind: "standard" | "simplified"; customer_id: string | null; gross_total: number; lines: Line[] }
interface Line { name: string; qty: number | string; price: number | string; discount: number | string; cat: VatCategory; reason: string; unit: string }
interface Seller { nameAr: string; vat: string; crn: string; street: string | null; building: string | null; district: string | null; city: string | null; postal: string | null }

const blank = (): Line => ({ name: "", qty: 1, price: "", discount: 0, cat: "S", reason: "", unit: "PCE" });
const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const plus30 = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

export function InvoiceForm({ customers, products, seller, original, noteType, blocked, aiEnabled }: { customers: FormCustomer[]; products: FormProduct[]; seller: Seller; original: FormOriginal | null; noteType: "credit" | "debit" | null; blocked: boolean; aiEnabled: boolean }) {
  const router = useRouter();
  const docType = noteType ?? "invoice";
  const [kind, setKind] = useState<"standard" | "simplified">(original?.kind ?? "standard");
  const [customerId, setCustomerId] = useState(original?.customer_id ?? "");
  const [supplyDate, setSupplyDate] = useState(today());
  const [dueDate, setDueDate] = useState(noteType ? "" : plus30());
  const [payMeans, setPayMeans] = useState("30");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>(original ? original.lines.map((l) => ({ ...blank(), ...l, reason: l.reason ?? "" })) : [blank()]);
  const [confirm, setConfirm] = useState(false);
  const [serverError, setServerError] = useState<{ msg: string; issues?: Issue[] } | null>(null);
  const [pending, start] = useTransition();
  const [aiText, setAiText] = useState("");
  const [aiNote, setAiNote] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const norm = useMemo(() => lines.map((l) => ({ name: l.name, qty: Number(l.qty), price: Number(l.price === "" ? NaN : l.price), discount: Number(l.discount || 0), cat: l.cat, reason: l.cat === "S" ? null : l.reason || null, unit: l.unit })), [lines]);
  const totals = useMemo(() => computeTotals(norm.map((l) => ({ ...l, price: Number.isNaN(l.price) ? 0 : l.price }))), [norm]);
  const customer = customers.find((c) => c.id === customerId) ?? null;
  const issues = useMemo(
    () => validateDraft({ kind, docType, supplyDate, reason, lines: norm }, seller, customer ? { ...customer } : null, original ? { grossTotal: original.gross_total } : null),
    [kind, docType, supplyDate, reason, norm, seller, customer, original],
  );
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");

  const setLine = (i: number, patch: Partial<Line>) => {
    setConfirm(false);
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  };
  const pickName = (i: number, name: string) => {
    const p = products.find((x) => x.name === name);
    setLine(i, p ? { name, price: p.price, cat: p.vat_cat, reason: p.exemption ?? "", unit: p.unit } : { name });
  };

  async function aiFill() {
    if (!aiText.trim()) return;
    setAiBusy(true);
    setAiNote("أجهز المسودة…");
    try {
      const res = await fetch("/api/ai/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: aiText }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "تعذر تجهيز المسودة");
      setKind(data.kind === "simplified" ? "simplified" : "standard");
      if (data.customerId && customers.some((c) => c.id === data.customerId)) setCustomerId(data.customerId);
      if (Array.isArray(data.lines) && data.lines.length) setLines(data.lines.map((l: Partial<Line>) => ({ ...blank(), ...l, reason: l.reason ?? "" })));
      if (data.notes) setNotes(data.notes);
      setAiNote((data.customerName && !data.customerId ? `ما لقيت العميل «${data.customerName}». أضفه من صفحة العملاء. ` : "") + "جهزت المسودة. راجع البنود قبل الإصدار.");
    } catch (e) {
      setAiNote((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  function submit() {
    setServerError(null);
    start(async () => {
      const r = await issueAction({ kind, docType, customerId: customerId || null, refId: original?.id ?? null, supplyDate, dueDate, payMeans, notes, reason, lines: norm });
      if (r.error || !r.id) {
        setConfirm(false);
        setServerError({ msg: r.error ?? "تعذر الإصدار", issues: r.issues });
        return;
      }
      router.push(`/app/invoices/${r.id}?issued=1`);
    });
  }

  const docName = docType === "invoice" ? (kind === "standard" ? "الفاتورة الضريبية" : "الفاتورة المبسطة") : docType === "credit" ? "الإشعار الدائن" : "الإشعار المدين";

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(min(100%, 280px), 340px)", alignItems: "start" }}>
      <div className="stack">
        {!noteType && aiEnabled && (
          <div className="ai">
            <h3>اكتب الفاتورة بكلامك</h3>
            <div className="row" style={{ alignItems: "stretch" }}>
              <textarea className="in" id="ai-text" rows={2} style={{ flex: 1, minWidth: 220 }} value={aiText} onChange={(e) => setAiText(e.target.value)} placeholder="مثال: فاتورة ضريبية لشركة الأفق، 6 ساعات استشارة وتطوير موقع بخصم 1000" aria-label="وصف الفاتورة" />
              <button type="button" className="btn primary" onClick={aiFill} disabled={aiBusy}>{aiBusy ? "أجهز…" : "حوّلها لفاتورة"}</button>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>{aiNote || "المساعد يجهز المسودة فقط، وأنت تراجعها وتصدرها."}</p>
          </div>
        )}
        {noteType && original && (
          <div className="notice info"><b>{noteType === "credit" ? "إشعار دائن" : "إشعار مدين"}</b> على الفاتورة <span className="num">{original.number}</span>. التعديل على الفواتير الصادرة يكون بإشعار، مو بتعديل الفاتورة نفسها.</div>
        )}
        <div className="card stack">
          <div className="row between">
            <h2 style={{ margin: 0 }}>بيانات المستند</h2>
            {!noteType ? (
              <div className="seg" role="group" aria-label="نوع الفاتورة">
                <button type="button" aria-pressed={kind === "standard"} onClick={() => { setKind("standard"); setPayMeans("30"); setConfirm(false); }}>ضريبية B2B</button>
                <button type="button" aria-pressed={kind === "simplified"} onClick={() => { setKind("simplified"); setPayMeans("10"); setConfirm(false); }}>مبسطة B2C</button>
              </div>
            ) : <span className="pill acc">{kind === "standard" ? "ضريبي" : "مبسط"}</span>}
          </div>
          <div className="fgrid">
            <label className="field">
              <span className={kind === "standard" ? "req" : ""}>العميل</span>
              <select className="in" id="f-customer" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setConfirm(false); }} disabled={!!noteType}>
                <option value="">{kind === "standard" ? "اختر العميل" : "عميل نقدي (بدون اسم)"}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="req">تاريخ التوريد</span><input className="in" type="date" id="f-supply" value={supplyDate} onChange={(e) => setSupplyDate(e.target.value)} /></label>
            <label className="field"><span>تاريخ الاستحقاق</span><input className="in" type="date" id="f-due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
            <label className="field">
              <span>طريقة الدفع</span>
              <select className="in" id="f-pay" value={payMeans} onChange={(e) => setPayMeans(e.target.value)}>
                <option value="10">نقداً</option><option value="30">تحويل بنكي</option><option value="48">بطاقة (مدى/ائتمان)</option><option value="1">غير محدد</option>
              </select>
            </label>
          </div>
          {noteType && <label className="field"><span className="req">سبب الإشعار</span><input className="in" id="f-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إرجاع جزء من البضاعة" /></label>}
          <p className="small muted" style={{ margin: 0 }}>تاريخ ووقت الإصدار يتسجلان تلقائياً بتوقيت الرياض لحظة الإصدار، وما يمكن تعديلهما (متطلب الهيئة). {kind === "standard" && !noteType ? <Link href="/app/customers">أضف عميل جديد</Link> : null}</p>
        </div>

        <div className="card stack">
          <div className="row between"><h2 style={{ margin: 0 }}>البنود</h2><button type="button" className="btn" onClick={() => setLines((l) => [...l, blank()])}>+ إضافة بند</button></div>
          <datalist id="plist">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
          <div className="lines">
            {lines.map((l, i) => {
              const lt = totals.lines[i];
              return (
                <div className="line" key={i}>
                  <label className="field full"><span className="req">الصنف أو الخدمة</span><input className="in" id={`l${i}-name`} list="plist" value={l.name} onChange={(e) => pickName(i, e.target.value)} placeholder="اكتب أو اختر من المنتجات" /></label>
                  <label className="field"><span className="req">الكمية</span><input className="in num" id={`l${i}-qty`} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} /></label>
                  <label className="field"><span className="req">سعر الوحدة</span><input className="in num" id={`l${i}-price`} inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="0.00" /></label>
                  <label className="field"><span>خصم</span><input className="in num" id={`l${i}-disc`} inputMode="decimal" value={l.discount} onChange={(e) => setLine(i, { discount: e.target.value })} /></label>
                  <label className="field"><span>الضريبة</span><select className="in" id={`l${i}-cat`} value={l.cat} onChange={(e) => setLine(i, { cat: e.target.value as VatCategory })}>{(["S", "Z", "E", "O"] as const).map((k) => <option key={k} value={k}>{CAT_NAMES[k]}</option>)}</select></label>
                  <button type="button" className="btn ghost" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} disabled={lines.length < 2} aria-label={`حذف البند ${i + 1}`}>حذف</button>
                  {l.cat !== "S" && (
                    <label className="field full"><span className="req">سبب الإعفاء أو النسبة الصفرية</span><select className="in" id={`l${i}-reason`} value={l.reason} onChange={(e) => setLine(i, { reason: e.target.value })}><option value="">اختر السبب</option>{Object.entries(EXEMPTIONS).map(([k, v]) => <option key={k} value={k}>{v} ({k})</option>)}</select></label>
                  )}
                  <div className="lt"><span>الصافي <span className="num">{money(lt?.net)}</span></span><span>الضريبة <span className="num">{money(lt?.vat)}</span></span><span>الإجمالي <span className="num">{money(lt?.gross)}</span></span></div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card"><label className="field"><span>ملاحظات تظهر على الفاتورة</span><textarea className="in" id="f-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label></div>
      </div>

      <div className="stack" style={{ position: "sticky", top: 12 }}>
        <div className="card">
          <h2>الملخص</h2>
          <div className="sum">
            <span>المجموع قبل الضريبة</span><span><span className="num">{money(totals.net)}</span> ر.س</span>
            {totals.subtotals.map((s) => <Fragment key={s.cat + s.reason}><span className="muted">{CAT_NAMES[s.cat]}</span><span className="muted"><span className="num">{money(s.tax)}</span> ر.س</span></Fragment>)}
            <span>ضريبة القيمة المضافة</span><span><span className="num">{money(totals.vat)}</span> ر.س</span>
            <span className="t">الإجمالي</span><span className="t"><span className="num">{money(totals.gross)}</span> ر.س</span>
          </div>
        </div>
        <div className="card">
          <div className="row between"><h2 style={{ margin: 0 }}>مدقق الهيئة</h2>{errors.length ? <span className="pill bad">{errors.length} خطأ</span> : <span className="pill ok">جاهزة</span>}</div>
          {issues.length === 0 ? <p className="small muted">المستند مطابق لكل القواعد المفحوصة.</p> : (
            <ul className="issues">{[...errors, ...warnings].map((x, k) => <li key={k}><span className={`dot ${x.level === "error" ? "e" : "w"}`}>{x.level === "error" ? "!" : "؟"}</span><span>{x.msg} <span className="code">{x.code}</span></span></li>)}</ul>
          )}
        </div>
        {serverError && (
          <div className="notice bad" role="alert">{serverError.msg}{serverError.issues?.length ? <ul className="issues">{serverError.issues.map((x, k) => <li key={k}>{x.msg}</li>)}</ul> : null}</div>
        )}
        {confirm ? (
          <div className="card" style={{ borderColor: "var(--ember)" }}>
            <h3>تأكيد الإصدار</h3>
            <p className="small">بعد الإصدار ما تقدر تعدّل أو تحذف المستند. أي تصحيح يكون بإشعار دائن أو مدين. {kind === "standard" ? "المستند الضريبي ينرسل للاعتماد قبل تسليمه للعميل." : "المستند المبسط ينشارك مع الهيئة خلال 24 ساعة."}</p>
            <div className="row"><button type="button" className="btn primary" onClick={submit} disabled={pending}>{pending ? "جاري الإصدار والتوقيع…" : "تأكيد وإصدار"}</button><button type="button" className="btn" onClick={() => setConfirm(false)} disabled={pending}>رجوع</button></div>
          </div>
        ) : (
          <button type="button" className="btn primary block" onClick={() => setConfirm(true)} disabled={blocked || errors.length > 0}>إصدار {docName}</button>
        )}
      </div>
    </div>
  );
}
