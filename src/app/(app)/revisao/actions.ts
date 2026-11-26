"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { weekBounds, weeklyData } from "@/lib/weekly";
import { AI_MODEL, PT_STYLE, aiClient, aiConfigured, aiErrorMessage } from "@/lib/ai";

export async function saveReviewNotes(formData: FormData) {
  const ctx = await getContext();
  const supabase = await createClient();
  const offset = Number(formData.get("offset") ?? 0);
  const { key } = weekBounds(offset);
  const data = await weeklyData(supabase, ctx, offset);
  await supabase.from("weekly_reviews").upsert({ org_id: ctx.org.id, user_id: ctx.userId, week_start: key, data, notes: String(formData.get("notes") ?? "") }, { onConflict: "org_id,user_id,week_start" });
  revalidatePath("/revisao");
}

export async function generateCoach(offset: number): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getContext();
  if (!aiConfigured()) return { ok: false, error: "O coach com IA precisa da chave da API da Anthropic configurada no servidor." };
  const supabase = await createClient();
  const { key } = weekBounds(offset);
  const data = await weeklyData(supabase, ctx, offset);
  const { data: existing } = await supabase.from("weekly_reviews").select("notes").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).eq("week_start", key).maybeSingle();
  try {
    const res = await aiClient().beta.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: `És o coach de negócio de um consultor independente em Portugal. Fazes a revisão semanal com base em dados reais: direto, encorajador mas honesto, focado em ação. ${PT_STYLE}
Formato (texto simples, sem tabelas):
**Balanço** — 2 a 3 frases sobre a semana.
**O que correu bem** — 2 pontos.
**Atenção** — até 3 pontos (KRs em risco, negócios a arrefecer, atrasos, ritmo da meta), com números.
**3 prioridades para a próxima semana** — numeradas, concretas, cada uma com o resultado esperado.
Se a meta tiver ritmo negativo, uma das prioridades deve ser comercial (conversas/propostas).`,
      messages: [{ role: "user", content: `Dados da semana de ${key}:\n<dados>${JSON.stringify(data)}</dados>${existing?.notes ? `\n<reflexao_do_consultor>${existing.notes}</reflexao_do_consultor>` : ""}` }],
    });
    if (res.stop_reason === "refusal") return { ok: false, error: "Não foi possível gerar a revisão." };
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    await supabase.from("weekly_reviews").upsert({ org_id: ctx.org.id, user_id: ctx.userId, week_start: key, data, ai_text: text, notes: existing?.notes ?? null }, { onConflict: "org_id,user_id,week_start" });
    revalidatePath("/revisao");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: aiErrorMessage(e) };
  }
}
