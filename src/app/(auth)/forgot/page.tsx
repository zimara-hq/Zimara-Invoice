import { AuthShell } from "../AuthShell";
import { ForgotForm } from "../Forms";

export const metadata = { title: "استرجاع كلمة المرور" };

export default function Page() {
  return <AuthShell><ForgotForm /></AuthShell>;
}
