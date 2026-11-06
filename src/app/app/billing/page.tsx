import { requireCtx, subscriptionState } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { Pricing } from "@/components/marketing/Pricing";
import { fmtDate } from "@/lib/time";
import { SITE } from "@/lib/site";

export const metadata = { title: "الاشتراك" };

export default async function Billing() {
  const { org } = await requireCtx();
  const sub = subscriptionState(org);
  return (
    <div className="page">
      <PageHead title="الاشتراك والباقات" />
      <div className="card" style={{ marginBottom: 14 }}>
        {sub.trial ? (
          <p style={{ margin: 0 }}>أنت في <b>التجربة المجانية</b>. تنتهي {fmtDate(org.trial_ends_at)} (باقي {sub.daysLeft} يوم). بعدها تبقى فواتيرك متاحة للعرض والتنزيل، والإصدار يحتاج اشتراك.</p>
        ) : (
          <p style={{ margin: 0 }}>باقتك: <b>{org.plan}</b> · {sub.active ? "فعّالة" : "غير فعّالة"}{org.current_period_end ? ` · تتجدد ${fmtDate(org.current_period_end)}` : ""}</p>
        )}
      </div>
      <div className="notice info" style={{ marginBottom: 14 }}>الدفع الإلكتروني (مدى، Apple Pay، STC Pay) يتفعّل بعد ربط بوابة دفع مرخصة من البنك المركزي السعودي باسم الشركة. للاشتراك الحين تواصل معنا: <span className="num">{SITE.email}</span></div>
      <Pricing cta={`mailto:${SITE.email}?subject=${encodeURIComponent("اشتراك زيمارا - " + org.name_ar)}`} />
    </div>
  );
}
