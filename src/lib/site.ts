/** Business identity shown on the site and in legal pages (required by the E-Commerce Law). */
export const SITE = {
  brandAr: "زيمارا",
  brandEn: "ZIMARA",
  tagline: "التقنية بذوق أوضح",
  taglineEn: "Modern technology, distinctly refined.",
  domain: "zimara.co",
  email: process.env.COMPANY_EMAIL ?? "hello@zimara.co",
  handle: "@zimarahq",
  legalName: process.env.COMPANY_LEGAL_NAME ?? "زيمارا (الاسم القانوني يُستكمل بعد صدور السجل التجاري)",
  crn: process.env.COMPANY_CRN ?? "",
  vat: process.env.COMPANY_VAT ?? "",
  city: process.env.COMPANY_CITY ?? "حائل",
  address: process.env.COMPANY_ADDRESS ?? "حائل، المملكة العربية السعودية",
  termsVersion: "2026-11",
};

export const PLANS = [
  { id: "starter", name: "انطلاقة", monthly: 59, note: "للمنشآت الصغيرة في الموجة 25", features: ["فواتير وإشعارات بلا حد", "مستخدمين اثنين، ووحدة إصدار وحدة", "عملاء ومنتجات بلا حد", "30 عملية ذكاء اصطناعي شهرياً", "أرشفة 6 سنوات"] },
  { id: "growth", name: "نمو", monthly: 129, note: "للشركات اللي تبيع وتشتري", hot: true, features: ["كل ميزات انطلاقة", "5 مستخدمين وفرعين", "فواتير متكررة واشتراكات", "واتساب وتذكيرات تحصيل", "سلة وزد وووكومرس", "200 عملية ذكاء اصطناعي"] },
  { id: "pro", name: "احترافي", monthly: 249, note: "للمنشآت اللي تبي نظام متكامل", features: ["كل ميزات نمو", "15 مستخدم و5 فروع", "مخزون ومستودعات", "وحدة الأقساط وبوابة العميل", "واجهة برمجية API", "بوابة المحاسب"] },
  { id: "enterprise", name: "مؤسسات", monthly: 599, note: "للمجموعات وأنظمة ERP", from: true, features: ["كل ميزات احترافي", "مستخدمين وفروع بلا حد", "شركات متعددة ومجموعة ضريبية", "دخول موحد SSO", "اتفاقية خدمة 99.9%"] },
] as const;
