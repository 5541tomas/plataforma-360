import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { Empty, PageHeader } from "@/components/ui";
import { ImportClient } from "./ImportClient";

export default async function ImportarPage() {
  const ctx = await requireModule("finance");
  const supabase = await createClient();
  const { data: accounts } = await supabase.from("accounts").select("id, name, bank, scope").eq("org_id", ctx.org.id).eq("archived", false).order("name");
  const writable = (accounts ?? []).filter((a) => a.scope === "personal" || ctx.perms.finance === "write");
  return (
    <>
      <PageHeader title="Importar extrato"><Link href="/financas" className="btn-ghost">‹ Finanças</Link></PageHeader>
      {writable.length === 0 ? <Empty>Cria primeiro uma conta em Finanças.</Empty> : <ImportClient accounts={writable} />}
    </>
  );
}
