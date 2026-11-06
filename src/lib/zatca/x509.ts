/**
 * CSR generation (with ZATCA's required extensions), X.509 parsing, and a local
 * simulation CA used when an organisation runs in "local" mode without Fatoora.
 */
import crypto from "node:crypto";
import * as A from "./asn1";
import { generateKeyPair, sign } from "./crypto";

const OID = {
  C: "2.5.4.6",
  O: "2.5.4.10",
  OU: "2.5.4.11",
  CN: "2.5.4.3",
  SN: "2.5.4.4",
  UID: "0.9.2342.19200300.100.1.1",
  title: "2.5.4.12",
  registeredAddress: "2.5.4.26",
  businessCategory: "2.5.4.15",
  DC: "0.9.2342.19200300.100.1.25",
  emailAddress: "1.2.840.113549.1.9.1",
  ecdsaSha256: "1.2.840.10045.4.3.2",
  extensionRequest: "1.2.840.113549.1.9.14",
  certTemplateName: "1.3.6.1.4.1.311.20.2",
  subjectAltName: "2.5.29.17",
};
const SHORT: Record<string, string> = Object.fromEntries(Object.entries(OID).map(([k, v]) => [v, k]));

export type ZatcaEnv = "developer-portal" | "simulation" | "production";
export const TEMPLATE_NAME: Record<ZatcaEnv, string> = {
  "developer-portal": "TSTZATCA-Code-Signing",
  simulation: "PREZATCA-Code-Signing",
  production: "ZATCA-Code-Signing",
};

function rdn(type: string, value: string, printableOk = false): A.Der {
  const v = printableOk && /^[A-Za-z0-9 '()+,\-./:=?]*$/.test(value) ? A.printable(value) : A.utf8(value);
  return A.set(A.seq(A.oid(type), v));
}

export interface CsrInput {
  privatePem: string;
  publicDer: Buffer;
  env: ZatcaEnv;
  commonName: string; // e.g. "Zimara-EGS-1"
  serialNumber: string; // "1-Zimara|2-1.0|3-<uuid>"
  vat: string; // organisation identifier (UID)
  orgUnit: string; // branch name, or 10-digit TIN for VAT groups
  orgName: string;
  invoiceType: string; // "1100" = standard + simplified
  location: string; // registeredAddress
  industry: string; // businessCategory
}

export function buildCsr(i: CsrInput): { pem: string; base64ForZatca: string; der: Buffer } {
  const subject = A.seq(rdn(OID.C, "SA", true), rdn(OID.OU, i.orgUnit), rdn(OID.O, i.orgName), rdn(OID.CN, i.commonName));
  const dirName = A.seq(
    rdn(OID.SN, i.serialNumber),
    rdn(OID.UID, i.vat),
    rdn(OID.title, i.invoiceType),
    rdn(OID.registeredAddress, i.location),
    rdn(OID.businessCategory, i.industry),
  );
  const extensions = A.seq(
    A.seq(A.oid(OID.certTemplateName), A.octets(A.printable(TEMPLATE_NAME[i.env]))),
    A.seq(A.oid(OID.subjectAltName), A.octets(A.seq(A.ctx(4, dirName)))),
  );
  const attributes = A.ctx(0, A.seq(A.oid(OID.extensionRequest), A.set(extensions)));
  const info = A.seq(A.integer(0), subject, i.publicDer, attributes);
  const sig = sign(info, i.privatePem);
  const der = A.seq(info, A.seq(A.oid(OID.ecdsaSha256)), A.bitString(sig));
  const pem = A.derToPem(der, "CERTIFICATE REQUEST");
  return { pem, der, base64ForZatca: Buffer.from(pem, "utf8").toString("base64") };
}

/* ---------- X.509 parsing ---------- */

export interface ParsedCert {
  der: Buffer;
  base64: string;
  serialDecimal: string;
  issuerName: string; // RFC 2253 style, most-specific first
  subjectName: string;
  notBefore: string;
  notAfter: string;
  publicKeyDer: Buffer;
  signature: Buffer;
}

function nameToString(nameNode: A.Node): string {
  const parts: string[] = [];
  for (const set of nameNode.children ?? []) {
    for (const atv of set.children ?? []) {
      const [o, v] = atv.children ?? [];
      const oidStr = A.decodeOid(o.value);
      parts.push(`${SHORT[oidStr] ?? oidStr}=${v.value.toString("utf8")}`);
    }
  }
  return parts.reverse().join(", ");
}

function timeToIso(n: A.Node): string {
  const s = n.value.toString("ascii");
  if (n.tag === 0x17) {
    const yy = Number(s.slice(0, 2));
    return `${yy < 50 ? 2000 + yy : 1900 + yy}-${s.slice(2, 4)}-${s.slice(4, 6)}T${s.slice(6, 8)}:${s.slice(8, 10)}:${s.slice(10, 12)}Z`;
  }
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
}

/** Accepts DER, base64 of DER, or a PEM. */
export function parseCertificate(input: Buffer | string): ParsedCert {
  const der = Buffer.isBuffer(input) ? input : input.includes("BEGIN") ? A.pemToDer(input) : Buffer.from(input.replace(/\s+/g, ""), "base64");
  const [cert] = A.decode(der);
  const [tbs, , sigBits] = cert.children!;
  const t = tbs.children!;
  let k = 0;
  if (t[0].tag === 0xa0) k = 1;
  const serial = BigInt("0x" + (t[k].value.toString("hex") || "0"));
  const issuer = t[k + 2];
  const validity = t[k + 3].children!;
  const subject = t[k + 4];
  const spki = t[k + 5];
  return {
    der,
    base64: der.toString("base64"),
    serialDecimal: serial.toString(10),
    issuerName: nameToString(issuer),
    subjectName: nameToString(subject),
    notBefore: timeToIso(validity[0]),
    notAfter: timeToIso(validity[1]),
    publicKeyDer: Buffer.from(spki.raw),
    signature: Buffer.from(sigBits.value.subarray(1)),
  };
}

/* ---------- local simulation CA ---------- */

let simCa: { privatePem: string; publicDer: Buffer } | null = null;
function simCaKey() {
  if (!simCa) simCa = generateKeyPair();
  return simCa;
}

/** Issue a real X.509 certificate from a local simulation CA (never trusted by ZATCA). */
export function issueSimulationCertificate(csrSubject: { commonName: string; orgName: string; orgUnit: string }, publicDer: Buffer, days = 365): string {
  const ca = simCaKey();
  const now = new Date();
  const exp = new Date(now.getTime() + days * 864e5);
  const issuer = A.seq(rdn(OID.DC, "local", true), rdn(OID.DC, "zimara", true), rdn(OID.CN, "Zimara Simulation CA (not ZATCA)"));
  const subject = A.seq(rdn(OID.C, "SA", true), rdn(OID.OU, csrSubject.orgUnit), rdn(OID.O, csrSubject.orgName), rdn(OID.CN, csrSubject.commonName));
  const serial = BigInt("0x" + crypto.randomBytes(12).toString("hex"));
  const tbs = A.seq(A.ctx(0, A.integer(2)), A.integer(serial), A.seq(A.oid(OID.ecdsaSha256)), issuer, A.seq(A.utcTime(now), A.utcTime(exp)), subject, publicDer);
  const der = A.seq(tbs, A.seq(A.oid(OID.ecdsaSha256)), A.bitString(sign(tbs, ca.privatePem)));
  return der.toString("base64");
}
