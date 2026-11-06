"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const I: Record<string, React.ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h7M9 16h7" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.6 3.5 5.2" /></>,
  box: <><path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  shield: <><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" /><path d="M9 12l2 2 4-4" /></>,
  card: <><path d="M3 7h18v10H3z" /><path d="M3 11h18M7 15h3" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

export const NAV: ([string, string, string] | null)[] = [
  ["/app", "الرئيسية", "home"],
  ["/app/invoices", "المستندات", "doc"],
  ["/app/invoices/new", "فاتورة جديدة", "plus"],
  ["/app/customers", "العملاء", "users"],
  ["/app/products", "المنتجات والخدمات", "box"],
  ["/app/reports", "التقارير والضريبة", "chart"],
  null,
  ["/app/zatca", "الربط مع الهيئة", "link"],
  ["/app/audit", "سجل التدقيق", "shield"],
  ["/app/billing", "الاشتراك", "card"],
  ["/app/settings", "الإعدادات", "gear"],
];

export function NavLinks() {
  const path = usePathname();
  const active = (href: string) => (href === "/app" ? path === "/app" : href === "/app/invoices" ? path.startsWith("/app/invoices") && !path.startsWith("/app/invoices/new") : path.startsWith(href));
  return (
    <>
      {NAV.map((n, i) =>
        n ? (
          <Link key={n[0]} href={n[0]} className="nav" aria-current={active(n[0]) ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[n[2]]}</svg>
            <span>{n[1]}</span>
          </Link>
        ) : (
          <div key={"sep" + i} className="sep" />
        ),
      )}
    </>
  );
}
