export function envName(e: string) {
  return ({ local: "محاكاة محلية", "developer-portal": "بوابة المطورين", simulation: "بيئة المحاكاة (فاتورة)", production: "الإنتاج (فاتورة)" } as Record<string, string>)[e] ?? e;
}
export const PAY_MEANS: Record<string, string> = { "10": "نقداً", "30": "تحويل بنكي", "48": "بطاقة (مدى/ائتمان)", "1": "غير محدد" };
