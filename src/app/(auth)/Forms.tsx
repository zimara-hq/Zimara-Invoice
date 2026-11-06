"use client";
import Link from "next/link";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { forgot, login, reset, signup, type FormState } from "./actions";

const init: FormState = {};
function Msg({ s }: { s: FormState }) {
  if (s.error) return <div className="notice bad" role="alert">{s.error}</div>;
  if (s.ok) return <div className="notice ok" role="status">{s.ok}</div>;
  return null;
}

export function LoginForm({ next }: { next?: string }) {
  const [s, act, actPending] = useFormAction(login, init);
  return (
    <form action={act} key={s.t ?? "init"}>
      <h1>تسجيل الدخول</h1>
      <Msg s={s} />
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="field"><span>البريد الإلكتروني</span><input className="in" id="email" name="email" type="email" autoComplete="email" required dir="ltr" defaultValue={s.values?.email} /></label>
      <label className="field"><span>كلمة المرور</span><input className="in" id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" /></label>
      <Submit pending={actPending} className="btn primary block" pendingText="جاري الدخول…">دخول</Submit>
      <div className="row between small"><Link href="/forgot">نسيت كلمة المرور؟</Link><Link href="/signup">ما عندك حساب؟ سجّل مجاناً</Link></div>
    </form>
  );
}

export function SignupForm() {
  const [s, act, actPending] = useFormAction(signup, init);
  return (
    <form action={act} key={s.t ?? "init"}>
      <h1>ابدأ تجربتك المجانية</h1>
      <p className="muted small" style={{ margin: 0 }}>14 يوم مجاناً، بدون بطاقة ائتمانية.</p>
      <Msg s={s} />
      <label className="field"><span className="req">اسمك</span><input className="in" id="name" name="name" autoComplete="name" required defaultValue={s.values?.name} /></label>
      <label className="field"><span className="req">اسم المنشأة</span><input className="in" id="company" name="company" autoComplete="organization" required defaultValue={s.values?.company} /></label>
      <label className="field"><span className="req">البريد الإلكتروني</span><input className="in" id="email" name="email" type="email" autoComplete="email" required dir="ltr" defaultValue={s.values?.email} /></label>
      <label className="field"><span>الجوال</span><input className="in" id="phone" name="phone" type="tel" autoComplete="tel" placeholder="05xxxxxxxx" dir="ltr" defaultValue={s.values?.phone} /></label>
      <label className="field"><span className="req">كلمة المرور</span><input className="in" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required dir="ltr" /><span className="hint">10 أحرف على الأقل، فيها حروف وأرقام</span></label>
      <label className="check"><input type="checkbox" id="terms" name="terms" required defaultChecked={s.values?.terms === "on"} /><span>أوافق على <Link href="/legal/terms" target="_blank">الشروط والأحكام</Link> و<Link href="/legal/privacy" target="_blank">سياسة الخصوصية</Link>، وعلى معالجة بياناتي لتقديم الخدمة.</span></label>
      <label className="check"><input type="checkbox" id="marketing" name="marketing" defaultChecked={s.values?.marketing === "on"} /><span>أبي توصلني أخبار زيمارا وعروضه (اختياري)</span></label>
      <Submit pending={actPending} className="btn primary block" pendingText="جاري إنشاء الحساب…">إنشاء الحساب</Submit>
      <p className="small">عندك حساب؟ <Link href="/login">سجّل دخول</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [s, act, actPending] = useFormAction(forgot, init);
  return (
    <form action={act} key={s.t ?? "init"}>
      <h1>استرجاع كلمة المرور</h1>
      <Msg s={s} />
      <label className="field"><span>البريد الإلكتروني</span><input className="in" id="email" name="email" type="email" autoComplete="email" required dir="ltr" /></label>
      <Submit pending={actPending} className="btn primary block" pendingText="جاري الإرسال…">أرسل رابط الاسترجاع</Submit>
      <Link className="small" href="/login">رجوع لتسجيل الدخول</Link>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [s, act, actPending] = useFormAction(reset, init);
  return (
    <form action={act} key={s.t ?? "init"}>
      <h1>كلمة مرور جديدة</h1>
      <Msg s={s} />
      {s.ok ? <Link className="btn primary block" href="/login">تسجيل الدخول</Link> : (
        <>
          <input type="hidden" name="token" value={token} />
          <label className="field"><span>كلمة المرور الجديدة</span><input className="in" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required dir="ltr" /><span className="hint">10 أحرف على الأقل، فيها حروف وأرقام. بنسجل خروجك من كل الأجهزة.</span></label>
          <Submit pending={actPending} className="btn primary block">حفظ كلمة المرور</Submit>
        </>
      )}
    </form>
  );
}
