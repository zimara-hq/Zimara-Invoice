import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { AuthShell } from "../AuthShell";
import { LoginForm } from "../Forms";

export const metadata = { title: "تسجيل الدخول" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await currentUser()) redirect("/app");
  const { next } = await searchParams;
  return <AuthShell><LoginForm next={next} /></AuthShell>;
}
