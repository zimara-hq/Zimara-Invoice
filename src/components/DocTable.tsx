import Link from "next/link";
import { docLabel, ZatcaPill } from "./Badges";
import { fmtDate, money } from "@/lib/time";

export interface DocRow { id: string; number: string; kind: string; doc_type: string; gross_total: number; zatca_status: string; zatca_mode: string; issued_at: string; buyer: string | null; balance?: number }

export function DocTable({ rows, compact = false }: { rows: DocRow[]; compact?: boolean }) {
  if (!rows.length)
    return (
      <div className="empty"><h3>ما فيه مستندات للحين</h3><p>أول فاتورة تصدرها بتظهر هنا مع حالتها في منصة فاتورة.</p><Link className="btn primary" href="/app/invoices/new">أصدر أول فاتورة</Link></div>
    );
  return (
    <div className="tbl">
      <table>
        <thead><tr><th>الرقم</th><th>النوع</th><th>العميل</th>{!compact && <th>التاريخ</th>}<th>الإجمالي</th><th>الهيئة</th>{!compact && <th>المتبقي</th>}</tr></thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id}>
              <td><Link className="rowlink num" href={`/app/invoices/${d.id}`}>{d.number}</Link></td>
              <td>{docLabel(d.kind, d.doc_type)}</td>
              <td>{d.buyer ?? "عميل نقدي"}</td>
              {!compact && <td>{fmtDate(d.issued_at)}</td>}
              <td><span className="num">{d.doc_type === "credit" ? "−" : ""}{money(d.gross_total)}</span> ر.س</td>
              <td><ZatcaPill status={d.zatca_status} mode={d.zatca_mode} /></td>
              {!compact && <td>{d.doc_type === "invoice" ? <span className="num">{money(d.balance ?? 0)}</span> : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
