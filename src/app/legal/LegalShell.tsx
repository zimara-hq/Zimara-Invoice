import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/marketing/Footer";
import { SITE } from "@/lib/site";

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div className="legal">
        <Link href="/" aria-label="الرئيسية"><Logo height={34} /></Link>
        <h1 style={{ marginTop: 24 }}>{title}</h1>
        <p className="muted small">الإصدار {SITE.termsVersion} · آخر تحديث: نوفمبر 2026</p>
        {process.env.LEGAL_REVIEWED !== "true" && (
          <div className="notice warn" style={{ marginTop: 12 }}>هذي الصفحة مسودة قيد المراجعة القانونية، وتُعتمد بعد مراجعة محامٍ مرخص في المملكة واستكمال بيانات السجل التجاري.</div>
        )}
        {children}
      </div>
      <Footer />
    </>
  );
}
