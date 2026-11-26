"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { MAX_ITEMS, MAX_PHASES, templateFor, type Item, type Phase } from "@/lib/proposals";

export async function createProposal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  const { data: deal } = await supabase.from("v_deals").select("title, kind, value, quantity, duration_months, product_name, company_name, ai_brief").eq("id", dealId).single();
  if (!deal) throw new Error("Negócio não encontrado");
  const year = new Date().getFullYear();
  const { count } = await supabase.from("proposals").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).like("number", `${year}-%`);
  const number = `${year}-${String((count ?? 0) + 1).padStart(3, "0")}`;
  const recurring = deal.kind === "retainer";
  const qty = Number(deal.quantity) || 1;
  const items: Item[] = [{
    descricao: deal.product_name ?? (recurring ? `Acompanhamento mensal — ${deal.title}` : deal.title),
    qtd: qty, preco: Math.round((Number(deal.value) / (recurring ? 1 : qty)) * 100) / 100,
  }];
  const t = templateFor(deal.product_name, deal.kind);
  const total = items.reduce((s, it) => s + it.qtd * it.preco, 0);
  const valid = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const { data: p, error } = await supabase.from("proposals").insert({
    org_id: ctx.org.id, deal_id: dealId, number, items, total, valid_until: valid, recurring,
    title: deal.product_name ? `${deal.product_name}${deal.company_name ? ` para ${deal.company_name}` : ""}` : deal.title,
    intro: `Obrigado pela confiança e pela conversa. Este documento resume o que entendemos sobre o vosso momento, o que propomos fazer em conjunto e o investimento necessário.`,
    context: (deal.ai_brief as { contexto?: string } | null)?.contexto ?? "",
    objectives: ((deal.ai_brief as { objetivos?: string[] } | null)?.objetivos ?? t.objectives).join("\n"), phases: t.phases,
    next_steps: ["Revisão desta proposta e esclarecimento de dúvidas", "Aceitação da proposta e agendamento da primeira sessão", "Arranque do trabalho"].join("\n"),
    terms: recurring
      ? `Duração mínima de ${deal.duration_months} meses. Faturação mensal, a pagar até 15 dias após a emissão da fatura. Valores acrescidos de IVA à taxa legal em vigor.`
      : "50% na adjudicação e 50% na conclusão. Pagamento a 15 dias após a emissão da fatura. Valores acrescidos de IVA à taxa legal em vigor.",
  }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/crm/${dealId}/proposta/${p.id}`);
}

export async function saveProposal(formData: FormData) {
  const ctx = await requireModule("crm", "write");
  const supabase = await createClient();
  const id = String(formData.get("id")), dealId = String(formData.get("deal_id"));
  const items: Item[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const descricao = String(formData.get(`d${i}`) ?? "").trim();
    if (!descricao) continue;
    items.push({ descricao, qtd: Number(formData.get(`q${i}`) || 1), preco: Number(formData.get(`p${i}`) || 0) });
  }
  const phases: Phase[] = [];
  for (let i = 0; i < MAX_PHASES; i++) {
    const nome = String(formData.get(`fn${i}`) ?? "").trim();
    if (!nome) continue;
    phases.push({ nome, duracao: String(formData.get(`fd${i}`) ?? "").trim(), descricao: String(formData.get(`fx${i}`) ?? "").trim() });
  }
  const total = Math.round(items.reduce((s, it) => s + it.qtd * it.preco, 0) * 100) / 100;
  const { data: before } = await supabase.from("proposals").select("status").eq("id", id).single();
  const status = String(formData.get("status"));
  const accent = /^#[0-9a-f]{6}$/i.test(String(formData.get("accent"))) ? String(formData.get("accent")) : "#0071E3";
  const { error } = await supabase.from("proposals").update({
    title: String(formData.get("title")), intro: String(formData.get("intro") ?? ""),
    context: String(formData.get("context") ?? ""), objectives: String(formData.get("objectives") ?? ""),
    phases, next_steps: String(formData.get("next_steps") ?? ""), terms: String(formData.get("terms") ?? ""),
    items, total, valid_until: String(formData.get("valid_until") || "") || null,
    vat_rate: Number(formData.get("vat_rate") ?? 23), recurring: formData.get("recurring") === "on",
    show_about: formData.get("show_about") === "on", accent,
    status, updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw new Error(error.message);

  if (status === "accepted" && before?.status !== "accepted") {
    // Proposta aceite → negócio passa a "Ganho" (dispara receita recorrente e onboarding)
    const { data: deal } = await supabase.from("deals").select("pipeline_id, status").eq("id", dealId).single();
    if (deal && deal.status !== "won") {
      const { data: won } = await supabase.from("stages").select("id").eq("pipeline_id", deal.pipeline_id).eq("is_won", true).limit(1).maybeSingle();
      if (won) await supabase.from("deals").update({ stage_id: won.id }).eq("id", dealId);
    }
  }
  if (status === "sent" && before?.status !== "sent") {
    // Automação: proposta enviada → histórico + follow-ups a 3 e 7 dias
    const { data: d } = await supabase.from("deals").select("title").eq("id", dealId).single();
    const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
    await supabase.from("activities").insert({ org_id: ctx.org.id, deal_id: dealId, type: "note", summary: `Proposta enviada (${total.toLocaleString("pt-PT")} € + IVA).` });
    await supabase.from("tasks").insert([
      { org_id: ctx.org.id, title: `Follow-up da proposta: ${d?.title ?? ""}`, due_date: day(3), deal_id: dealId, module: "crm" },
      { org_id: ctx.org.id, title: `2.º follow-up da proposta: ${d?.title ?? ""}`, due_date: day(7), deal_id: dealId, module: "crm" },
    ]);
  }
  revalidatePath(`/crm/${dealId}`); revalidatePath("/crm"); revalidatePath("/");
  redirect(formData.get("then") === "print" ? `/proposta/${id}` : `/crm/${dealId}/proposta/${id}?ok=1`);
}

export async function saveProposalAndPrint(formData: FormData) {
  formData.set("then", "print");
  return saveProposal(formData);
}

export async function deleteProposal(formData: FormData) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const dealId = String(formData.get("deal_id"));
  await supabase.from("proposals").delete().eq("id", String(formData.get("id")));
  revalidatePath(`/crm/${dealId}`);
  redirect(`/crm/${dealId}`);
}
