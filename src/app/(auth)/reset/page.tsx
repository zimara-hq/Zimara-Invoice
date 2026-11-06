import { AuthShell } from "../AuthShell";
import { ResetForm } from "../Forms";

export const metadata = { title: "كلمة مرور جديدة" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <AuthShell><ResetForm token={token ?? ""} /></AuthShell>;
}
