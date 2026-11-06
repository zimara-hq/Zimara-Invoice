/**
 * Issuing and submitting e-invoices. Framework-free so it can be tested directly.
 */
import crypto from "node:crypto";
import { z } from "zod";
import { one, q, tx } from "./db";
import { audit } from "./audit";
import { decryptSecret } from "./zatca/crypto";
import { computeTotals, type DocKind, type DocType, type LineInput, type Party } from "./zatca/model";
import { stampDocument } from "./zatca/sign";
import { validateDraft, type Issue } from "./zatca/validate";
import { FatooraClient, FatooraError, type SubmissionResponse } from "./zatca/fatoora";
import { riyadhNow } from "./time";
import type { ZatcaEnv } from "./zatca/x509";

export const LineSchema = z.object({
  name: z.string().trim().min(1).max(300),
  qty: z.coerce.number().positive().max(1e9),
  price: z.coerce.number().min(0).max(1e12),
  discount: z.coerce.number().min(0).max(1e12).default(0),
  cat: z.enum(["S", "Z", "E", "O"]),
  reason: z.string().max(40).nullish(),
  unit: z.string().max(10).nullish(),
});

export const DraftSchema = z.object({
  kind: z.enum(["standard", "simplified"]),
  docType: z.enum(["invoice", "credit", "debit"]),
  customerId: z.string().uuid().nullish(),
  refId: z.string().uuid().nullish(),
  supplyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal("")),
  payMeans: z.enum(["10", "30", "48", "1"]).default("10"),
  notes: z.string().max(1000).nullish(),
  reason: z.string().max(500).nullish(),
  lines: z.array(LineSchema).min(1).max(500),
});
export type Draft = z.infer<typeof DraftSchema>;

export class IssueError extends Error {
  constructor(message: string, public issues: Issue[] = []) {
    super(message);
  }
}

interface OrgRow {
  id: string; name_ar: string; vat: string | null; crn: string | null; street: string | null; building: string | null;
  district: string | null; city: string | null; postal: string | null; zatca_mode: string;
}
interface CustomerRow { id: string; name: string; vat: string | null; crn: string | null; street: string | null; building: string | null; district: string | null; city: string | null; postal: string | null; country: string }

const PREFIX: Record<string, string> = { "invoice:standard": "INV", "invoice:simplified": "SIN", credit: "CRN", debit: "DBN" };

function toParty(c: CustomerRow | null): Party | null {
  if (!c) return null;
  return { name: c.name, vat: c.vat, crn: c.crn, street: c.street, building: c.building, district: c.district, city: c.city, postal: c.postal, country: c.country };
}

