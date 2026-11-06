import { q } from "@/lib/db";
import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { CompanyForm } from "@/components/forms/CompanyForm";
import { AccountForms } from "@/components/forms/AccountForms";
import { signOutEverywhere } from "../actions";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "الإعدادات" };

export default async function Settings() {
  const { org, user } = await requireCtx();
  const sessions = await q<{ created_at: string; last_seen_at: string; user_agent: string | null; ip: string | null }>("SELECT created_at, last_seen_at, user_agent, ip FROM sessions WHERE user_id = $1 AND expires_at > now() ORDER BY last_seen_at DESC", [user.id]);
  const me = (await q<{ marketing_opt_in: boolean }>("SELECT marketing_opt_in FROM users WHERE id = $1", [user.id]))[0];
  return (
    <div className="page">
      <PageHead title="الإعدادات" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <CompanyForm org={org} />
        <div className="stack">
          <AccountForms name={user.name} phone={user.phone ?? ""} marketing={me?.marketing_opt_in ?? false} />
          <div className="card">
            <h2>الأجهزة المسجلة</h2>
            <ul className="small" style={{ paddingInlineStart: 18 }}>{sessions.map((s, i) => <li key={i}>{(s.user_agent ?? "جهاز").slice(0, 60)} · آخر نشاط {fmtDateTime(s.last_seen_at)}</li>)}</ul>
            <form action={signOutEverywhere}><button className="btn danger">تسجيل الخروج من كل الأجهزة</button></form>
          </div>
          <div className="card">
            <h2>بياناتك وحقوقك</h2>
            <p className="small muted">حسب نظام حماية البيانات الشخصية تقدر تطلب نسخة من بياناتك أو تصحيحها أو إتلافها. الفواتير الصادرة يلزم حفظها 6 سنوات نظاماً. راسلنا من بريدك المسجل.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
