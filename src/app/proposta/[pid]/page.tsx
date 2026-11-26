import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { ProposalDoc } from "@/components/ProposalDoc";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Proposta" };

export default async function PrintProposal({ params }: { params: Promise<{ pid: string }> }) {
  const ctx = await requireModule("crm");
  const { pid } = await params;
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", pid).eq("org_id", ctx.org.id).maybeSingle();
  if (!p) notFound();
  const [{ data: org }, { data: deal }] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", ctx.org.id).single(),
    supabase.from("v_deals").select("title, company_name, contact_name, contact_email, duration_months").eq("id", p.deal_id).single(),
  ]);
  return <ProposalDoc p={p} org={org} deal={deal} preparedBy={ctx.name} toolbar={<><a href={`/crm/${p.deal_id}/proposta/${p.id}`} className="btn-ghost">‹ Editar</a><PrintButton /></>} />;
}
