import { FinNav } from "@/components/FinNav";
import { requireModule } from "@/lib/context";

export default async function FinancasLayout({ children }: { children: React.ReactNode }) {
  await requireModule("finance");
  return (<><FinNav />{children}</>);
}
