"use server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { AI_MODEL, PT_STYLE, aiClient, aiConfigured, aiErrorMessage } from "@/lib/ai";

const Copilot = z.object({
  resumo: z.string().describe("Resumo da reunião em 3 a 6 frases, factual"),
  tipo: z.enum(["meeting", "call", "note"]),
  proximos_passos: z.array(z.object({ tarefa: z.string(), dias_ate: z.number().int().describe("dias a partir de hoje até ao prazo") })).describe("Ações concretas para o consultor, no máximo 5"),
  etapa_sugerida: z.string().nullable().describe("Nome exato de uma das etapas disponíveis, ou null se não houver mudança"),
  probabilidade: z.number().int().nullable().describe("Probabilidade de fecho estimada 0-100, ou null"),
  valor_estimado: z.number().nullable().describe("Valor em euros sem IVA mencionado ou inferido, ou null"),
  contexto_proposta: z.string().describe("Secção 'O vosso contexto' para a proposta: situação, desafios e o que está em jogo, com as palavras do cliente, 2 parágrafos"),
  objetivos_proposta: z.array(z.string()).describe("3 a 5 objetivos do cliente, curtos e mensuráveis quando possível"),
  riscos: z.array(z.string()).describe("Objeções, riscos ou sinais de alerta, no máximo 3"),
  mensagem_followup: z.string().describe("Mensagem curta de follow-up para enviar ao cliente por WhatsApp/email, tom próximo e profissional, assinada com o primeiro nome do consultor"),
});
export type CopilotResult = z.infer<typeof Copilot>;

export async function runCopilot(dealId: string, notes: string): Promise<{ ok: true; result: CopilotResult; applied: string[] } | { ok: false; error: string }> {
  const ctx = await requireModule("crm", "write");
  if (!aiConfigured()) return { ok: false, error: "O copiloto precisa da chave da API da Anthropic (ANTHROPIC_API_KEY) configurada no servidor." };
  const text = notes.trim();
  if (text.length < 20) return { ok: false, error: "Escreve um pouco mais sobre a reunião (pelo menos uma ou duas frases)." };
  const supabase = await createClient();
  const { data: deal } = await supabase.from("v_deals").select("id, title, company_name, contact_name, product_name, kind, value, stage_name, pipeline_id").eq("id", dealId).single();
  if (!deal) return { ok: false, error: "Negócio não encontrado." };
  const { data: stages } = await supabase.from("stages").select("id, name").eq("pipeline_id", deal.pipeline_id).order("position");

  let result: CopilotResult;
  try {
    const res = await aiClient().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Copilot) },
      system: `És o copiloto comercial de um consultor em Portugal. Transformas notas de reuniões em registos de CRM e material para propostas. ${PT_STYLE}`,
      messages: [{
        role: "user",
        content: `Hoje é ${new Date().toISOString().slice(0, 10)}. Consultor: ${ctx.name}.
Negócio: ${deal.title}${deal.company_name ? ` · Empresa: ${deal.company_name}` : ""}${deal.contact_name ? ` · Contacto: ${deal.contact_name}` : ""}${deal.product_name ? ` · Produto: ${deal.product_name}` : ""} · Etapa atual: ${deal.stage_name} · Valor: ${deal.value} €.
Etapas disponíveis: ${(stages ?? []).map((s) => s.name).join(", ")}.

<notas_da_reuniao>
${text.slice(0, 20000)}
</notas_da_reuniao>`,
      }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { ok: false, error: "Não foi possível analisar estas notas. Tenta reformular." };
    result = res.parsed_output;
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }

  // Aplicar: histórico, tarefas, brief para a proposta
  const applied: string[] = [];
  await supabase.from("activities").insert({ org_id: ctx.org.id, deal_id: dealId, type: result.tipo, summary: `${result.resumo}${result.riscos.length ? `\n\nRiscos: ${result.riscos.join("; ")}` : ""}` });
  applied.push("Resumo registado no histórico");
  const steps = result.proximos_passos.slice(0, 5).map((p) => ({
    org_id: ctx.org.id, deal_id: dealId, module: "crm" as const, title: p.tarefa.slice(0, 200),
    due_date: new Date(Date.now() + Math.max(0, Math.min(90, p.dias_ate)) * 864e5).toISOString().slice(0, 10),
  }));
  if (steps.length) { await supabase.from("tasks").insert(steps); applied.push(`${steps.length} tarefa(s) criada(s)`); }
  await supabase.from("deals").update({
    ai_brief: { contexto: result.contexto_proposta, objetivos: result.objetivos_proposta, em: new Date().toISOString() },
    ...(result.probabilidade !== null ? { probability: Math.max(0, Math.min(100, result.probabilidade)) } : {}),
  }).eq("id", dealId);
  applied.push("Contexto e objetivos guardados para a próxima proposta");
  // Se já houver uma proposta em rascunho sem contexto, preenche-a
  const { data: draft } = await supabase.from("proposals").select("id, context").eq("deal_id", dealId).eq("status", "draft").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (draft && !draft.context) {
    await supabase.from("proposals").update({ context: result.contexto_proposta, objectives: result.objetivos_proposta.join("\n") }).eq("id", draft.id);
    applied.push("Rascunho da proposta preenchido");
  }
  revalidatePath(`/crm/${dealId}`); revalidatePath("/");
  return { ok: true, result, applied };
}

export async function applySuggestedStage(dealId: string, stageName: string) {
  await requireModule("crm", "write");
  const supabase = await createClient();
  const { data: deal } = await supabase.from("deals").select("pipeline_id").eq("id", dealId).single();
  const { data: st } = await supabase.from("stages").select("id").eq("pipeline_id", deal!.pipeline_id).eq("name", stageName).maybeSingle();
  if (!st) return { ok: false };
  await supabase.from("deals").update({ stage_id: st.id }).eq("id", dealId);
  revalidatePath(`/crm/${dealId}`); revalidatePath("/crm");
  return { ok: true };
}
