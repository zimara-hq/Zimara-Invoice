export function ZatcaPill({ status, mode }: { status: string; mode?: string }) {
  const map: Record<string, [string, string]> = {
    cleared: ["ok", "معتمدة"],
    reported: ["ok", "تمت المشاركة"],
    pending: ["warn", "بانتظار الإرسال"],
    failed: ["warn", "تعذر الإرسال، بنعيد المحاولة"],
    rejected: ["bad", "مرفوضة من الهيئة"],
  };
  const [k, t] = map[status] ?? ["", status];
  return <span className={`pill ${k}`}>{t}{mode === "local" ? " (محاكاة)" : ""}</span>;
}

export function docLabel(kind: string, docType: string) {
  if (docType === "credit") return "إشعار دائن";
  if (docType === "debit") return "إشعار مدين";
  return kind === "standard" ? "فاتورة ضريبية" : "فاتورة مبسطة";
}
