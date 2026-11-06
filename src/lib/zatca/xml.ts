/**
 * UBL 2.1 invoice XML for ZATCA Phase 2.
 *
 * The document is emitted minified (no whitespace between elements). That way, removing
 * UBLExtensions, cac:Signature and the QR reference — the transforms ZATCA applies before
 * hashing — leaves exactly the string we hashed, with nothing extra for C14N 1.1 to keep.
 */
import { DOC_CODES, EXEMPTIONS, f2, type DocKind, type DocType, type LineInput, type Party, type Totals, type VatCategory } from "./model";

export interface XmlDoc {
  number: string;
  uuid: string;
  issueDate: string; // YYYY-MM-DD
  issueTime: string; // HH:mm:ss
  kind: DocKind;
  docType: DocType;
  icv: number;
  pih: string;
  supplyDate?: string | null;
  payMeans?: string | null;
  notes?: string | null;
  reason?: string | null;
  refNumber?: string | null;
  lines: LineInput[];
  totals: Totals;
}

export interface SellerParty extends Omit<Party, "name"> {
  nameAr: string;
  vat: string;
  crn: string;
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\r/g, "&#xD;");
}

const NS =
  'xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
const CUR = ' currencyID="SAR"';

function address(p: Omit<Party, "name">): string {
  if (!p.street && !p.city) return "";
  let x = "<cac:PostalAddress>";
  if (p.street) x += `<cbc:StreetName>${esc(p.street)}</cbc:StreetName>`;
  if (p.building) x += `<cbc:BuildingNumber>${esc(p.building)}</cbc:BuildingNumber>`;
  if (p.district) x += `<cbc:CitySubdivisionName>${esc(p.district)}</cbc:CitySubdivisionName>`;
  if (p.city) x += `<cbc:CityName>${esc(p.city)}</cbc:CityName>`;
  if (p.postal) x += `<cbc:PostalZone>${esc(p.postal)}</cbc:PostalZone>`;
  return x + `<cac:Country><cbc:IdentificationCode>${esc(p.country || "SA")}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>`;
}

function supplier(s: SellerParty): string {
  return (
    "<cac:AccountingSupplierParty><cac:Party>" +
    `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(s.crn)}</cbc:ID></cac:PartyIdentification>` +
    address(s) +
    `<cac:PartyTaxScheme><cbc:CompanyID>${esc(s.vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` +
    `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(s.nameAr)}</cbc:RegistrationName></cac:PartyLegalEntity>` +
    "</cac:Party></cac:AccountingSupplierParty>"
  );
}

function customer(b: Party | null): string {
  let x = "<cac:AccountingCustomerParty><cac:Party>";
  if (b?.crn) x += `<cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(b.crn)}</cbc:ID></cac:PartyIdentification>`;
  if (b) x += address(b);
  x += b?.vat
    ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(b.vat)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
    : "<cac:PartyTaxScheme><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>";
  if (b?.name) x += `<cac:PartyLegalEntity><cbc:RegistrationName>${esc(b.name)}</cbc:RegistrationName></cac:PartyLegalEntity>`;
  return x + "</cac:Party></cac:AccountingCustomerParty>";
}

function taxCategory(cat: VatCategory, rate: number, reason: string | null): string {
  let x = `<cbc:ID>${cat}</cbc:ID><cbc:Percent>${(rate * 100).toFixed(2)}</cbc:Percent>`;
  if (cat !== "S" && reason) x += `<cbc:TaxExemptionReasonCode>${esc(reason)}</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>${esc(EXEMPTIONS[reason] ?? reason)}</cbc:TaxExemptionReason>`;
  return x + "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>";
}

const PIH_MARK = "<cbc:ID>PIH</cbc:ID>";

