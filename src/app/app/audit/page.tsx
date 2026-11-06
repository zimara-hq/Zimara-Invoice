import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "سجل التدقيق" };

const NAMES: Record<string, string> = {
  "account.signup": "إنشاء الحساب", "auth.login": "تسجيل دخول", "auth.logout": "تسجيل خروج", "auth.login_failed": "محاولة دخول فاشلة", "auth.email_verified": "تأكيد البريد",
  "auth.password_reset": "استرجاع كلمة المرور", "auth.password_changed": "تغيير كلمة المرور", "auth.logout_all": "خروج من كل الأجهزة", "org.update": "تعديل بيانات المنشأة",
  "egs.onboard": "تسجيل وحدة إصدار", "egs.onboard_failed": "فشل تسجيل وحدة إصدار", "document.issue": "إصدار مستند", "document.download_xml": "تنزيل XML",
  "zatca.clear": "اعتماد من الهيئة", "zatca.cleared": "اعتماد من الهيئة", "zatca.report": "مشاركة مع الهيئة", "zatca.reported": "مشاركة مع الهيئة", "zatca.rejected": "رفض من الهيئة", "zatca.failed": "تعذر الإرسال للهيئة",
  "payment.add": "تسجيل دفعة", "customer.save": "حفظ عميل", "product.save": "حفظ منتج", "account.profile_update": "تعديل الملف الشخصي", "export.sales": "تصدير المبيعات", "ai.draft": "مسودة بالذكاء الاصطناعي",
};

export default async function Audit() {
  const { org } = await requireCtx();
  const rows = await q<{ id: number; at: string; action: string; detail: string | null; ip: string | null; name: string | null }>(
    "SELECT a.id, a.at, a.action, a.detail, a.ip, u.name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.org_id = $1 ORDER BY a.at DESC LIMIT 500",
    [org.id],
  );
  return (
    <div className="page">
      <PageHead title="سجل التدقيق" />
      <div className="notice info" style={{ marginBottom: 14 }}>كل عملية في النظام تنسجل هنا بطابع زمني، وقاعدة البيانات ترفض تعديل أو حذف أي سطر من السجل (متطلب الهيئة: منع العبث بالسجلات).</div>
      {rows.length ? (
        <div className="tbl">
          <table>
            <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th><th>IP</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDateTime(r.at)}</td><td>{r.name ?? "النظام"}</td><td>{NAMES[r.action] ?? r.action}</td><td className="wrap">{r.detail}</td><td className="code">{r.ip ?? ""}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div className="card empty"><h3>السجل فاضي</h3></div>}
    </div>
  );
}
