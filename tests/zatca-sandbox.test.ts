/**
 * Live check against ZATCA's developer-portal sandbox (needs internet access to gw-fatoora.zatca.gov.sa).
 * Run: ZATCA_SANDBOX=1 npx vitest run tests/zatca-sandbox.test.ts
 * It requests a compliance CSID with ZATCA's published sandbox OTP and submits a signed
 * standard and simplified invoice to /compliance/invoices, printing ZATCA's validation results.
 */
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { generateKeyPair } from "@/lib/zatca/crypto";
import { computeTotals, FIRST_PIH } from "@/lib/zatca/model";
import { stampDocument } from "@/lib/zatca/sign";
import { buildCsr } from "@/lib/zatca/x509";
import { certificateFromToken, FatooraClient } from "@/lib/zatca/fatoora";

const run = process.env.ZATCA_SANDBOX === "1" ? describe : describe.skip;

run("ZATCA developer-portal sandbox", () => {
  it("issues a compliance CSID and accepts signed sample invoices", async () => {
    const seller = { nameAr: "شركة اختبار زيمارا", vat: "399999999900003", crn: "1010010000", street: "طريق الملك فهد", building: "1234", district: "العليا", city: "الرياض", postal: "12211", country: "SA" };
    const buyer = { name: "مشتري اختبار", vat: "300000000000003", street: "شارع التحلية", building: "4321", district: "الروضة", city: "جدة", postal: "23434", country: "SA" };
    const k = generateKeyPair();
    const csr = buildCsr({ privatePem: k.privatePem, publicDer: k.publicDer, env: "developer-portal", commonName: "Zimara-EGS-TEST", serialNumber: `1-Zimara|2-1.0|3-${crypto.randomUUID()}`, vat: seller.vat, orgUnit: "Riyadh Branch", orgName: "Zimara Test", invoiceType: "1100", location: "Riyadh", industry: "Technology" });
    const client = new FatooraClient("developer-portal");
    const csid = await client.complianceCsid(process.env.ZATCA_OTP ?? "123345", csr.base64ForZatca);
    console.log("compliance CSID requestID:", csid.data.requestID, csid.data.dispositionMessage);
    const cert = certificateFromToken(csid.data.binarySecurityToken);
    let pih = FIRST_PIH;
    for (const [i, kind] of (["standard", "simplified"] as const).entries()) {
      const lines = [{ name: "صنف", qty: 2, price: 100, cat: "S" as const }];
      const now = new Date().toISOString();
      const doc = { number: `SME-${i + 1}`, uuid: crypto.randomUUID(), issueDate: now.slice(0, 10), issueTime: now.slice(11, 19), kind, docType: "invoice" as const, icv: i + 1, pih, supplyDate: now.slice(0, 10), payMeans: "10", lines, totals: computeTotals(lines) };
      const s = stampDocument({ doc, seller, buyer: kind === "standard" ? buyer : null, privatePem: k.privatePem, certificateB64: cert, signingTime: now.slice(0, 19) });
      const r = await client.complianceInvoice(csid.data.binarySecurityToken, csid.data.secret, { invoiceHash: s.hash, uuid: doc.uuid, invoice: Buffer.from(s.xml).toString("base64") });
      console.log(kind, JSON.stringify(r.data, null, 2));
      expect(["PASS", "WARNING"]).toContain(r.data.validationResults?.status);
      pih = s.hash;
    }
  }, 60000);
});
