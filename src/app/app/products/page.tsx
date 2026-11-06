import Link from "next/link";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { ProductForm } from "@/components/forms/EntityForms";
import { CAT_NAMES, type VatCategory } from "@/lib/zatca/model";
import { money } from "@/lib/time";

export const metadata = { title: "المنتجات والخدمات" };

export default async function Products({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { org } = await requireCtx();
  const { edit } = await searchParams;
  const rows = await q<{ id: string; name: string; price: number; vat_cat: VatCategory; exemption: string | null; unit: string }>("SELECT id, name, price, vat_cat, exemption, unit FROM products WHERE org_id = $1 ORDER BY name", [org.id]);
  const editing = rows.find((r) => r.id === edit) ?? null;
  return (
    <div className="page">
      <PageHead title="المنتجات والخدمات" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(min(100%, 280px), 380px)", alignItems: "start" }}>
        {rows.length ? (
          <div className="tbl">
            <table>
              <thead><tr><th>المنتج أو الخدمة</th><th>السعر</th><th>الضريبة</th><th></th></tr></thead>
              <tbody>{rows.map((p) => <tr key={p.id}><td>{p.name}</td><td><span className="num">{money(p.price)}</span> ر.س</td><td>{CAT_NAMES[p.vat_cat]}</td><td><Link href={`/app/products?edit=${p.id}`}>تعديل</Link></td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="card empty"><h3>ما أضفت منتجات للحين</h3><p>أضف منتجاتك وخدماتك بأسعارها عشان تختارها بسرعة في الفاتورة.</p></div>
        )}
        <ProductForm p={editing as unknown as Record<string, string | number | null> | null} />
      </div>
    </div>
  );
}
