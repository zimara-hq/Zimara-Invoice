"use client";
import { useState } from "react";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { runOnboarding } from "@/app/app/actions";

const MODES: [string, string, string][] = [
  ["local", "محاكاة محلية", "تجربة كاملة داخل زيمارا بدون منصة فاتورة. التواقيع حقيقية والشهادة من جهة محاكاة. للتجربة فقط."],
  ["developer-portal", "بوابة المطورين (ZATCA)", "بيئة اختبار الهيئة المفتوحة. تقبل رمز OTP الثابت 123345 وبيانات اختبار."],
  ["simulation", "بيئة المحاكاة (فاتورة)", "نسخة مطابقة للإنتاج. تحتاج رمز OTP من بوابة فاتورة للمحاكاة بحساب منشأتك."],
  ["production", "الإنتاج (فاتورة)", "الفواتير الحقيقية. تحتاج رمز OTP من بوابة فاتورة الرسمية."],
];

export function OnboardForm({ allowProduction }: { allowProduction: boolean }) {
  const [s, act, actPending] = useFormAction(runOnboarding, {});
  const [mode, setMode] = useState("local");
  return (
    <form action={act} key={s.t ?? "init"} className="card stack">
      <h2 style={{ margin: 0 }}>تسجيل وحدة إصدار (EGS)</h2>
      {s.error && <div className="notice bad" role="alert">{s.error}</div>}
      {s.ok && <div className="notice ok" role="status">{s.ok}</div>}
      <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
        <legend className="small muted" style={{ marginBottom: 8 }}>البيئة</legend>
        {MODES.map(([v, t, d]) => (
          <label key={v} className="check" style={{ opacity: v === "production" && !allowProduction ? 0.55 : 1 }}>
            <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} disabled={v === "production" && !allowProduction} />
            <span><b>{t}</b><br /><span className="small muted">{d}{v === "production" && !allowProduction ? " (تتفعّل بعد اجتياز بيئة المحاكاة)" : ""}</span></span>
          </label>
        ))}
      </fieldset>
      <label className="field" style={{ maxWidth: 220 }}>
        <span className="req">رمز OTP (6 أرقام)</span>
        <input className="in num" id="otp" name="otp" inputMode="numeric" maxLength={6} pattern="\d{6}" required defaultValue={mode === "developer-portal" ? "123345" : ""} key={mode} />
      </label>
      <div><Submit pending={actPending} pendingText="جاري التسجيل وتمرير فحوصات الامتثال…">سجّل وحدة الإصدار</Submit></div>
      {s.checks && s.checks.length > 0 && (
        <ul className="issues">{s.checks.map((c) => <li key={c.name}><span className={`dot ${c.ok ? "o" : "e"}`}>{c.ok ? "✓" : "!"}</span><span>{c.name}{c.detail ? <span className="code"> {c.detail}</span> : null}</span></li>)}</ul>
      )}
    </form>
  );
}
