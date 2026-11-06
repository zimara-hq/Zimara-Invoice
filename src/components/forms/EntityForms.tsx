"use client";
import Link from "next/link";
import { useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { saveCustomer, saveProduct, type ActionState } from "@/app/app/actions";
import { CAT_NAMES, EXEMPTIONS, type VatCategory } from "@/lib/zatca/model";

type Rec = Record<string, string | number | null>;

function Msg({ s }: { s: ActionState }) {
  return s.error ? <div className="notice bad" role="alert">{s.error}</div> : null;
}

export function CustomerForm({ c }: { c: Rec | null }) {
  const [s, act, actPending] = useFormAction(saveCustomer, {});
  const v = (k: string) => (s.values?.[k] ?? c?.[k] ?? "") as string;
  const F: [string, string, boolean?, boolean?][] = [
    ["name", "اسم العميل", true], ["vat", "الرقم الضريبي (15 رقم)", false, true], ["crn", "السجل التجاري", false, true], ["phone", "الجوال", false, true], ["email", "البريد", false, true],
    ["street", "الشارع"], ["building", "رقم المبنى (4 أرقام)", false, true], ["district", "الحي"], ["city", "المدينة"], ["postal", "الرمز البريدي (5 أرقام)", false, true],
  ];
  return (
    <form action={act} key={`${String(c?.id ?? "new")}-${s.t ?? 0}`} className="card stack">
      <h2 style={{ margin: 0 }}>{c ? "تعديل عميل" : "إضافة عميل"}</h2>
      <p className="small muted" style={{ margin: 0 }}>الفاتورة الضريبية (B2B) تحتاج العنوان الوطني كامل للمشتري.</p>
      <Msg s={s} />
      <input type="hidden" name="id" value={v("id")} />
      <label className="field"><span>النوع</span><select className="in" id="c-kind" name="kind" defaultValue={v("kind") || "business"}><option value="business">منشأة</option><option value="individual">فرد</option></select></label>
      {F.map(([k, label, req, ltr]) => <label className="field" key={k}><span className={req ? "req" : ""}>{label}</span><input className="in" id={`c-${k}`} name={k} defaultValue={v(k)} required={req} dir={ltr ? "ltr" : undefined} /></label>)}
      <div className="row"><Submit pending={actPending}>حفظ</Submit>{c && <Link className="btn" href="/app/customers">إلغاء</Link>}</div>
    </form>
  );
}

export function ProductForm({ p }: { p: Rec | null }) {
  const [s, act, actPending] = useFormAction(saveProduct, {});
  const [cat, setCat] = useState<VatCategory>(((p?.vat_cat as VatCategory) ?? "S"));
  return (
    <form action={act} key={`${String(p?.id ?? "new")}-${s.t ?? 0}`} className="card stack">
      <h2 style={{ margin: 0 }}>{p ? "تعديل منتج" : "إضافة منتج أو خدمة"}</h2>
      <Msg s={s} />
      <input type="hidden" name="id" value={(p?.id as string) ?? ""} />
      <label className="field"><span className="req">الاسم</span><input className="in" id="p-name" name="name" defaultValue={s.values?.name ?? (p?.name as string) ?? ""} required /></label>
      <label className="field"><span className="req">السعر قبل الضريبة</span><input className="in num" id="p-price" name="price" inputMode="decimal" defaultValue={s.values?.price ?? p?.price ?? ""} required /></label>
      <label className="field"><span>الضريبة</span><select className="in" id="p-cat" name="vat_cat" value={cat} onChange={(e) => setCat(e.target.value as VatCategory)}>{(["S", "Z", "E", "O"] as const).map((k) => <option key={k} value={k}>{CAT_NAMES[k]}</option>)}</select></label>
      {cat !== "S" && <label className="field"><span className="req">سبب الإعفاء</span><select className="in" id="p-ex" name="exemption" defaultValue={(p?.exemption as string) ?? ""}><option value="">اختر السبب</option>{Object.entries(EXEMPTIONS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>}
      {cat === "S" && <input type="hidden" name="exemption" value="" />}
      <label className="field"><span>الوحدة</span><select className="in" id="p-unit" name="unit" defaultValue={(p?.unit as string) ?? "PCE"}><option value="PCE">قطعة</option><option value="HUR">ساعة</option><option value="DAY">يوم</option><option value="MON">شهر</option><option value="KGM">كيلوجرام</option><option value="LTR">لتر</option></select></label>
      <div className="row"><Submit pending={actPending}>حفظ</Submit>{p && <Link className="btn" href="/app/products">إلغاء</Link>}</div>
    </form>
  );
}
