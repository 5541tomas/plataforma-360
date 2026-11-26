"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";

import { MAX_ITEMS, type Item } from "@/lib/proposals";

export async function createProposal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  const { data: deal } = await supabase.from("deals").select("title, kind, value, duration_months").eq("id", dealId).single();
  if (!deal) throw new Error("Negócio não encontrado");
  const year = new Date().getFullYear();
  const { count } = await supabase.from("proposals").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).like("number", `${year}-%`);
  const number = `${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;
  const recurring = deal.kind === "retainer";
  const items: Item[] = [{ descricao: recurring ? `Avença mensal — ${deal.title}` : deal.title, qtd: 1, preco: Number(deal.value) }];
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data: p, error } = await supabase.from("proposals").insert({
    org_id: ctx.org.id, deal_id: dealId, number, items, total: Number(deal.value), valid_until: valid, recurring,
    title: `Proposta — ${deal.title}`,
    intro: "Na sequência da nossa conversa, apresentamos a proposta de serviços que responde aos objetivos identificados.",
    terms: recurring
      ? `Duração mínima de ${deal.duration_months} meses. Faturação mensal, a pagar até 15 dias após a emissão da fatura. Valores acrescidos de IVA à taxa legal em vigor.`
      : "50% na adjudicação e 50% na conclusão. Pagamento a 15 dias após a emissão da fatura. Valores acrescidos de IVA à taxa legal em vigor.",
  }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/crm/${dealId}/proposta/${p.id}`);
}

export async function saveProposal(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id")), dealId = String(formData.get("deal_id"));
  const items: Item[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const descricao = String(formData.get(`d${i}`) ?? "").trim();
    if (!descricao) continue;
    items.push({ descricao, qtd: Number(formData.get(`q${i}`) || 1), preco: Number(formData.get(`p${i}`) || 0) });
  }
  const total = Math.round(items.reduce((s, it) => s + it.qtd * it.preco, 0) * 100) / 100;
  const status = String(formData.get("status"));
  const { error } = await supabase.from("proposals").update({
    title: String(formData.get("title")), intro: String(formData.get("intro") ?? ""), terms: String(formData.get("terms") ?? ""),
    items, total, valid_until: String(formData.get("valid_until") || "") || null,
    vat_rate: Number(formData.get("vat_rate") ?? 23), recurring: formData.get("recurring") === "on",
    status, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);

  if (status === "accepted") {
    // Proposta aceite → negócio passa a "Ganho" (dispara receita recorrente e onboarding)
    const { data: deal } = await supabase.from("deals").select("pipeline_id, status").eq("id", dealId).single();
    if (deal && deal.status !== "won") {
      const { data: won } = await supabase.from("stages").select("id").eq("pipeline_id", deal.pipeline_id).eq("is_won", true).limit(1).maybeSingle();
      if (won) await supabase.from("deals").update({ stage_id: won.id }).eq("id", dealId);
    }
  }
  if (status === "sent") {
    await supabase.from("activities").insert({ org_id: (await requireModule("crm")).org.id, deal_id: dealId, type: "note", summary: `Proposta enviada (${total.toLocaleString("pt-PT")} €).` });
  }
  revalidatePath(`/crm/${dealId}`); revalidatePath("/crm"); revalidatePath("/");
  redirect(formData.get("then") === "print" ? `/proposta/${id}` : `/crm/${dealId}/proposta/${id}?ok=1`);
}

export async function deleteProposal(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  await supabase.from("proposals").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/crm/${dealId}`);
  redirect(`/crm/${dealId}`);
}

export async function saveProposalAndPrint(formData: FormData) {
  formData.set("then", "print");
  return saveProposal(formData);
}
