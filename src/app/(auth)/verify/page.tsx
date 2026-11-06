import Link from "next/link";
import { redirect } from "next/navigation";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";
import { consumeAuthToken } from "@/lib/auth/tokens";
import { Submit } from "@/components/Submit";
import { AuthShell } from "../AuthShell";

export const metadata = { title: "تأكيد البريد" };

async function confirm(fd: FormData) {
  "use server";
  const used = await consumeAuthToken("verify_email", String(fd.get("token") ?? ""));
  if (!used) redirect("/verify?status=invalid");
  await q("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [used.user_id]);
  await audit({ userId: used.user_id, action: "auth.email_verified" });
  redirect("/verify?status=ok");
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  return (
    <AuthShell>
      <form action={confirm}>
        <h1>تأكيد البريد الإلكتروني</h1>
        {status === "ok" ? (
          <><div className="notice ok">تم تأكيد بريدك.</div><Link className="btn primary block" href="/app">ادخل لحسابك</Link></>
        ) : status === "invalid" || !token ? (
          <><div className="notice bad">الرابط منتهي أو مستخدم. تقدر تطلب رابط جديد من داخل حسابك.</div><Link className="btn block" href="/app">حسابي</Link></>
        ) : (
          <><input type="hidden" name="token" value={token} /><p className="muted">اضغط الزر لتأكيد بريدك.</p><Submit className="btn primary block" pendingText="جاري التأكيد…">أكّد بريدي</Submit></>
        )}
      </form>
    </AuthShell>
  );
}
