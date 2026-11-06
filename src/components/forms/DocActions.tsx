"use client";
import { useFormAction } from "@/components/useFormAction";
import { Submit } from "@/components/Submit";
import { addPayment } from "@/app/app/actions";

export function PrintButton() {
  return <button type="button" className="btn" onClick={() => window.print()}>طباعة</button>;
}

export function PaymentForm({ id, balance }: { id: string; balance: number }) {
  const [s, act, actPending] = useFormAction(addPayment, {});
  return (
    <form action={act} key={s.t ?? "init"} className="stack" style={{ gap: 8, marginTop: 8 }}>
      {s.error && <div className="notice bad small">{s.error}</div>}
      {s.ok && <div className="notice ok small">{s.ok}</div>}
      <input type="hidden" name="id" value={id} />
      <label className="field"><span>مبلغ الدفعة</span><input className="in num" id="pay-amount" name="amount" inputMode="decimal" defaultValue={balance.toFixed(2)} /></label>
      <label className="field"><span>طريقة الدفع</span><select className="in" id="pay-method" name="method"><option>تحويل بنكي</option><option>مدى</option><option>نقداً</option><option>Apple Pay</option><option>STC Pay</option></select></label>
      <Submit pending={actPending} className="btn">تسجيل الدفعة</Submit>
    </form>
  );
}