/** The document exactly as ZATCA hashes it: no UBLExtensions, no QR reference, no cac:Signature. */
export function buildHashXml(d: XmlDoc, seller: SellerParty, buyer: Party | null): string {
  const t = d.totals;
  let x = `<Invoice ${NS}>`;
  x += "<cbc:ProfileID>reporting:1.0</cbc:ProfileID>";
  x += `<cbc:ID>${esc(d.number)}</cbc:ID><cbc:UUID>${esc(d.uuid)}</cbc:UUID>`;
  x += `<cbc:IssueDate>${d.issueDate}</cbc:IssueDate><cbc:IssueTime>${d.issueTime}</cbc:IssueTime>`;
  x += `<cbc:InvoiceTypeCode name="${d.kind === "standard" ? "0100000" : "0200000"}">${DOC_CODES[d.docType]}</cbc:InvoiceTypeCode>`;
  if (d.notes) x += `<cbc:Note languageID="ar">${esc(d.notes)}</cbc:Note>`;
  x += "<cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>";
  if (d.refNumber) x += `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(d.refNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`;
  x += `<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${d.icv}</cbc:UUID></cac:AdditionalDocumentReference>`;
  x += `<cac:AdditionalDocumentReference>${PIH_MARK}<cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${d.pih}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
  x += supplier(seller) + customer(buyer);
  if (d.supplyDate) x += `<cac:Delivery><cbc:ActualDeliveryDate>${d.supplyDate}</cbc:ActualDeliveryDate></cac:Delivery>`;
  x += `<cac:PaymentMeans><cbc:PaymentMeansCode>${esc(d.payMeans || "10")}</cbc:PaymentMeansCode>${d.reason ? `<cbc:InstructionNote>${esc(d.reason)}</cbc:InstructionNote>` : ""}</cac:PaymentMeans>`;
  x += `<cac:TaxTotal><cbc:TaxAmount${CUR}>${f2(t.vat)}</cbc:TaxAmount></cac:TaxTotal>`;
  x += `<cac:TaxTotal><cbc:TaxAmount${CUR}>${f2(t.vat)}</cbc:TaxAmount>`;
  for (const s of t.subtotals) {
    x += `<cac:TaxSubtotal><cbc:TaxableAmount${CUR}>${f2(s.taxable)}</cbc:TaxableAmount><cbc:TaxAmount${CUR}>${f2(s.tax)}</cbc:TaxAmount><cac:TaxCategory>${taxCategory(s.cat, s.rate, s.reason)}</cac:TaxCategory></cac:TaxSubtotal>`;
  }
  x += "</cac:TaxTotal>";
  x += `<cac:LegalMonetaryTotal><cbc:LineExtensionAmount${CUR}>${f2(t.net)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount${CUR}>${f2(t.net)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount${CUR}>${f2(t.gross)}</cbc:TaxInclusiveAmount><cbc:AllowanceTotalAmount${CUR}>0.00</cbc:AllowanceTotalAmount><cbc:PrepaidAmount${CUR}>0.00</cbc:PrepaidAmount><cbc:PayableAmount${CUR}>${f2(t.gross)}</cbc:PayableAmount></cac:LegalMonetaryTotal>`;
  d.lines.forEach((ln, i) => {
    const lt = t.lines[i];
    x += `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID>`;
    x += `<cbc:InvoicedQuantity unitCode="${esc(ln.unit || "PCE")}">${Number(ln.qty).toFixed(6)}</cbc:InvoicedQuantity>`;
    x += `<cbc:LineExtensionAmount${CUR}>${f2(lt.net)}</cbc:LineExtensionAmount>`;
    if (Number(ln.discount || 0) > 0) x += `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason><cbc:Amount${CUR}>${f2(Number(ln.discount))}</cbc:Amount></cac:AllowanceCharge>`;
    x += `<cac:TaxTotal><cbc:TaxAmount${CUR}>${f2(lt.vat)}</cbc:TaxAmount><cbc:RoundingAmount${CUR}>${f2(lt.gross)}</cbc:RoundingAmount></cac:TaxTotal>`;
    x += `<cac:Item><cbc:Name>${esc(ln.name)}</cbc:Name><cac:ClassifiedTaxCategory>${taxCategory(lt.cat, lt.rate, null)}</cac:ClassifiedTaxCategory></cac:Item>`;
    x += `<cac:Price><cbc:PriceAmount${CUR}>${f2(Number(ln.price))}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
  });
  return x + "</Invoice>";
}

export const CAC_SIGNATURE =
  "<cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>";

export function qrReference(qr: string): string {
  return `<cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${qr}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>`;
}

/** Put UBLExtensions first, and the QR reference plus cac:Signature right after the PIH reference. */
export function assemble(hashXml: string, ublExtensions: string, qr: string): string {
  const open = hashXml.indexOf(">") + 1;
  const pih = hashXml.indexOf(PIH_MARK);
  const pihEnd = hashXml.indexOf("</cac:AdditionalDocumentReference>", pih) + "</cac:AdditionalDocumentReference>".length;
  if (pih < 0) throw new Error("PIH reference missing");
  return hashXml.slice(0, open) + ublExtensions + hashXml.slice(open, pihEnd) + qrReference(qr) + CAC_SIGNATURE + hashXml.slice(pihEnd);
}

/** The transform ZATCA applies before hashing. */
export function stripForHash(xml: string): string {
  return xml
    .replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>/, "")
    .replace(/<cac:AdditionalDocumentReference><cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, "")
    .replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, "")
    .replace(/^<\?xml[^>]*\?>\s*/, "");
}

export function prettyXml(xml: string): string {
  let depth = 0;
  return xml
    .replace(/></g, ">\n<")
    .split("\n")
    .map((line) => {
      if (/^<\//.test(line)) depth = Math.max(0, depth - 1);
      const out = "  ".repeat(depth) + line;
      if (/^<[^/!?][^>]*[^/]>$/.test(line) && !/<\/[^>]+>$/.test(line)) depth++;
      return out;
    })
    .join("\n");
}
