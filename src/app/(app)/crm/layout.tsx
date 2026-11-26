import { CrmNav } from "@/components/CrmNav";
import { requireModule } from "@/lib/context";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireModule("crm");
  return (<><CrmNav />{children}</>);
}
