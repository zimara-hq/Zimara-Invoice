import Link from "next/link";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mk-foot">
      <div className="mk-wrap row between" style={{ alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 4 }}>
          <b style={{ color: "var(--fg)" }}>{SITE.brandAr} | {SITE.brandEn}</b>
          <span>{SITE.legalName}</span>
          <span>{SITE.crn ? <>السجل التجاري: <span className="num">{SITE.crn}</span></> : "السجل التجاري: قيد الإصدار"} · {SITE.vat ? <>الرقم الضريبي: <span className="num">{SITE.vat}</span></> : "الرقم الضريبي: قيد التسجيل"}</span>
          <span>{SITE.address} · <span className="num">{SITE.email}</span></span>
        </div>
        <nav className="row" aria-label="روابط قانونية">
          <Link href="/legal/terms">الشروط والأحكام</Link>
          <Link href="/legal/privacy">سياسة الخصوصية</Link>
          <Link href="/legal/refund">الإلغاء والاسترداد</Link>
          <Link href="/#pricing">الأسعار</Link>
        </nav>
      </div>
      <div className="mk-wrap small" style={{ marginTop: 12 }}>© 2026 {SITE.brandAr} · {SITE.tagline} · من حائل</div>
    </footer>
  );
}
