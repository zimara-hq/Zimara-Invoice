import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SITE } from "@/lib/site";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="brandside">
        <Link href="/" aria-label="الرئيسية"><Logo onDark height={44} /></Link>
        <div className="tagline">
          <h1 style={{ color: "#fff", fontSize: "1.8rem" }}>{SITE.tagline}</h1>
          <p style={{ color: "#d6caee" }}>فوترة إلكترونية متوافقة مع المرحلة الثانية من هيئة الزكاة والضريبة والجمارك، من حائل لكل المملكة.</p>
        </div>
        <p className="small" style={{ color: "#b6a8cf" }}>{SITE.taglineEn}</p>
      </aside>
      <main className="formside">{children}</main>
    </div>
  );
}
