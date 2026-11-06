import { computeTotals, type DocKind, type DocType, type LineInput, type Party } from "./model";

export interface Issue { level: "error" | "warning"; code: string; msg: string }

export const RE_VAT = /^3\d{13}3$/;
const RE_BLD = /^\d{4}$/;
const RE_POST = /^\d{5}$/;
const RE_CR = /^\d{10}$/;

export interface Seller extends Party {
  nameAr: string;
  vat: string;
  crn: string;
}

export function validateSeller(c: Partial<Seller> | null | undefined): Issue[] {
  const e: Issue[] = [];
  const err = (code: string, msg: string) => e.push({ level: "error", code, msg });
  const s = c ?? {};
  if (!s.nameAr?.trim()) err("BR-KSA-CO-1", "اسم المنشأة بالعربي مطلوب");
  if (!RE_VAT.test(s.vat ?? "")) err("BR-KSA-39", "الرقم الضريبي لازم يكون 15 رقم، يبدأ بـ 3 وينتهي بـ 3");
  if (!RE_CR.test(s.crn ?? "")) err("BR-KSA-08", "رقم السجل التجاري لازم يكون 10 أرقام");
  if (!s.street?.trim()) err("BR-KSA-09", "اسم الشارع مطلوب");
  if (!RE_BLD.test(s.building ?? "")) err("BR-KSA-37", "رقم المبنى لازم يكون 4 أرقام");
  if (!RE_POST.test(s.postal ?? "")) err("BR-KSA-66", "الرمز البريدي لازم يكون 5 أرقام");
  if (!s.city?.trim()) err("BR-KSA-09", "المدينة مطلوبة");
  if (!s.district?.trim()) err("BR-KSA-09", "الحي مطلوب");
  return e;
}

export interface DraftForValidation {
  kind: DocKind;
  docType: DocType;
  supplyDate?: string | null;
  reason?: string | null;
  lines: LineInput[];
}

export function validateDraft(d: DraftForValidation, seller: Partial<Seller> | null, buyer: Party | null, original: { grossTotal: number } | null): Issue[] {
  const e: Issue[] = [];
  const err = (code: string, msg: string) => e.push({ level: "error", code, msg });
  const warn = (code: string, msg: string) => e.push({ level: "warning", code, msg });
  if (validateSeller(seller).length) err("SELLER", "بيانات منشأتك ناقصة. كمّلها من الإعدادات");
  if (d.kind === "standard") {
    if (!buyer) err("BR-KSA-42", "الفاتورة الضريبية (B2B) تحتاج عميل");
    else {
      if (!buyer.name?.trim()) err("BR-KSA-42", "اسم المشتري مطلوب في الفاتورة الضريبية");
      if (buyer.vat && !RE_VAT.test(buyer.vat)) err("BR-KSA-44", "الرقم الضريبي للمشتري غير صحيح (15 رقم يبدأ وينتهي بـ 3)");
      if (!buyer.vat && !buyer.crn) warn("BR-KSA-14", "المشتري بدون رقم ضريبي ولا سجل تجاري. الفاتورة تنقبل مع تحذير، والأفضل تحدّث بياناته");
      if (!buyer.street?.trim() || !buyer.city?.trim() || !buyer.district?.trim()) err("BR-KSA-63", "عنوان المشتري (الشارع، الحي، المدينة) مطلوب في الفاتورة الضريبية");
      if (!buyer.building || !buyer.postal) err("BR-KSA-63", "رقم المبنى والرمز البريدي للمشتري مطلوبين");
      else {
        if (!RE_BLD.test(buyer.building)) err("BR-KSA-37", "رقم مبنى المشتري لازم يكون 4 أرقام");
        if (!RE_POST.test(buyer.postal)) err("BR-KSA-67", "الرمز البريدي للمشتري لازم يكون 5 أرقام");
      }
    }
    if (!d.supplyDate) err("BR-KSA-15", "تاريخ التوريد مطلوب في الفاتورة الضريبية");
  }
  if (!d.lines.length) err("BR-16", "أضف بند واحد على الأقل");
  if (d.lines.length > 500) err("LIMIT", "الحد الأعلى 500 بند في المستند");
  d.lines.forEach((ln, i) => {
    const n = `البند ${i + 1}: `;
    if (!ln.name?.trim()) err("BR-25", n + "اسم الصنف مطلوب");
    if (!(Number(ln.qty) > 0)) err("BR-KSA-F-04", n + "الكمية لازم تكون أكبر من صفر");
    if (!(Number(ln.price) >= 0) || Number.isNaN(Number(ln.price))) err("BR-27", n + "السعر لازم يكون صفر أو أكثر");
    const disc = Number(ln.discount || 0);
    if (disc < 0) err("BR-41", n + "الخصم ما يكون سالب");
    if (disc > Number(ln.qty) * Number(ln.price)) err("BR-41", n + "الخصم أكبر من قيمة البند");
    if (ln.cat !== "S" && !ln.reason) err("BR-KSA-69", n + "البند غير الخاضع لـ 15% يحتاج سبب إعفاء");
  });
  if (d.docType !== "invoice") {
    if (!original) err("BR-KSA-56", "الإشعار لازم يشير للفاتورة الأصلية (المادة 54 من اللائحة)");
    if (!d.reason?.trim()) err("BR-KSA-17", "سبب إصدار الإشعار مطلوب");
    if (original && d.docType === "credit" && computeTotals(d.lines).gross > original.grossTotal + 0.001) {
      warn("BR-CN-01", "مبلغ الإشعار الدائن أكبر من الفاتورة الأصلية");
    }
  }
  return e;
}
