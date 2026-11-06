import { NextResponse } from "next/server";
import { one } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { audit } from "@/lib/audit";

// ZATCA naming convention for stored invoices: VAT number + timestamp + invoice reference.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const d = await one<{ number: string; xml: string; cleared_xml: string | null; issue_date: string; issue_time: string; seller_snapshot: { vat: string } }>(
    "SELECT number, xml, cleared_xml, issue_date, issue_time, seller_snapshot FROM documents WHERE id = $1 AND org_id = $2",
    [id, ctx.org.id],
  );
  if (!d) return new NextResponse("Not found", { status: 404 });
  const name = `${d.seller_snapshot.vat}_${d.issue_date.replace(/-/g, "")}T${d.issue_time.replace(/:/g, "")}_${d.number}.xml`;
  await audit({ orgId: ctx.org.id, userId: ctx.user.id, action: "document.download_xml", detail: d.number });
  return new NextResponse(d.cleared_xml ?? d.xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