export async function issueDocument(orgId: string, userId: string, input: unknown): Promise<{ id: string; number: string; warnings: Issue[] }> {
  const parsed = DraftSchema.safeParse(input);
  if (!parsed.success) throw new IssueError("بيانات المستند غير مكتملة أو غير صحيحة");
  const d = parsed.data;

  const org = await one<OrgRow>("SELECT * FROM organizations WHERE id = $1", [orgId]);
  if (!org) throw new IssueError("المنشأة غير موجودة");
  const seller = { nameAr: org.name_ar, vat: org.vat ?? "", crn: org.crn ?? "", street: org.street, building: org.building, district: org.district, city: org.city, postal: org.postal, country: "SA" };

  let original: { id: string; number: string; kind: DocKind; customer_id: string | null; gross_total: number; doc_type: DocType } | null = null;
  if (d.docType !== "invoice") {
    if (!d.refId) throw new IssueError("الإشعار لازم يشير للفاتورة الأصلية");
    original = await one("SELECT id, number, kind, customer_id, gross_total, doc_type FROM documents WHERE id = $1 AND org_id = $2", [d.refId, orgId]);
    if (!original || original.doc_type !== "invoice") throw new IssueError("الفاتورة الأصلية غير موجودة");
    d.kind = original.kind;
    d.customerId = original.customer_id;
  }
  const customer = d.customerId ? await one<CustomerRow>("SELECT * FROM customers WHERE id = $1 AND org_id = $2", [d.customerId, orgId]) : null;
  if (d.customerId && !customer) throw new IssueError("العميل غير موجود");
  const buyer = toParty(customer);
  if (!d.supplyDate) d.supplyDate = riyadhNow().date;
  const lines: LineInput[] = d.lines.map((l) => ({ ...l, reason: l.cat === "S" ? null : l.reason ?? null, unit: l.unit || "PCE" }));

  const issues = validateDraft({ kind: d.kind, docType: d.docType, supplyDate: d.supplyDate, reason: d.reason, lines }, seller, buyer, original ? { grossTotal: original.gross_total } : null);
  if (issues.some((i) => i.level === "error")) throw new IssueError("فيه أخطاء لازم تتصحح قبل الإصدار", issues);

  const result = await tx(async (c) => {
    const egs = await one<{ id: string; env: string; icv: number; last_hash: string; private_key_enc: string; certificate: string }>(
      "SELECT id, env, icv, last_hash, private_key_enc, certificate FROM egs_units WHERE org_id = $1 AND active FOR UPDATE",
      [orgId],
      c,
    );
    if (!egs) throw new IssueError("فعّل الربط مع الهيئة أول");
    const now = riyadhNow();
    const prefix = PREFIX[d.docType === "invoice" ? `invoice:${d.kind}` : d.docType];
    const seqRow = await one<{ n: number }>("SELECT count(*)::int + 1 AS n FROM documents WHERE org_id = $1 AND number LIKE $2", [orgId, `${prefix}-${now.year}-%`], c);
    const number = `${prefix}-${now.year}-${String(seqRow!.n).padStart(5, "0")}`;
    const icv = Number(egs.icv) + 1;
    const totals = computeTotals(lines);
    const doc = {
      number, uuid: crypto.randomUUID(), issueDate: now.date, issueTime: now.time, kind: d.kind, docType: d.docType, icv, pih: egs.last_hash,
      supplyDate: d.supplyDate || now.date, payMeans: d.payMeans, notes: d.notes || null, reason: d.docType === "invoice" ? null : d.reason, refNumber: original?.number ?? null,
      lines, totals,
    };
    const stamp = stampDocument({ doc, seller, buyer, privatePem: decryptSecret(egs.private_key_enc), certificateB64: egs.certificate, signingTime: `${now.date}T${now.time}` });
    const row = await one<{ id: string }>(
      `INSERT INTO documents (org_id, egs_id, number, uuid, kind, doc_type, icv, pih, hash, signature, qr, xml, issue_date, issue_time, supply_date, due_date,
         pay_means, notes, reason, ref_document_id, customer_id, seller_snapshot, buyer_snapshot, lines, totals, net_total, vat_total, gross_total, issued_by, zatca_status, zatca_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'pending',$30) RETURNING id`,
      [orgId, egs.id, number, doc.uuid, d.kind, d.docType, icv, doc.pih, stamp.hash, stamp.signature, stamp.qr, stamp.xml, now.date, now.time, doc.supplyDate,
        d.dueDate || null, d.payMeans, doc.notes, doc.reason, original?.id ?? null, customer?.id ?? null, JSON.stringify(seller), buyer ? JSON.stringify(buyer) : null,
        JSON.stringify(lines), JSON.stringify(totals), totals.net, totals.vat, totals.gross, userId, egs.env],
      c,
    );
    await q("UPDATE egs_units SET icv = $1, last_hash = $2 WHERE id = $3", [icv, stamp.hash, egs.id], c);
    await audit({ orgId, userId, action: "document.issue", detail: `${number} · ${totals.gross.toFixed(2)} ر.س` }, c);
    return { id: row!.id, number };
  });

  await submitDocument(result.id).catch(() => undefined);
  return { ...result, warnings: issues.filter((i) => i.level === "warning") };
}

