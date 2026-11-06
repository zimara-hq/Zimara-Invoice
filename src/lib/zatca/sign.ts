/**
 * Cryptographic stamp: invoice hash, ECDSA signature, XAdES signed properties, TLV QR.
 */
import { sha256, sign, verify } from "./crypto";
import { f2, type Totals } from "./model";
import { parseCertificate } from "./x509";
import { assemble, buildHashXml, esc, stripForHash, type SellerParty, type XmlDoc } from "./xml";
import type { Party } from "./model";

const b64 = (b: Buffer) => b.toString("base64");
/** ZATCA's convention for cert and signed-properties digests: base64 of the hex SHA-256. */
const hexDigestB64 = (s: string) => Buffer.from(sha256(s).toString("hex"), "utf8").toString("base64");

export function invoiceHash(hashXml: string): string {
  return b64(sha256(hashXml));
}

function tlv(tag: number, value: Buffer | string): Buffer {
  const v = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  if (v.length > 255) throw new Error(`QR tag ${tag} too long`);
  return Buffer.concat([Buffer.from([tag, v.length]), v]);
}

export interface QrFields {
  sellerName: string;
  vat: string;
  timestamp: string;
  total: string;
  vatTotal: string;
  hash: string;
  signature: string;
  publicKey: Buffer;
  certSignature?: Buffer | null;
}

export function buildQr(f: QrFields): string {
  const parts = [tlv(1, f.sellerName), tlv(2, f.vat), tlv(3, f.timestamp), tlv(4, f.total), tlv(5, f.vatTotal), tlv(6, f.hash), tlv(7, f.signature), tlv(8, f.publicKey)];
  if (f.certSignature) parts.push(tlv(9, f.certSignature));
  return b64(Buffer.concat(parts));
}

export function parseQr(base64: string): Record<number, Buffer> {
  const b = Buffer.from(base64, "base64");
  const out: Record<number, Buffer> = {};
  let i = 0;
  while (i < b.length) {
    const tag = b[i];
    const len = b[i + 1];
    out[tag] = b.subarray(i + 2, i + 2 + len);
    i += 2 + len;
  }
  return out;
}

const DS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"';
const SHA256_ALG = "http://www.w3.org/2001/04/xmlenc#sha256";

/** SignedProperties as hashed (and as embedded). Kept in one place so the format can be tuned against the ZATCA sandbox. */
export function signedProperties(signingTime: string, certDigest: string, issuerName: string, serial: string, declareDs: boolean): string {
  const ds = declareDs ? ` ${DS}` : "";
  return (
    '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties"><xades:SignedSignatureProperties>' +
    `<xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest>` +
    `<ds:DigestMethod${ds} Algorithm="${SHA256_ALG}"></ds:DigestMethod><ds:DigestValue${ds}>${certDigest}</ds:DigestValue></xades:CertDigest>` +
    `<xades:IssuerSerial><ds:X509IssuerName${ds}>${esc(issuerName)}</ds:X509IssuerName><ds:X509SerialNumber${ds}>${serial}</ds:X509SerialNumber></xades:IssuerSerial>` +
    "</xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties></xades:SignedProperties>"
  );
}

function ublExtensions(hash: string, signedPropsHash: string, signature: string, certB64: string, signedProps: string): string {
  const XPATH = "http://www.w3.org/TR/1999/REC-xpath-19991116";
  const C14N11 = "http://www.w3.org/2006/12/xml-c14n11";
  return (
    "<ext:UBLExtensions><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent>" +
    '<sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">' +
    "<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID><sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>" +
    `<ds:Signature ${DS} Id="signature"><ds:SignedInfo><ds:CanonicalizationMethod Algorithm="${C14N11}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>` +
    `<ds:Transform Algorithm="${XPATH}"><ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="${XPATH}"><ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="${XPATH}"><ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath></ds:Transform>` +
    `<ds:Transform Algorithm="${C14N11}"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="${SHA256_ALG}"></ds:DigestMethod><ds:DigestValue>${hash}</ds:DigestValue></ds:Reference>` +
    `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties"><ds:DigestMethod Algorithm="${SHA256_ALG}"></ds:DigestMethod><ds:DigestValue>${signedPropsHash}</ds:DigestValue></ds:Reference>` +
    `</ds:SignedInfo><ds:SignatureValue>${signature}</ds:SignatureValue><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">${signedProps.replace(' xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"', "")}</xades:QualifyingProperties></ds:Object></ds:Signature>` +
    "</sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension></ext:UBLExtensions>"
  );
}

export interface StampInput {
  doc: XmlDoc;
  seller: SellerParty;
  buyer: Party | null;
  privatePem: string;
  certificateB64: string;
  /** ISO without timezone, e.g. 2026-11-06T10:00:00 */
  signingTime: string;
}

export interface Stamp {
  hashXml: string;
  xml: string;
  hash: string;
  signature: string;
  qr: string;
}

export function stampDocument(i: StampInput): Stamp {
  const hashXml = buildHashXml(i.doc, i.seller, i.buyer);
  const hash = invoiceHash(hashXml);
  const signature = b64(sign(Buffer.from(hash, "base64"), i.privatePem));
  const cert = parseCertificate(i.certificateB64);
  const certDigest = hexDigestB64(cert.base64);
  const sp = signedProperties(i.signingTime, certDigest, cert.issuerName, cert.serialDecimal, true);
  const spHash = hexDigestB64(sp);
  const spEmbedded = signedProperties(i.signingTime, certDigest, cert.issuerName, cert.serialDecimal, false);
  const qr = buildQr({
    sellerName: i.seller.nameAr,
    vat: i.seller.vat,
    timestamp: `${i.doc.issueDate}T${i.doc.issueTime}`,
    total: f2(i.doc.totals.gross),
    vatTotal: f2(i.doc.totals.vat),
    hash,
    signature,
    publicKey: cert.publicKeyDer,
    certSignature: i.doc.kind === "simplified" ? cert.signature : null,
  });
  const xml = '<?xml version="1.0" encoding="UTF-8"?>' + assemble(hashXml, ublExtensions(hash, spHash, signature, cert.base64, spEmbedded), qr);
  return { hashXml, xml, hash, signature, qr };
}

/** Re-derive the hash from a stored XML and check the signature against the certificate. */
export function verifyStoredDocument(xml: string, expectedHash: string, signatureB64: string, certificateB64: string): { hashOk: boolean; signatureOk: boolean } {
  const hashOk = invoiceHash(stripForHash(xml)) === expectedHash;
  const cert = parseCertificate(certificateB64);
  const signatureOk = verify(Buffer.from(expectedHash, "base64"), Buffer.from(signatureB64, "base64"), cert.publicKeyDer);
  return { hashOk, signatureOk };
}

export type { Totals };
