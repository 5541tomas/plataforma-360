import type { createClient } from "@/lib/supabase/server";
type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
import type { AppContext } from "@/lib/context";
import { krProgress, today } from "@/lib/format";

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Resumo compacto dos dados do utilizador para o assistente.
 * Usa a sessão do próprio utilizador: as regras de acesso (RLS) e as permissões por módulo aplicam-se.
 */
export async function buildSnapshot(supabase: SupabaseClient, ctx: AppContext) {
  const out: Record<string, unknown> = {
    hoje: today(),
    empresa: ctx.org.name,
    utilizador: ctx.name,
    acesso: ctx.perms,
  };
  const since = new Date(); since.setMonth(since.getMonth() - 3, 1);
  const sinceIso = since.toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);

  if (ctx.perms.finance !== "none") {
    const [{ data: accounts }, { data: cats }, { data: rec }, { data: budgets }] = await Promise.all([
      supabase.from("v_account_balances").select("id, name, bank, scope, type, balance").eq("org_id", ctx.org.id),
      supabase.from("categories").select("id, name, scope").eq("org_id", ctx.org.id),
      supabase.from("recurring").select("description, amount, scope, day_of_month").eq("org_id", ctx.org.id).eq("active", true),
      supabase.from("budgets").select("category_id, amount, scope").eq("org_id", ctx.org.id).eq("month", today().slice(0, 8) + "01"),
    ]);
    const accIds = (accounts ?? []).map((a) => a.id);
    const { data: tx } = accIds.length
      ? await supabase.from("transactions").select("date, description, amount, category_id, account_id, is_transfer").in("account_id", accIds).gte("date", sinceIso).order("date", { ascending: false }).limit(1500)
      : { data: [] };
    const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));
    const accScope = new Map((accounts ?? []).map((a) => [a.id, a.scope]));
    // Totais por mês, âmbito e categoria
    const byMonth: Record<string, Record<string, { entradas: number; saidas: number; porCategoria: Record<string, number> }>> = {};
    (tx ?? []).forEach((t) => {
      if (t.is_transfer) return;
      const m = t.date.slice(0, 7), s = accScope.get(t.account_id) === "business" ? "empresa" : "pessoal";
      byMonth[m] ??= {}; byMonth[m][s] ??= { entradas: 0, saidas: 0, porCategoria: {} };
      const b = byMonth[m][s];
      if (t.amount > 0) b.entradas = r2(b.entradas + Number(t.amount)); else b.saidas = r2(b.saidas - Number(t.amount));
      const c = t.category_id ? catName.get(t.category_id) ?? "Outra" : "Sem categoria";
      b.porCategoria[c] = r2((b.porCategoria[c] ?? 0) + Number(t.amount));
    });
    const { data: debts } = await supabase.from("v_debts").select("name, lender, kind, remaining, monthly_payment, end_date, projected_end, paid_this_month").eq("org_id", ctx.org.id).eq("archived", false);
    out.financas = {
      dividas: (debts ?? []).map((d) => ({ divida: d.name, credor: d.lender, em_falta: Number(d.remaining), prestacao_mensal: d.monthly_payment ? Number(d.monthly_payment) : null, liquidada_em: d.end_date ?? d.projected_end, paga_este_mes: d.paid_this_month })),
      contas: (accounts ?? []).map((a) => ({ nome: a.name, banco: a.bank, ambito: a.scope === "business" ? "empresa" : "pessoal", tipo: a.type, saldo: r2(Number(a.balance)) })),
      recorrentes_mensais: (rec ?? []).map((r) => ({ descricao: r.description, valor: Number(r.amount), ambito: r.scope === "business" ? "empresa" : "pessoal", dia: r.day_of_month })),
      orcamentos_mes_atual: (budgets ?? []).map((b) => ({ categoria: catName.get(b.category_id), limite: Number(b.amount), ambito: b.scope === "business" ? "empresa" : "pessoal" })),
      resumo_por_mes: byMonth,
      ultimos_movimentos: (tx ?? []).slice(0, 40).map((t) => ({ data: t.date, descricao: t.description, valor: Number(t.amount), categoria: t.category_id ? catName.get(t.category_id) : null })),
    };
  }

  if (ctx.perms.crm !== "none") {
    const { data: deals } = await supabase.from("v_deals")
      .select("title, company_name, stage_name, kind, value, duration_months, eff_probability, weighted_value, expected_close, status, won_at, last_activity_at, is_cooling")
      .eq("org_id", ctx.org.id).order("created_at", { ascending: false }).limit(150);
    out.crm = {
      oportunidades_abertas: (deals ?? []).filter((d) => d.status === "open").map((d) => ({
        titulo: d.title, empresa: d.company_name, etapa: d.stage_name, tipo: d.kind === "retainer" ? "avença mensal" : "pontual",
        valor: Number(d.value), meses: d.kind === "retainer" ? d.duration_months : undefined, probabilidade: d.eff_probability,
        ponderado: Number(d.weighted_value), fecho_previsto: d.expected_close, ultimo_contacto: d.last_activity_at?.slice(0, 10), a_arrefecer: d.is_cooling,
        fecha_em_90_dias: !!d.expected_close && d.expected_close <= in90,
      })),
      ganhos_recentes: (deals ?? []).filter((d) => d.status === "won").slice(0, 20).map((d) => ({ titulo: d.title, empresa: d.company_name, valor: Number(d.value), tipo: d.kind, ganho_em: d.won_at?.slice(0, 10) })),
      perdidos: (deals ?? []).filter((d) => d.status === "lost").length,
    };
  }

  if (ctx.perms.goals !== "none") {
    const [{ data: goals }, { data: krs }, { data: habits }] = await Promise.all([
      supabase.from("goals").select("id, title, area, horizon, status").eq("org_id", ctx.org.id).neq("status", "dropped"),
      supabase.from("v_key_results").select("goal_id, label, unit, start_value, target_value, computed_value, source").eq("org_id", ctx.org.id),
      supabase.from("habits").select("id, name, target_per_week").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("archived", false),
    ]);
    const weekAgo = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10);
    const { data: logs } = habits?.length ? await supabase.from("habit_logs").select("habit_id, day").in("habit_id", habits.map((h) => h.id)).gte("day", weekAgo) : { data: [] };
    out.objetivos = (goals ?? []).map((g) => ({
      objetivo: g.title, area: g.area, horizonte: g.horizon, estado: g.status,
      key_results: (krs ?? []).filter((k) => k.goal_id === g.id).map((k) => ({
        kr: k.label, atual: Number(k.computed_value), alvo: Number(k.target_value), unidade: k.unit, automatico: k.source !== "manual",
        progresso_pct: Math.round(krProgress(k.start_value, k.target_value, k.computed_value)),
      })),
    }));
    out.habitos_ultimas_4_semanas = (habits ?? []).map((h) => ({ habito: h.name, meta_semanal: h.target_per_week, registos: (logs ?? []).filter((l) => l.habit_id === h.id).length }));
  }

  const { data: tasks } = await supabase.from("tasks").select("title, due_date, module").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("done", false).order("due_date").limit(40);
  out.tarefas_pendentes = (tasks ?? []).map((t) => ({ tarefa: t.title, prazo: t.due_date, modulo: t.module }));
  return out;
}
