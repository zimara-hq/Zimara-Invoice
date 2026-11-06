import { requireCtx } from "@/lib/org";
import { PageHead } from "@/components/PageHead";
import { CompanyForm } from "@/components/forms/CompanyForm";

export const metadata = { title: "تجهيز المنشأة" };

export default async function Setup() {
  const { org } = await requireCtx();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <PageHead title="الخطوة 1 من 2: بيانات المنشأة" />
      <CompanyForm org={org} from="setup" />
    </div>
  );
}
