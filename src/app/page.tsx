import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/marketing/Footer";
import { Pricing } from "@/components/marketing/Pricing";
import { SITE } from "@/lib/site";

const FEATURES = [
  ["ربط مع الهيئة في دقائق", "تدخل رمز OTP من بوابة فاتورة، وزيمارا يولّد المفتاح والشهادة ويمرر فحوصات الامتثال الستة تلقائياً."],
  ["مدقق قبل الإصدار", "كل فاتورة تنفحص على قواعد الهيئة قبل ما تنرسل، والخطأ ينشرح بالعربي مع طريقة التصحيح."],
  ["سلسلة ما تقبل التلاعب", "توقيع رقمي secp256k1، وبصمة كل فاتورة مربوطة بالي قبلها، وقاعدة البيانات نفسها ترفض أي تعديل أو حذف."],
  ["مساعد ذكي بالعربي", "اكتب «فاتورة لشركة الأفق بست ساعات استشارة» والمساعد يجهز المسودة، وأنت تراجعها وتصدرها."],
  ["إقرار ضريبي جاهز", "مسودة إقرار ضريبة القيمة المضافة وأعمار الذمم، وتصدير CSV لمحاسبك."],
  ["بياناتك محمية", "تشفير المفاتيح، وسجل تدقيق لكل عملية، واستضافة داخل المملكة وفق نظام حماية البيانات الشخصية."],
];

export default function Home() {
  return (
    <>
      <header className="mk-hero">
        <div className="mk-wrap">
          <nav className="mk-nav" aria-label="القائمة">
            <Logo onDark height={38} />
            <div className="row" style={{ gap: 16 }}>
              <a className="link" href="#features">المزايا</a>
              <a className="link" href="#pricing">الأسعار</a>
              <Link className="link" href="/login">تسجيل الدخول</Link>
              <Link className="btn ember" href="/signup">ابدأ مجاناً</Link>
            </div>
          </nav>
          <div style={{ paddingBlock: "24px 64px" }}>
            <span className="pill" style={{ background: "rgba(255,253,180,.15)", color: "var(--mist)" }}>الموجة 25: آخر موعد للربط 1 فبراير 2027</span>
            <h1>فوترة إلكترونية سعودية، <span className="mist">بذوق أوضح</span></h1>
            <p className="lead">زيمارا يصدر فواتيرك متوافقة مع المرحلة الثانية من هيئة الزكاة والضريبة والجمارك: موقّعة رقمياً، فيها رمز QR، ومربوطة بمنصة فاتورة.</p>
            <div className="row" style={{ marginTop: 20 }}>
              <Link className="btn ember" href="/signup">ابدأ تجربتك المجانية</Link>
              <a className="btn" href="#pricing" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.3)" }}>شوف الأسعار</a>
            </div>
            <p className="small" style={{ color: "#c9bde2", marginTop: 12 }}>14 يوم مجاناً · بدون بطاقة ائتمانية · بيانات داخل المملكة</p>
          </div>
        </div>
      </header>
      <main>
        <section id="features" className="mk-section"><div className="mk-wrap">
          <h2>كل اللي تحتاجه عشان تكون ممتثل</h2>
          <div className="grid g3">{FEATURES.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p className="small muted">{d}</p></div>)}</div>
        </div></section>
        <section id="pricing" className="mk-section" style={{ background: "var(--sunk)" }}><div className="mk-wrap">
          <h2>الباقات</h2>
          <Pricing />
        </div></section>
        <section className="mk-section"><div className="mk-wrap grid g2">
          <div><h2>مبني على متطلبات الهيئة</h2><p className="muted">صيغة UBL 2.1، والاعتماد (Clearance) للفواتير الضريبية قبل تسليمها، والمشاركة (Reporting) للمبسطة خلال 24 ساعة، والإلغاء فقط بإشعار دائن، وعداد فواتير ما ينعاد ضبطه، وأرشفة ست سنوات.</p></div>
          <div className="card"><h3>تواصل معنا</h3><p className="muted small">للمنشآت الكبيرة وأنظمة ERP والربط عبر الواجهة البرمجية.</p><p className="num">{SITE.email}</p><p className="small muted">{SITE.handle}</p></div>
        </div></section>
      </main>
      <Footer />
    </>
  );
}