/** Clearance (B2B) or reporting (B2C). Safe to call repeatedly; only pending/failed documents are sent. */
export async function submitDocument(documentId: string): Promise<string> {
  const d = await one<{ id: string; org_id: string; kind: DocKind; hash: string; uuid: string; xml: string; zatca_status: string; zatca_mode: string; egs_id: string; number: string }>(
    "SELECT id, org_id, kind, hash, uuid, xml, zatca_status, zatca_mode, egs_id, number FROM documents WHERE id = $1",
    [documentId],
  );
  if (!d || !["pending", "failed"].includes(d.zatca_status)) return d?.zatca_status ?? "missing";

  if (d.zatca_mode === "local") {
    const status = d.kind === "standard" ? "cleared" : "reported";
    await q("UPDATE documents SET zatca_status = $1, zatca_at = now(), zatca_response = $2, submit_attempts = submit_attempts + 1 WHERE id = $3", [status, JSON.stringify({ mode: "local", note: "محاكاة محلية: لم يُرسل للهيئة" }), d.id]);
    await audit({ orgId: d.org_id, action: "zatca." + (status === "cleared" ? "clear" : "report"), detail: `${d.number} (محاكاة محلية)` });
    return status;
  }

  const egs = await one<{ csid_token_enc: string; csid_secret_enc: string }>("SELECT csid_token_enc, csid_secret_enc FROM egs_units WHERE id = $1", [d.egs_id]);
  if (!egs?.csid_token_enc) throw new Error("EGS has no production CSID");
  const client = new FatooraClient(d.zatca_mode as ZatcaEnv);
  const payload = { invoiceHash: d.hash, uuid: d.uuid, invoice: Buffer.from(d.xml, "utf8").toString("base64") };
  const token = decryptSecret(egs.csid_token_enc);
  const secret = decryptSecret(egs.csid_secret_enc);
  try {
    const res = d.kind === "standard" ? await client.clearance(token, secret, payload) : await client.reporting(token, secret, payload);
    const body: SubmissionResponse = res.data;
    const okStatus = d.kind === "standard" ? body.clearanceStatus === "CLEARED" : body.reportingStatus === "REPORTED";
    const status = okStatus ? (d.kind === "standard" ? "cleared" : "reported") : "rejected";
    const cleared = d.kind === "standard" && body.clearedInvoice ? Buffer.from(body.clearedInvoice, "base64").toString("utf8") : null;
    await q("UPDATE documents SET zatca_status = $1, zatca_at = now(), zatca_response = $2, cleared_xml = COALESCE(cleared_xml, $3), submit_attempts = submit_attempts + 1 WHERE id = $4", [status, JSON.stringify(body), cleared, d.id]);
    await audit({ orgId: d.org_id, action: "zatca." + status, detail: d.number });
    return status;
  } catch (e) {
    const detail = e instanceof FatooraError ? { status: e.status, body: e.body } : { error: String(e) };
    await q("UPDATE documents SET zatca_status = 'failed', zatca_response = $1, submit_attempts = submit_attempts + 1 WHERE id = $2", [JSON.stringify(detail), d.id]);
    await audit({ orgId: d.org_id, action: "zatca.failed", detail: d.number });
    return "failed";
  }
}

/** Retry queue for documents that could not reach Fatoora. Simplified invoices must be reported within 24 hours. */
export async function retryPending(limit = 50) {
  const rows = await q<{ id: string }>("SELECT id FROM documents WHERE zatca_status IN ('pending','failed') AND submit_attempts < 20 ORDER BY issued_at LIMIT $1", [limit]);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = await submitDocument(r.id).catch(() => "failed");
  return out;
}

export async function balanceOf(orgId: string, documentId: string) {
  const r = await one<{ balance: number }>(
    `SELECT d.gross_total
       - COALESCE((SELECT sum(amount) FROM payments p WHERE p.document_id = d.id), 0)
       - COALESCE((SELECT sum(gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type = 'credit' AND c.zatca_status IN ('cleared','reported')), 0)
       + COALESCE((SELECT sum(gross_total) FROM documents c WHERE c.ref_document_id = d.id AND c.doc_type = 'debit' AND c.zatca_status IN ('cleared','reported')), 0) AS balance
     FROM documents d WHERE d.id = $1 AND d.org_id = $2`,
    [documentId, orgId],
  );
  return r ? Math.round(r.balance * 100) / 100 : 0;
}
