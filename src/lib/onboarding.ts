/**
 * Registering an EGS unit with ZATCA: key generation, CSR, compliance CSID, the six compliance
 * documents, and the production CSID. "local" mode runs the same steps against a local simulation CA.
 */
import crypto from "node:crypto";
import { one, q, tx } from "./db";
import { audit } from "./audit";
import { encryptSecret, generateKeyPair } from "./zatca/crypto";
import { computeTotals, FIRST_PIH, type DocKind, type DocType } from "./zatca/model";
import { stampDocument, verifyStoredDocument } from "./zatca/sign";
import { validateDraft, validateSeller } from "./zatca/validate";
import { buildCsr, issueSimulationCertificate, parseCertificate, type ZatcaEnv } from "./zatca/x509";
import { certificateFromToken, FatooraClient, FatooraError } from "./zatca/fatoora";
import { riyadhNow } from "./time";

export type Mode = "local" | ZatcaEnv;
export interface CheckResult { name: string; ok: boolean; detail?: string }

const SAMPLE_BUYER = { name: "عميل اختبار الامتثال", vat: "399999999900003", crn: "1010999999", street: "طريق الملك عبدالعزيز", building: "1111", postal: "11564", city: "الرياض", district: "الملز", country: "SA" };
const TYPES: [DocKind, DocType, string][] = [
  ["standard", "invoice", "فاتورة ضريبية"], ["standard", "credit", "إشعار دائن ضريبي"], ["standard", "debit", "إشعار مدين ضريبي"],
  ["simplified", "invoice", "فاتورة مبسطة"], ["simplified", "credit", "إشعار دائن مبسط"], ["simplified", "debit", "إشعار مدين مبسط"],
];

