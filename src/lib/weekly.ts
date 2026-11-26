import type { createClient } from "@/lib/supabase/server";
import type { AppContext } from "@/lib/context";
import { goalEngine } from "@/lib/goal-engine";
import { krProgress } from "@/lib/format";
type DB = Awaited<ReturnType<typeof createClient>>;

export function weekBounds(offset = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
  const end = new Date(d); end.setDate(end.getDate() + 7);
  return { start: d, end, key: d.toISOString().slice(0, 10) };
}

/** Dados factuais da semana (sem IA) */
export async function weeklyData(supabase: DB, ctx: AppContext, offset = 0) {
  const { start, end } = weekBounds(offset);
  const s = start.toISOString(), e = end.toISOString(), sd = s.slice(0, 10), ed = e.slice(0, 10);
  const crm = ctx.perms.crm !== "none", fin = ctx.perms.finance !== "none", goals = ctx.perms.goals !== "none";
  const none = Promise.resolve({ data: null });
  const [tasksDone, tasksLate, won, created, sent, cooling, tx, krs, habits, logs] = await Promise.all([
    supabase.from("tasks").select("title").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("done", true).gte("done_at", s).lt("done_at", e),
    supabase.from("tasks").select("title, due_date").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("done", false).lt("due_date", ed).order("due_date").limit(15),
    crm ? supabase.from("v_deals").select("title, total_value, company_name").eq("org_id", ctx.org.id).eq("status", "won").gte("won_at", s).lt("won_at", e) : none,
    crm ? supabase.from("deals").select("title").eq("org_id", ctx.org.id).gte("created_at", s).lt("created_at", e) : none,
    crm ? supabase.from("activities").select("deal_id").eq("org_id", ctx.org.id).like("summary", "Proposta enviada%").gte("occurred_at", s).lt("occurred_at", e) : none,
    crm ? supabase.from("v_deals").select("title, company_name, last_activity_at, weighted_value").eq("org_id", ctx.org.id).eq("is_cooling", true).order("weighted_value", { ascending: false }).limit(5) : none,
    fin ? supabase.from("transactions").select("amount, is_transfer, account_id").eq("org_id", ctx.org.id).gte("date", sd).lt("date", ed) : none,
    goals ? supabase.from("v_key_results").select("label, start_value, target_value, computed_value, goal_id, goals!inner(title, horizon, period_start)").eq("org_id", ctx.org.id) : none,
    supabase.from("habits").select("id, name, target_per_week").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("archived", false),
    supabase.from("habit_logs").select("habit_id").gte("day", sd).lt("day", ed),
  ]);
  const txs = (tx.data ?? []) as { amount: number; is_transfer: boolean }[];
  const inflow = txs.filter((t) => !t.is_transfer && t.amount > 0).reduce((a, t) => a + Number(t.amount), 0);
  const outflow = -txs.filter((t) => !t.is_transfer && t.amount < 0).reduce((a, t) => a + Number(t.amount), 0);

  // KRs em risco: progresso abaixo do tempo decorrido do período (−15 pontos)
  const now = Date.now();
  const atRisk = ((krs.data ?? []) as unknown as { label: string; start_value: number; target_value: number; computed_value: number; goals: { title: string; horizon: string; period_start: string } }[])
    .map((k) => {
      const ps = new Date(k.goals.period_start).getTime();
      const months = k.goals.horizon === "year" ? 12 : k.goals.horizon === "quarter" ? 3 : 1;
      const pe = new Date(k.goals.period_start); pe.setMonth(pe.getMonth() + months);
      const elapsed = Math.min(1, Math.max(0, (now - ps) / (pe.getTime() - ps)));
      const prog = krProgress(k.start_value, k.target_value, k.computed_value);
      return { kr: k.label, objetivo: k.goals.title, progresso: Math.round(prog), esperado: Math.round(elapsed * 100) };
    })
    .filter((k) => k.esperado > 0 && k.progresso < k.esperado - 15)
    .sort((a, b) => (a.progresso - a.esperado) - (b.progresso - b.esperado)).slice(0, 6);

  const logCount = new Map<string, number>();
  (logs.data ?? []).forEach((l) => logCount.set(l.habit_id, (logCount.get(l.habit_id) ?? 0) + 1));
  const engine = goals ? await goalEngine(supabase, ctx.org.id) : null;

  return {
    semana: sd,
    tarefas_concluidas: (tasksDone.data ?? []).map((t) => t.title),
    tarefas_atrasadas: (tasksLate.data ?? []).map((t) => ({ tarefa: t.title, prazo: t.due_date })),
    negocios_ganhos: ((won.data ?? []) as { title: string; total_value: number; company_name: string | null }[]).map((d) => ({ negocio: d.title, empresa: d.company_name, valor: Number(d.total_value) })),
    negocios_novos: (created.data ?? []).length,
    propostas_enviadas: new Set(((sent.data ?? []) as { deal_id: string }[]).map((a) => a.deal_id)).size,
    negocios_a_arrefecer: ((cooling.data ?? []) as { title: string; company_name: string | null; last_activity_at: string }[]).map((d) => ({ negocio: d.title, empresa: d.company_name, ultimo_contacto: d.last_activity_at.slice(0, 10) })),
    dinheiro: fin ? { entradas: Math.round(inflow), saidas: Math.round(outflow) } : null,
    krs_em_risco: atRisk,
    habitos: (habits.data ?? []).map((h) => ({ habito: h.name, feito: logCount.get(h.id) ?? 0, meta: h.target_per_week })),
    meta: engine && engine.target ? {
      ano: engine.year, alvo: engine.target, vendido: Math.round(engine.sold), ritmo: Math.round(engine.pace),
      por_semana: engine.perWeek, esta_semana: { conversas: engine.actual.newWeek, propostas: engine.actual.sentWeek },
    } : null,
  };
}
export type WeeklyData = Awaited<ReturnType<typeof weeklyData>>;
