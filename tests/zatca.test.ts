import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { generateKeyPair, verify, encryptSecret, decryptSecret } from "@/lib/zatca/crypto";
import { computeTotals, FIRST_PIH } from "@/lib/zatca/model";
import { validateDraft, validateSeller } from "@/lib/zatca/validate";
import { buildHashXml, stripForHash } from "@/lib/zatca/xml";
import { buildCsr, issueSimulationCertificate, parseCertificate } from "@/lib/zatca/x509";
import { parseQr, stampDocument, verifyStoredDocument } from "@/lib/zatca/sign";
import { certificateFromToken } from "@/lib/zatca/fatoora";

const seller = { nameAr: "شركة زيمارا & شركاه", vat: "300000000000003", crn: "1010101010", street: "طريق الملك فهد", building: "1234", postal: "12345", city: "حائل", district: "النقرة" };
const buyer = { name: "مؤسسة النور", vat: "311111111111113", street: "شارع التحلية", building: "4321", postal: "54321", city: "جدة", district: "الروضة" };

function sampleDoc(kind: "standard" | "simplified" = "standard") {
  const lines = [{ name: "استشارة <تقنية>", qty: 3, price: 450, discount: 0, cat: "S" as const }, { name: "خدمة مالية", qty: 1, price: 200, cat: "E" as const, reason: "VATEX-SA-29" }];
  return { number: "INV-2026-00001", uuid: crypto.randomUUID(), issueDate: "2026-11-06", issueTime: "10:00:00", kind, docType: "invoice" as const, icv: 1, pih: FIRST_PIH, supplyDate: "2026-11-06", payMeans: "30", lines, totals: computeTotals(lines) };
}

function openssl(args: string[], input?: string) {
  return execFileSync("openssl", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

describe("tax maths", () => {
  it("computes VAT per subtotal with exemptions", () => {
    const t = computeTotals([{ name: "a", qty: 3, price: 33.33, cat: "S" }, { name: "b", qty: 1, price: 100, discount: 10, cat: "E", reason: "VATEX-SA-29" }]);
    expect(t.net).toBe(189.99);
    expect(t.vat).toBe(15);
    expect(t.gross).toBe(204.99);
  });
});

describe("validation", () => {
  it("accepts a complete seller and rejects a bad VAT number", () => {
    expect(validateSeller(seller)).toEqual([]);
    expect(validateSeller({ ...seller, vat: "123" }).map((e) => e.code)).toContain("BR-KSA-39");
  });
  it("requires a buyer address on B2B and an exemption reason on non-standard lines", () => {
    const issues = validateDraft({ kind: "standard", docType: "invoice", supplyDate: "2026-11-06", lines: [{ name: "x", qty: 1, price: 1, cat: "Z" }] }, seller, { name: "أحمد" }, null);
    const codes = issues.filter((i) => i.level === "error").map((i) => i.code);
    expect(codes).toContain("BR-KSA-63");
    expect(codes).toContain("BR-KSA-69");
  });
  it("requires a reference and reason on credit notes", () => {
    const codes = validateDraft({ kind: "simplified", docType: "credit", lines: [{ name: "x", qty: 1, price: 1, cat: "S" }] }, seller, null, null).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["BR-KSA-56", "BR-KSA-17"]));
  });
});

describe("keys and secrets", () => {
  it("encrypts private keys at rest", () => {
    process.env.ZIMARA_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    const blob = encryptSecret("secret-pem");
    expect(blob).not.toContain("secret-pem");
    expect(decryptSecret(blob)).toBe("secret-pem");
  });
});

