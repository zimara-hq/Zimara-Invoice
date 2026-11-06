import Link from "next/link";
import { one, q } from "@/lib/db";
import { issueBlocker, requireCtx, sellerOf } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { InvoiceForm, type FormCustomer, type FormProduct, type FormOriginal } from "@/components/forms/InvoiceForm";

export const metadata = { title: "فاتورة جديدة" };

export default async function NewInvoice({ searchParams }: { searchParams: Promise<{ ref?: string; type?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const customers = await q<FormCustomer>("SELECT id, kind, name, vat, crn, street, building, district, city, postal FROM customers WHERE org_id = $1 ORDER BY name", [ctx.org.id]);
  const products = await q<FormProduct>("SELECT id, name, price, vat_cat, exemption, unit FROM products WHERE org_id = $1 ORDER BY name", [ctx.org.id]);
  const egs = await one("SELECT 1 FROM egs_units WHERE org_id = $1 AND active", [ctx.org.id]);
  let original: FormOriginal | null = null;
  if (sp.ref && /^[0-9a-f-]{36}$/.test(sp.ref)) {
    original = await one<FormOriginal>("SELECT id, number, kind, customer_id, gross_total, lines FROM documents WHERE id = $1 AND org_id = $2 AND doc_type = 'invoice'", [sp.ref, ctx.org.id]);
  }
  const noteType = original ? (sp.type === "debit" ? "debit" : "credit") : null;
  const block = issueBlocker(ctx, !!egs);
  return (
    <div className="page">
      <PageHead title={noteType ? (noteType === "credit" ? "إشعار دائن" : "إشعار مدين") : "فاتورة جديدة"}>
        <Link className="btn" href="/app/invoices">رجوع</Link>
      </PageHead>
      {block && <div className="notice warn" style={{ marginBottom: 14 }}>{block}</div>}
      <InvoiceForm customers={customers} products={products} seller={sellerOf(ctx.org)} original={original} noteType={noteType} blocked={!!block} aiEnabled={!!process.env.ANTHROPIC_API_KEY} />
    </div>
  );
}
