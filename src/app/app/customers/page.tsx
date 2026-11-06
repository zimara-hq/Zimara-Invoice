import Link from "next/link";
import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { CustomerForm } from "@/components/forms/EntityForms";

export const metadata = { title: "العملاء" };

interface C { id: string; kind: string; name: string; vat: string | null; crn: string | null; phone: string | null; email: string | null; street: string | null; building: string | null; district: string | null; city: string | null; postal: string | null; docs: number }

export default async function Customers({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { org } = await requireCtx();
  const { edit } = await searchParams;
  const rows = await q<C>("SELECT c.*, (SELECT count(*)::int FROM documents d WHERE d.customer_id = c.id) AS docs FROM customers c WHERE c.org_id = $1 ORDER BY c.name", [org.id]);
  const editing = rows.find((r) => r.id === edit) ?? null;
  return (
    <div className="page">
      <PageHead title="العملاء" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(min(100%, 280px), 380px)", alignItems: "start" }}>
        {rows.length ? (
          <div className="tbl">
            <table>
              <thead><tr><th>العميل</th><th>الرقم الضريبي</th><th>المدينة</th><th>المستندات</th><th></th></tr></thead>
              <tbody>{rows.map((c) => <tr key={c.id}><td>{c.name}{c.kind === "individual" && <> <span className="pill">فرد</span></>}</td><td className="num">{c.vat ?? "—"}</td><td>{c.city ?? "—"}</td><td className="num">{c.docs}</td><td><Link href={`/app/customers?edit=${c.id}`}>تعديل</Link></td></tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="card empty"><h3>ما أضفت عملاء للحين</h3><p>أضف عملاءك من النموذج، والفاتورة الضريبية تحتاج اسم ورقم ضريبي وعنوان وطني.</p></div>
        )}
        <CustomerForm c={editing as unknown as Record<string, string | number | null> | null} />
      </div>
    </div>
  );
}
