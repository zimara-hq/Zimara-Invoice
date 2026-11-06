/** Domain types and tax maths shared by the ZATCA engine. */

export type VatCategory = "S" | "Z" | "E" | "O";
export type DocKind = "standard" | "simplified";
export type DocType = "invoice" | "credit" | "debit";

export interface Party {
  name: string;
  vat?: string | null;
  /** Commercial registration (CRN) or other ID */
  crn?: string | null;
  street?: string | null;
  building?: string | null;
  district?: string | null;
  city?: string | null;
  postal?: string | null;
  country?: string | null;
}

export interface LineInput {
  name: string;
  qty: number;
  price: number;
  discount?: number;
  cat: VatCategory;
  reason?: string | null;
  unit?: string | null;
}

export interface Subtotal { cat: VatCategory; rate: number; reason: string; taxable: number; tax: number }
export interface LineTotal { net: number; vat: number; gross: number; rate: number; cat: VatCategory }
export interface Totals { lines: LineTotal[]; subtotals: Subtotal[]; net: number; vat: number; gross: number }

export const RATES: Record<VatCategory, number> = { S: 0.15, Z: 0, E: 0, O: 0 };

export const CAT_NAMES: Record<VatCategory, string> = { S: "خاضع 15%", Z: "نسبة صفرية", E: "معفى", O: "خارج النطاق" };

export const EXEMPTIONS: Record<string, string> = {
  "VATEX-SA-29": "الخدمات المالية",
  "VATEX-SA-29-7": "عقود التأمين على الحياة",
  "VATEX-SA-30": "العقارات السكنية",
  "VATEX-SA-32": "تصدير السلع",
  "VATEX-SA-33": "تصدير الخدمات",
  "VATEX-SA-34-1": "النقل الدولي للسلع",
  "VATEX-SA-34-2": "النقل الدولي للركاب",
  "VATEX-SA-35": "الأدوية والمعدات الطبية",
  "VATEX-SA-36": "المعادن المؤهلة",
  "VATEX-SA-EDU": "التعليم الخاص للمواطنين",
  "VATEX-SA-HEA": "الرعاية الصحية الخاصة للمواطنين",
  "VATEX-SA-OOS": "خارج نطاق الضريبة",
};

export const DOC_CODES: Record<DocType, string> = { invoice: "388", credit: "381", debit: "383" };

export const DOC_NAMES: Record<DocType, { ar: string; en: string }> = {
  invoice: { ar: "فاتورة", en: "Invoice" },
  credit: { ar: "إشعار دائن", en: "Credit Note" },
  debit: { ar: "إشعار مدين", en: "Debit Note" },
};

/** First Previous-Invoice-Hash defined by ZATCA: base64 of the hex SHA-256 of "0". */
export const FIRST_PIH = "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==";

export function r2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
export const f2 = (n: number) => r2(n).toFixed(2);

export function computeTotals(lines: LineInput[]): Totals {
  const subs = new Map<string, Subtotal>();
  const out: LineTotal[] = [];
  let net = 0;
  for (const ln of lines) {
    const lineNet = r2(Number(ln.qty) * Number(ln.price) - Number(ln.discount || 0));
    const cat = ln.cat;
    const rate = RATES[cat];
    const reason = cat === "S" ? "" : ln.reason || "";
    net = r2(net + lineNet);
    const key = `${cat}|${reason}`;
    const s = subs.get(key) ?? { cat, rate, reason, taxable: 0, tax: 0 };
    s.taxable = r2(s.taxable + lineNet);
    subs.set(key, s);
    const vat = r2(lineNet * rate);
    out.push({ net: lineNet, vat, gross: r2(lineNet + vat), rate, cat });
  }
  let vat = 0;
  const subtotals = [...subs.values()].map((s) => {
    s.tax = r2(s.taxable * s.rate);
    vat = r2(vat + s.tax);
    return s;
  });
  return { lines: out, subtotals, net, vat, gross: r2(net + vat) };
}
