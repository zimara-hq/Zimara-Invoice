import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/Nav";
import { requireCtx, subscriptionState } from "@/lib/org";
import { logout, resendVerification } from "../(auth)/actions";

export const dynamic = "force-dynamic";

async function resend() {
  "use server";
  await resendVerification();
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const sub = subscriptionState(ctx.org);
  return (
    <div className="shell">
      <aside className="side" aria-label="القائمة الرئيسية">
        <Link href="/app" className="logo" aria-label="زيمارا"><Logo onDark height={34} /></Link>
        <NavLinks />
        <div className="foot">
          <div style={{ color: "#fff", fontWeight: 600 }}>{ctx.org.name_ar}</div>
          <div>{ctx.user.name}</div>
          <div>{sub.trial ? `تجربة مجانية · باقي ${sub.daysLeft} يوم` : sub.active ? "اشتراك فعّال" : "الاشتراك غير فعّال"}</div>
          <form action={logout} style={{ marginTop: 8 }}><button className="btn ghost small" style={{ color: "#d9ceec", padding: "4px 0" }}>تسجيل الخروج</button></form>
        </div>
      </aside>
      <div className="main">
        {!ctx.user.email_verified_at && (
          <form action={resend} className="notice warn no-print" style={{ marginTop: 14 }}>
            أكّد بريدك <b className="num">{ctx.user.email}</b> عشان تقدر تصدر فواتير. ما وصلك الرابط؟ <button className="btn ghost small" style={{ padding: "0 4px", color: "var(--accent)" }}>أرسله مرة ثانية</button>
          </form>
        )}
        {sub.trial && sub.daysLeft !== null && sub.daysLeft <= 3 && (
          <div className="notice info no-print" style={{ marginTop: 14 }}>باقي {sub.daysLeft} يوم على نهاية التجربة. <Link href="/app/billing">اختر باقتك</Link></div>
        )}
        {children}
      </div>
    </div>
  );
}
