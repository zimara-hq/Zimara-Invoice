import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { audit } from "@/lib/audit";

const PERIODS = new Set(["month", "quarter", "year"]);

export async function GET(req: Request) {
  const ctx = await requireCtx();
  const p = new URL(req.url).searchParams.get("period") ?? "quarter";
  const period = PERIODS.has(p) ? p : "quarter";
  const rows = await q<{ number: string; kind: string; doc_type: string; buyer: string | null; buyer_vat: string | null; issue_date: string; net_total: number; vat_total: number; gross_total: number; zatca_status: string }>(
    `SELECT number, kind, doc_type, buyer_snapshot->>'name' AS buyer, buyer_snapshot->>'vat' AS buyer_vat, issue_date, net_total, vat_total, gross_total, zatca_status
     FROM documents WHERE org_id = $1 AND date_trunc('${period}', issue_date) = date_trunc('${period}', (now() AT TIME ZONE 'Asia/Riyadh')::date) ORDER BY issue_date, number`,
    [ctx.org.id],
  );
  const cell = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // spreadsheet formula injection guard
    return `"${s.replace(/"/g, '""')}"`;
  };
  const sign = (r: { doc_type: string }) => (r.doc_type === "credit" ? -1 : 1);
  const lines = [["number", "type", "kind", "buyer", "buyer_vat", "issue_date", "net", "vat", "gross", "zatca_status"].join(",")].concat(
    rows.map((r) => [r.number, r.doc_type, r.kind, r.buyer ?? "", r.buyer_vat ?? "", r.issue_date, sign(r) * r.net_total, sign(r) * r.vat_total, sign(r) * r.gross_total, r.zatca_status].map(cell).join(",")),
  );
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "export.sales", detail: period });
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zimara-sales-${period}.csv"`, "Cache-Control": "private, no-store" },
  });
}
