"use client";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { saveCompany } from "@/app/app/actions";
import type { Org } from "@/lib/org";

const F: [keyof Org, string, boolean, string?][] = [
  ["name_ar", "اسم المنشأة بالعربي (كما في السجل)", true],
  ["name_en", "الاسم بالإنجليزي", false],
  ["vat", "الرقم الضريبي (15 رقم)", true, "3xxxxxxxxxxxxx3"],
  ["crn", "السجل التجاري (10 أرقام)", true],
  ["street", "الشارع", true],
  ["building", "رقم المبنى (4 أرقام)", true],
  ["district", "الحي", true],
  ["city", "المدينة", true],
  ["postal", "الرمز البريدي (5 أرقام)", true],
  ["phone", "الهاتف", false],
  ["email", "بريد الفواتير", false],
];

export function CompanyForm({ org, from }: { org: Org; from?: string }) {
  const [s, act, actPending] = useFormAction(saveCompany, {});
  return (
    <form action={act} key={s.t ?? "init"} className="card stack">
      <div><h2 style={{ marginBottom: 4 }}>بيانات المنشأة</h2><p className="small muted" style={{ margin: 0 }}>تظهر في كل فاتورة وفي شهادة التشفير، ولازم تطابق بياناتك في الهيئة والعنوان الوطني.</p></div>
      {s.error && <div className="notice bad" role="alert">{s.error}</div>}
      {s.ok && <div className="notice ok" role="status">{s.ok}</div>}
      {from && <input type="hidden" name="from" value={from} />}
      <div className="fgrid">
        {F.map(([k, label, req, ph]) => (
          <label className="field" key={k}>
            <span className={req ? "req" : ""}>{label}</span>
            <input className="in" id={`co-${k}`} name={k} defaultValue={s.values?.[k] ?? ((org[k] as string) ?? "")} placeholder={ph} dir={["vat", "crn", "building", "postal", "phone", "email"].includes(k) ? "ltr" : undefined} inputMode={["vat", "crn", "building", "postal"].includes(k) ? "numeric" : undefined} />
          </label>
        ))}
        <label className="field"><span>النشاط</span><input className="in" id="co-industry" name="industry" defaultValue={s.values?.industry ?? org.industry} /></label>
      </div>
      <div><Submit pending={actPending}>{from === "setup" ? "حفظ والانتقال للربط مع الهيئة" : "حفظ البيانات"}</Submit></div>
    </form>
  );
}
