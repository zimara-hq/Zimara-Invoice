"use client";
import { useState } from "react";
import Link from "next/link";
import { PLANS } from "@/lib/site";

export function Pricing({ cta = "/signup" }: { cta?: string }) {
  const [yearly, setYearly] = useState(false);
  return (
    <div className="stack">
      <div className="row between">
        <p className="muted" style={{ margin: 0 }}>كل الأسعار بالريال وقبل ضريبة القيمة المضافة 15%. تجربة مجانية 14 يوم بدون بطاقة.</p>
        <div className="seg" role="group" aria-label="مدة الاشتراك">
          <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>شهري</button>
          <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>سنوي · شهرين مجاناً</button>
        </div>
      </div>
      <div className="grid g4">
        {PLANS.map((p) => (
          <div key={p.id} className={"card plan" + ("hot" in p && p.hot ? " hot" : "")}>
            <div className="row between"><h3 style={{ margin: 0 }}>{p.name}</h3>{"hot" in p && p.hot ? <span className="pill acc">الأكثر طلباً</span> : null}</div>
            <p className="small muted" style={{ margin: 0 }}>{p.note}</p>
            <div className="price">{(yearly ? p.monthly * 10 : p.monthly).toLocaleString("en-US")}</div>
            <div className="small muted">{yearly ? "ريال / سنة" : "ريال / شهر"}{"from" in p && p.from ? " · يبدأ من" : ""}</div>
            <ul>{p.features.map((f) => <li key={f}>{f}</li>)}</ul>
            <Link className={"btn" + ("hot" in p && p.hot ? " primary" : "")} href={cta} style={{ marginTop: "auto" }}>ابدأ التجربة</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
