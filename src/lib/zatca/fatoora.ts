/**
 * Client for ZATCA's Fatoora e-invoicing APIs (compliance, production CSID, clearance, reporting).
 * Endpoints and headers follow ZATCA's published developer documentation (API version V2).
 */
import type { ZatcaEnv } from "./x509";

export const FATOORA_BASE: Record<ZatcaEnv, string> = {
  "developer-portal": process.env.ZATCA_BASE_DEVELOPER ?? "https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal",
  simulation: process.env.ZATCA_BASE_SIMULATION ?? "https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation",
  production: process.env.ZATCA_BASE_PRODUCTION ?? "https://gw-fatoora.zatca.gov.sa/e-invoicing/core",
};

export interface CsidResponse {
  requestID: string | number;
  dispositionMessage?: string;
  binarySecurityToken: string;
  secret: string;
}

export interface ValidationMessage { type?: string; code?: string; category?: string; message?: string; status?: string }
export interface SubmissionResponse {
  validationResults?: { status?: string; infoMessages?: ValidationMessage[]; warningMessages?: ValidationMessage[]; errorMessages?: ValidationMessage[] };
  reportingStatus?: string;
  clearanceStatus?: string;
  clearedInvoice?: string;
  qrSellertStatus?: string;
  qrBuyertStatus?: string;
}

export class FatooraError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
  }
}

export interface InvoicePayload { invoiceHash: string; uuid: string; invoice: string /* base64 XML */ }

/** binarySecurityToken is base64 of the base64 certificate. */
export function certificateFromToken(token: string): string {
  return Buffer.from(token, "base64").toString("utf8");
}

export class FatooraClient {
  constructor(private env: ZatcaEnv, private timeoutMs = 20000) {}

  private async call<T>(path: string, body: unknown, headers: Record<string, string>, okStatuses = [200]): Promise<{ status: number; data: T }> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(FATOORA_BASE[this.env] + path, {
        method: path.startsWith("/production/csids") && !body ? "PATCH" : "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "Accept-Language": "en", "Accept-Version": "V2", ...headers },
        body: JSON.stringify(body ?? {}),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: unknown = text;
      try { data = text ? JSON.parse(text) : {}; } catch { /* keep raw text */ }
      if (!okStatuses.includes(res.status)) throw new FatooraError(`Fatoora ${path} returned ${res.status}`, res.status, data);
      return { status: res.status, data: data as T };
    } finally {
      clearTimeout(t);
    }
  }

  private basic(token: string, secret: string) {
    return { Authorization: "Basic " + Buffer.from(`${token}:${secret}`).toString("base64") };
  }

  /** Step 1: exchange the taxpayer's OTP + CSR for a compliance CSID. */
  complianceCsid(otp: string, csrBase64: string) {
    return this.call<CsidResponse>("/compliance", { csr: csrBase64 }, { OTP: otp });
  }

  /** Step 2: submit sample documents for the compliance checks. */
  complianceInvoice(token: string, secret: string, p: InvoicePayload) {
    return this.call<SubmissionResponse>("/compliance/invoices", p, this.basic(token, secret), [200, 202]);
  }

  /** Step 3: exchange the compliance request ID for a production CSID. */
  productionCsid(token: string, secret: string, complianceRequestId: string | number) {
    return this.call<CsidResponse>("/production/csids", { compliance_request_id: String(complianceRequestId) }, this.basic(token, secret));
  }

  /** Standard (B2B) documents: clearance before sharing with the buyer. */
  clearance(token: string, secret: string, p: InvoicePayload) {
    return this.call<SubmissionResponse>("/invoices/clearance/single", p, { ...this.basic(token, secret), "Clearance-Status": "1" }, [200, 202, 400]);
  }

  /** Simplified (B2C) documents: report within 24 hours. */
  reporting(token: string, secret: string, p: InvoicePayload) {
    return this.call<SubmissionResponse>("/invoices/reporting/single", p, { ...this.basic(token, secret), "Clearance-Status": "0" }, [200, 202, 400]);
  }
}
