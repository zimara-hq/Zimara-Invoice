"use client";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { changePassword, saveProfile } from "@/app/app/actions";

export function AccountForms({ name, phone, marketing }: { name: string; phone: string; marketing: boolean }) {
  const [p, actP, actPPending] = useFormAction(saveProfile, {});
  const [w, actW, actWPending] = useFormAction(changePassword, {});
  return (
    <>
      <form action={actP} key={p.t ?? "init"} className="card stack">
        <h2 style={{ margin: 0 }}>حسابي</h2>
        {p.error && <div className="notice bad">{p.error}</div>}
        {p.ok && <div className="notice ok">{p.ok}</div>}
        <label className="field"><span>الاسم</span><input className="in" id="me-name" name="name" defaultValue={name} required /></label>
        <label className="field"><span>الجوال</span><input className="in" id="me-phone" name="phone" defaultValue={phone} dir="ltr" /></label>
        <label className="check"><input type="checkbox" id="me-marketing" name="marketing" defaultChecked={marketing} /><span>أبي توصلني أخبار وعروض زيمارا</span></label>
        <div><Submit pending={actPPending}>حفظ</Submit></div>
      </form>
      <form action={actW} key={w.t ?? "init"} className="card stack">
        <h2 style={{ margin: 0 }}>تغيير كلمة المرور</h2>
        {w.error && <div className="notice bad">{w.error}</div>}
        <label className="field"><span>كلمة المرور الحالية</span><input className="in" id="pw-cur" name="current" type="password" autoComplete="current-password" required dir="ltr" /></label>
        <label className="field"><span>كلمة المرور الجديدة</span><input className="in" id="pw-new" name="next" type="password" autoComplete="new-password" minLength={10} required dir="ltr" /><span className="hint">بنسجل خروجك من كل الأجهزة بعد التغيير.</span></label>
        <div><Submit pending={actWPending}>تغيير كلمة المرور</Submit></div>
      </form>
    </>
  );
}
