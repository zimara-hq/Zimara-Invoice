import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { AuthShell } from "../AuthShell";
import { SignupForm } from "../Forms";

export const metadata = { title: "إنشاء حساب" };

export default async function Page() {
  if (await currentUser()) redirect("/app");
  return <AuthShell><SignupForm /></AuthShell>;
}