export async function onboard(orgId: string, userId: string, mode: Mode, otp: string): Promise<{ ok: boolean; checks: CheckResult[]; error?: string }> {
  if (!/^\d{6}$/.test(otp)) return { ok: false, checks: [], error: "رمز OTP لازم يكون 6 أرقام" };
  const org = await one<{ name_ar: string; name_en: string | null; vat: string; crn: string; street: string; building: string; district: string; city: string; postal: string; industry: string }>("SELECT * FROM organizations WHERE id = $1", [orgId]);
  if (!org) return { ok: false, checks: [], error: "المنشأة غير موجودة" };
  const seller = { nameAr: org.name_ar, vat: org.vat, crn: org.crn, street: org.street, building: org.building, district: org.district, city: org.city, postal: org.postal, country: "SA" };
  if (validateSeller(seller).length) return { ok: false, checks: [], error: "كمّل بيانات المنشأة أول" };

  const keys = generateKeyPair();
  const serial = `1-Zimara|2-1.0|3-${crypto.randomUUID()}`;
  const commonName = `Zimara-EGS-${org.crn}`;
  const subject = { commonName, orgName: org.name_en || org.name_ar, orgUnit: org.city };
  const checks: CheckResult[] = [];
  let complianceCert: string;
  let creds: { token: string; secret: string; requestId?: string | number } | null = null;

  try {
    if (mode === "local") {
      complianceCert = issueSimulationCertificate(subject, keys.publicDer);
      checks.push({ name: "شهادة الامتثال (محاكاة محلية)", ok: true });
    } else {
      const csr = buildCsr({ privatePem: keys.privatePem, publicDer: keys.publicDer, env: mode, commonName, serialNumber: serial, vat: org.vat, orgUnit: org.city, orgName: subject.orgName, invoiceType: "1100", location: org.city, industry: org.industry });
      const client = new FatooraClient(mode);
      const res = await client.complianceCsid(otp, csr.base64ForZatca);
      creds = { token: res.data.binarySecurityToken, secret: res.data.secret, requestId: res.data.requestID };
      complianceCert = certificateFromToken(res.data.binarySecurityToken);
      checks.push({ name: "شهادة الامتثال (Compliance CSID)", ok: true });
    }

    const now = riyadhNow();
    let pih = FIRST_PIH;
    for (let i = 0; i < TYPES.length; i++) {
      const [kind, docType, name] = TYPES[i];
      const lines = [{ name: "صنف اختبار", qty: 2, price: 100, discount: 0, cat: "S" as const, unit: "PCE" }, { name: "خدمة مالية", qty: 1, price: 50, cat: "E" as const, reason: "VATEX-SA-29", unit: "PCE" }];
      const buyer = kind === "standard" ? SAMPLE_BUYER : null;
      const doc = { number: `CMP-${i + 1}`, uuid: crypto.randomUUID(), issueDate: now.date, issueTime: now.time, kind, docType, icv: i + 1, pih, supplyDate: now.date, payMeans: "10", reason: docType === "invoice" ? null : "اختبار امتثال", refNumber: docType === "invoice" ? null : kind === "standard" ? "CMP-1" : "CMP-4", lines, totals: computeTotals(lines) };
      const issues = validateDraft({ kind, docType, supplyDate: doc.supplyDate, reason: doc.reason, lines }, seller, buyer, docType === "invoice" ? null : { grossTotal: 1e9 }).filter((x) => x.level === "error");
      const s = stampDocument({ doc, seller, buyer, privatePem: keys.privatePem, certificateB64: complianceCert, signingTime: `${now.date}T${now.time}` });
      const local = verifyStoredDocument(s.xml, s.hash, s.signature, complianceCert);
      let ok = !issues.length && local.hashOk && local.signatureOk;
      let detail = issues.map((x) => x.msg).join("، ");
      if (ok && creds) {
        const r = await new FatooraClient(mode as ZatcaEnv).complianceInvoice(creds.token, creds.secret, { invoiceHash: s.hash, uuid: doc.uuid, invoice: Buffer.from(s.xml).toString("base64") });
        const v = r.data.validationResults;
        ok = v?.status === "PASS" || v?.status === "WARNING";
        detail = [...(v?.errorMessages ?? []), ...(v?.warningMessages ?? [])].map((m) => `${m.code}: ${m.message}`).join(" | ");
      }
      checks.push({ name, ok, detail: detail || undefined });
      pih = s.hash;
    }
    if (checks.some((c) => !c.ok)) return { ok: false, checks, error: "فشل فحص امتثال واحد أو أكثر" };

    let prodCert: string;
    if (creds) {
      const r = await new FatooraClient(mode as ZatcaEnv).productionCsid(creds.token, creds.secret, creds.requestId!);
      creds = { token: r.data.binarySecurityToken, secret: r.data.secret };
      prodCert = certificateFromToken(r.data.binarySecurityToken);
    } else {
      prodCert = issueSimulationCertificate(subject, keys.publicDer);
    }
    checks.push({ name: mode === "local" ? "شهادة الإنتاج (محاكاة محلية)" : "شهادة الإنتاج (Production CSID)", ok: true });
    const expires = parseCertificate(prodCert).notAfter;

    await tx(async (c) => {
      await q("UPDATE egs_units SET active = false WHERE org_id = $1 AND active", [orgId], c);
      await q(
        `INSERT INTO egs_units (org_id, env, serial, common_name, private_key_enc, certificate, csid_token_enc, csid_secret_enc, cert_expires_at, icv, last_hash, compliance_report)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,
        [orgId, mode, serial, commonName, encryptSecret(keys.privatePem), prodCert, creds ? encryptSecret(creds.token) : null, creds ? encryptSecret(creds.secret) : null, expires, FIRST_PIH, JSON.stringify(checks)],
        c,
      );
      await q("UPDATE organizations SET zatca_mode = $1, updated_at = now() WHERE id = $2", [mode, orgId], c);
      await audit({ orgId, userId, action: "egs.onboard", detail: `${mode} · ${serial.slice(-12)}` }, c);
    });
    return { ok: true, checks };
  } catch (e) {
    const msg = e instanceof FatooraError ? `منصة فاتورة ردّت بالخطأ ${e.status}: ${JSON.stringify(e.body).slice(0, 300)}` : e instanceof Error && e.name === "AbortError" ? "منصة فاتورة ما ردّت في الوقت المحدد" : `تعذر الاتصال بمنصة فاتورة: ${(e as Error).message}`;
    await audit({ orgId, userId, action: "egs.onboard_failed", detail: msg.slice(0, 300) });
    return { ok: false, checks, error: msg };
  }
}
