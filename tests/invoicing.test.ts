/**
 * Integration tests against a real PostgreSQL database.
 * Run with TEST_DATABASE_URL pointing at an empty, migrated database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

const url = process.env.TEST_DATABASE_URL;
const d = url ? describe : describe.skip;

d("issuing against PostgreSQL", () => {
  let db: typeof import("@/lib/db");
  let inv: typeof import("@/lib/invoicing");
  let onb: typeof import("@/lib/onboarding");
  let sign: typeof import("@/lib/zatca/sign");
  let orgId = "";
  let userId = "";
  let customerId = "";

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    process.env.ZIMARA_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
    db = await import("@/lib/db");
    inv = await import("@/lib/invoicing");
    onb = await import("@/lib/onboarding");
    sign = await import("@/lib/zatca/sign");
    const email = `t${Date.now()}@example.sa`;
    userId = (await db.one<{ id: string }>("INSERT INTO users(email,name,password_hash,terms_version,terms_accepted_at,email_verified_at) VALUES ($1,'مختبر','x','2026-11',now(),now()) RETURNING id", [email]))!.id;
    orgId = (await db.one<{ id: string }>(
      "INSERT INTO organizations(name_ar,vat,crn,street,building,district,city,postal,trial_ends_at) VALUES ('شركة الاختبار','300000000000003','1010101010','طريق الملك فهد','1234','النقرة','حائل','55431', now() + interval '14 days') RETURNING id",
    ))!.id;
    await db.q("INSERT INTO memberships(org_id,user_id,role) VALUES ($1,$2,'owner')", [orgId, userId]);
    customerId = (await db.one<{ id: string }>(
      "INSERT INTO customers(org_id,name,vat,street,building,district,city,postal) VALUES ($1,'مؤسسة النور','311111111111113','شارع التحلية','4321','الروضة','جدة','54321') RETURNING id",
      [orgId],
    ))!.id;
  });

  afterAll(async () => {
    await db?.pool().end();
  });

  it("onboards an EGS unit in local mode and passes the six compliance checks", async () => {
    const r = await onb.onboard(orgId, userId, "local", "123456");
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
    expect(r.checks.filter((c) => c.ok).length).toBe(8);
  });

  it("issues a chained, signed B2B invoice, a B2C invoice and a credit note", async () => {
    const a = await inv.issueDocument(orgId, userId, { kind: "standard", docType: "invoice", customerId, supplyDate: "2026-11-06", payMeans: "30", lines: [{ name: "استشارة", qty: 3, price: 450, cat: "S" }] });
    const b = await inv.issueDocument(orgId, userId, { kind: "simplified", docType: "invoice", lines: [{ name: "بيع نقدي", qty: 1, price: 100, cat: "S" }] });
    const c = await inv.issueDocument(orgId, userId, { kind: "standard", docType: "credit", refId: a.id, reason: "خصم بعد التسليم", lines: [{ name: "استشارة", qty: 1, price: 450, cat: "S" }] });
    expect(a.number).toMatch(/^INV-\d{4}-00001$/);
    expect(b.number).toMatch(/^SIN-\d{4}-00001$/);
    expect(c.number).toMatch(/^CRN-\d{4}-00001$/);
    const rows = await db.q<{ icv: number; pih: string; hash: string; xml: string; signature: string; zatca_status: string; certificate: string }>(
      "SELECT d.icv, d.pih, d.hash, d.xml, d.signature, d.zatca_status, e.certificate FROM documents d JOIN egs_units e ON e.id = d.egs_id WHERE d.org_id = $1 ORDER BY d.icv",
      [orgId],
    );
    expect(rows.map((r) => r.icv)).toEqual([1, 2, 3]);
    expect(rows[1].pih).toBe(rows[0].hash);
    expect(rows[2].pih).toBe(rows[1].hash);
    expect(rows.map((r) => r.zatca_status)).toEqual(["cleared", "reported", "cleared"]);
    for (const r of rows) expect(sign.verifyStoredDocument(r.xml, r.hash, r.signature, r.certificate)).toEqual({ hashOk: true, signatureOk: true });
    expect(await inv.balanceOf(orgId, a.id)).toBe(1552.5 - 517.5);
  });

  it("rejects invalid drafts before anything is written", async () => {
    await expect(inv.issueDocument(orgId, userId, { kind: "standard", docType: "invoice", lines: [{ name: "x", qty: 1, price: 1, cat: "Z" }] })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ code: "BR-KSA-69" })]) });
    const n = await db.one<{ n: number }>("SELECT count(*)::int n FROM documents WHERE org_id = $1", [orgId]);
    expect(n!.n).toBe(3);
  });

  it("blocks editing, deleting and truncating issued documents, and resetting the counter", async () => {
    await expect(db.q("UPDATE documents SET gross_total = 1 WHERE org_id = $1", [orgId])).rejects.toThrow(/cannot be modified/);
    await expect(db.q("UPDATE documents SET xml = 'x' WHERE org_id = $1", [orgId])).rejects.toThrow(/cannot be modified/);
    await expect(db.q("DELETE FROM documents WHERE org_id = $1", [orgId])).rejects.toThrow(/cannot be deleted/);
    await expect(db.q("TRUNCATE documents CASCADE")).rejects.toThrow(/TRUNCATE is not allowed/);
    await expect(db.q("UPDATE egs_units SET icv = 0 WHERE org_id = $1", [orgId])).rejects.toThrow(/cannot be reset/);
    await expect(db.q("UPDATE documents SET zatca_status = 'pending' WHERE org_id = $1", [orgId])).rejects.toThrow(/cannot change status/);
  });

  it("keeps the audit log append-only", async () => {
    const n = await db.one<{ n: number }>("SELECT count(*)::int n FROM audit_log WHERE org_id = $1", [orgId]);
    expect(n!.n).toBeGreaterThanOrEqual(7);
    await expect(db.q("UPDATE audit_log SET detail = 'x' WHERE org_id = $1", [orgId])).rejects.toThrow(/append-only/);
    await expect(db.q("DELETE FROM audit_log WHERE org_id = $1", [orgId])).rejects.toThrow(/append-only/);
  });

  it("serialises concurrent issuance so the chain never forks", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => inv.issueDocument(orgId, userId, { kind: "simplified", docType: "invoice", lines: [{ name: `بند ${i}`, qty: 1, price: 10 + i, cat: "S" }] })),
    );
    expect(new Set(results.map((r) => r.number)).size).toBe(6);
    const rows = await db.q<{ icv: number; pih: string; hash: string }>("SELECT icv, pih, hash FROM documents WHERE org_id = $1 ORDER BY icv", [orgId]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].icv).toBe(rows[i - 1].icv + 1);
      expect(rows[i].pih).toBe(rows[i - 1].hash);
    }
  });
});