describe("CSR", () => {
  it("builds a CSR that OpenSSL verifies, with ZATCA's template and SAN fields", () => {
    const k = generateKeyPair();
    const csr = buildCsr({ privatePem: k.privatePem, publicDer: k.publicDer, env: "simulation", commonName: "Zimara-EGS-1", serialNumber: "1-Zimara|2-1.0|3-ed22f1d8-e6a2-1118-9b58-d9a8f11e445f", vat: seller.vat, orgUnit: "Hail Branch", orgName: "زيمارا", invoiceType: "1100", location: "Hail", industry: "Technology" });
    const dir = mkdtempSync(path.join(tmpdir(), "csr-"));
    const f = path.join(dir, "c.pem");
    writeFileSync(f, csr.pem);
    const out = openssl(["req", "-in", f, "-noout", "-verify", "-text"]);
    expect(out).toMatch(/PREZATCA-Code-Signing/);
    expect(out).toMatch(/secp256k1/);
    expect(out).toMatch(/1-Zimara\|2-1\.0\|3-ed22f1d8/);
    expect(Buffer.from(csr.base64ForZatca, "base64").toString()).toContain("BEGIN CERTIFICATE REQUEST");
  });
});

describe("certificates", () => {
  it("issues a simulation certificate that OpenSSL can read, and parses it", () => {
    const k = generateKeyPair();
    const certB64 = issueSimulationCertificate({ commonName: "EGS", orgName: "زيمارا", orgUnit: "Main" }, k.publicDer);
    const dir = mkdtempSync(path.join(tmpdir(), "crt-"));
    const f = path.join(dir, "c.der");
    writeFileSync(f, Buffer.from(certB64, "base64"));
    const out = openssl(["x509", "-inform", "DER", "-in", f, "-noout", "-serial", "-issuer"]);
    const parsed = parseCertificate(certB64);
    expect(BigInt("0x" + out.match(/serial=([0-9A-F]+)/i)![1]).toString()).toBe(parsed.serialDecimal);
    expect(parsed.issuerName).toBe("CN=Zimara Simulation CA (not ZATCA), DC=zimara, DC=local");
    expect(parsed.publicKeyDer.equals(k.publicDer)).toBe(true);
    expect(certificateFromToken(Buffer.from(certB64).toString("base64"))).toBe(certB64);
  });
});

describe("stamped documents", () => {
  for (const kind of ["standard", "simplified"] as const) {
    it(`signs a ${kind} invoice: hash round-trips through the ZATCA transform, signature verifies, XML parses`, () => {
      const k = generateKeyPair();
      const certB64 = issueSimulationCertificate({ commonName: "EGS", orgName: "زيمارا", orgUnit: "Main" }, k.publicDer);
      const doc = sampleDoc(kind);
      const s = stampDocument({ doc, seller, buyer: kind === "standard" ? buyer : null, privatePem: k.privatePem, certificateB64: certB64, signingTime: "2026-11-06T10:00:00" });
      expect(stripForHash(s.xml)).toBe(buildHashXml(doc, seller, kind === "standard" ? buyer : null));
      expect(verify(Buffer.from(s.hash, "base64"), Buffer.from(s.signature, "base64"), k.publicDer)).toBe(true);
      expect(verifyStoredDocument(s.xml, s.hash, s.signature, certB64)).toEqual({ hashOk: true, signatureOk: true });
      expect(verifyStoredDocument(s.xml.replace(">1552.50<", ">1.00<"), s.hash, s.signature, certB64).hashOk).toBe(false);
      const q = parseQr(s.qr);
      expect(q[1].toString()).toBe(seller.nameAr);
      expect(q[6].toString()).toBe(s.hash);
      expect(q[8].length).toBe(88);
      expect(Boolean(q[9])).toBe(kind === "simplified");
      const dir = mkdtempSync(path.join(tmpdir(), "xml-"));
      const f = path.join(dir, "i.xml");
      writeFileSync(f, s.xml);
      // well-formedness via Python's XML parser
      execFileSync("python3", ["-I", "-c", "import sys,xml.dom.minidom as m; m.parse(sys.argv[1])", f]);
      expect(s.xml).toContain("&lt;تقنية&gt;");
    });
  }
});
