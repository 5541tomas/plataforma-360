import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext, canRead } from "@/lib/context";
import { dateLong, eur, krProgress, today, dateShort } from "@/lib/format";
import { Empty, Kpi, PageHeader, Progress } from "@/components/ui";
import { TaskItem } from "@/components/TaskItem";
import { createTask } from "./objetivos/actions";

export default async function HojePage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const fin = canRead(ctx, "finance"), crm = canRead(ctx, "crm"), goals = canRead(ctx, "goals");
  const t = today();
  const in3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const sixAgo = new Date(); sixAgo.setMonth(sixAgo.getMonth() - 5, 1);
  const none = Promise.resolve({ data: null });

  const [bal, rec, deals, krs, tasks, tx] = await Promise.all([
    fin ? supabase.from("v_account_balances").select("scope, type, balance").eq("org_id", ctx.org.id) : none,
    fin ? supabase.from("recurring").select("amount, scope").eq("org_id", ctx.org.id).eq("active", true) : none,
    crm ? supabase.from("v_deals").select("id, title, company_name, weighted_value, expected_close, is_cooling, last_activity_at, status").eq("org_id", ctx.org.id).eq("status", "open") : none,
    goals ? supabase.from("v_key_results").select("start_value, target_value, computed_value, goal_id, label") .eq("org_id", ctx.org.id) : none,
    supabase.from("tasks").select("id, title, done, due_date, module, key_result_id").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId)
      .or(`and(done.eq.false,due_date.lte.${in3}),and(done.eq.true,done_at.gte.${t})`).order("done").order("due_date").limit(12),
    fin ? supabase.from("transactions").select("date, amount, is_transfer").eq("org_id", ctx.org.id).gte("date", sixAgo.toISOString().slice(0, 10)) : none,
  ]);

  const balances = (bal.data ?? []) as { scope: string; type: string; balance: number }[];
  const liquidOf = (s?: string) => balances.filter((b) => (!s || b.scope === s) && ["checking", "savings", "cash"].includes(b.type)).reduce((a, b) => a + Number(b.balance), 0);
  const recurring = (rec.data ?? []) as { amount: number; scope: string }[];
  const monthlyNet = recurring.reduce((a, r) => a + Number(r.amount), 0);
  const mrr = recurring.filter((r) => r.scope === "business" && r.amount > 0).reduce((a, r) => a + Number(r.amount), 0);
  const openDeals = (deals.data ?? []) as { id: string; title: string; company_name: string | null; weighted_value: number; expected_close: string | null; is_cooling: boolean; last_activity_at: string }[];
  const weighted = openDeals.reduce((a, d) => a + Number(d.weighted_value), 0);
  const weighted90 = openDeals.filter((d) => d.expected_close && d.expected_close <= in90).reduce((a, d) => a + Number(d.weighted_value), 0);
  const forecast = liquidOf() + monthlyNet * 3 + weighted90;
  const krList = (krs.data ?? []) as { start_value: number; target_value: number; computed_value: number }[];
  const goalPct = krList.length ? krList.reduce((a, k) => a + krProgress(k.start_value, k.target_value, k.computed_value), 0) / krList.length : null;
  const followUps = openDeals.filter((d) => d.is_cooling || (d.expected_close && d.expected_close <= in90)).sort((a, b) => Number(b.is_cooling) - Number(a.is_cooling)).slice(0, 5);
  const taskList = (tasks.data ?? []) as { id: string; title: string; done: boolean; due_date: string | null; module: string }[];

  // Fluxo: 6 meses reais + 3 previstos (recorrentes)
  const months: { key: string; label: string; inV: number; outV: number; forecast: boolean }[] = [];
  for (let i = 0; i < 9; i++) {
    const d = new Date(sixAgo); d.setMonth(sixAgo.getMonth() + i);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""), inV: 0, outV: 0, forecast: i >= 6 });
  }
  ((tx.data ?? []) as { date: string; amount: number; is_transfer: boolean }[]).forEach((r) => {
    if (r.is_transfer) return;
    const m = months.find((x) => x.key === r.date.slice(0, 7));
    if (m) { if (r.amount > 0) m.inV += Number(r.amount); else m.outV -= Number(r.amount); }
  });
  const recIn = recurring.filter((r) => r.amount > 0).reduce((a, r) => a + Number(r.amount), 0);
  const recOut = -recurring.filter((r) => r.amount < 0).reduce((a, r) => a + Number(r.amount), 0);
  months.filter((m) => m.forecast).forEach((m) => { m.inV = recIn; m.outV = recOut; });
  const maxV = Math.max(1, ...months.map((m) => Math.max(m.inV, m.outV)));
  const tagFor: Record<string, { label: string; cls: string }> = {
    crm: { label: "CRM", cls: "bg-accent-soft text-accent-ink" }, goals: { label: "Objetivos", cls: "bg-good-soft text-[#1E6B30]" }, finance: { label: "Finanças", cls: "bg-warn-soft text-[#8F4300]" },
  };

  return (
    <>
      <PageHeader eyebrow={dateLong()} title={`Olá, ${ctx.name.split(" ")[0]}. Eis o teu dia em 360°.`}>
        <form action={createTask} className="flex gap-2">
          <label className="sr-only" htmlFor="qc">Captura rápida</label>
          <input id="qc" name="title" required placeholder="Captura rápida: nova tarefa para hoje" className="input min-w-[260px]" />
          <button className="btn whitespace-nowrap">+ Adicionar</button>
        </form>
      </PageHeader>

      <section aria-label="Indicadores" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        {fin && <Kpi label="Liquidez consolidada" value={eur(liquidOf())} hint={`Pessoal ${eur(liquidOf("personal"))} · Empresa ${eur(liquidOf("business"))}`} />}
        {fin && <Kpi label="Tesouraria prevista · 90 dias" value={eur(forecast)} tone={forecast >= liquidOf() ? "good" : "warn"} hint={`Recorrentes ${monthlyNet >= 0 ? "+" : ""}${eur(monthlyNet)}/mês + pipeline`} />}
        {crm && <Kpi label="Pipeline ponderado" value={eur(weighted)} hint={`${openDeals.length} oportunidades em aberto`} />}
        {fin && <Kpi label="Avenças ativas" value={`${eur(mrr)}/mês`} />}
        {goals && <Kpi label="Progresso dos objetivos" value={goalPct === null ? "—" : `${Math.round(goalPct)}%`} hint={goalPct === null ? "Define o teu primeiro objetivo" : <Progress value={goalPct} />} />}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-3">
          <div className="flex items-baseline justify-between"><h2 className="h2">Foco · hoje e próximos dias</h2><span className="text-[13px] text-muted">{taskList.filter((x) => x.done).length} de {taskList.length} feitas</span></div>
          {taskList.length === 0 ? <Empty>Nada pendente para hoje. Usa a captura rápida acima.</Empty> : (
            <ul className="flex flex-col">{taskList.map((tk) => <TaskItem key={tk.id} t={tk} meta={tk.due_date && tk.due_date < t ? `Atrasada · ${dateShort(tk.due_date)}` : tk.due_date && tk.due_date > t ? `Próxima · ${dateShort(tk.due_date)}` : undefined} tag={tagFor[tk.module]} />)}</ul>
          )}
        </div>

        {fin && (
          <div className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h2">Fluxo de caixa</h2>
              <div className="flex gap-3.5 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />Entradas</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#C7C7CC]" />Saídas</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-accent" />Previsto</span>
              </div>
            </div>
            <div role="img" aria-label="Entradas e saídas dos últimos 6 meses e previsão para 3 meses" className="flex h-[200px] items-end gap-3 border-b border-line">
              {months.map((m) => (
                <div key={m.key} className="flex h-full flex-1 items-end justify-center gap-[3px]">
                  <div className={`w-[40%] max-w-4 rounded-t-[5px] ${m.forecast ? "border-[1.5px] border-dashed border-accent" : "bg-accent"}`} style={{ height: `${(m.inV / maxV) * 100}%` }} />
                  <div className={`w-[40%] max-w-4 rounded-t-[5px] bg-[#C7C7CC] ${m.forecast ? "opacity-50" : ""}`} style={{ height: `${(m.outV / maxV) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="-mt-2 flex gap-3">{months.map((m) => <div key={m.key} className="flex-1 text-center text-[11px] text-muted">{m.label}</div>)}</div>
          </div>
        )}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
        {crm && (
          <div className="card flex flex-col gap-3.5">
            <div className="flex items-baseline justify-between"><h2 className="h2">Follow-ups</h2><Link href="/crm" className="text-[13px] text-accent-ink">Ver CRM</Link></div>
            {followUps.length === 0 && <Empty>Sem follow-ups urgentes.</Empty>}
            {followUps.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${d.is_cooling ? "bg-warn-soft text-[#8F4300]" : "bg-accent-soft text-accent-ink"}`}>{(d.company_name ?? d.title).slice(0, 2).toUpperCase()}</div>
                <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{d.title}{d.company_name ? ` · ${d.company_name}` : ""}</span>
                  <span className={`text-xs ${d.is_cooling ? "text-warn" : "text-muted"}`}>{d.is_cooling ? `A arrefecer · último contacto ${dateShort(d.last_activity_at)}` : `Fecho previsto ${dateShort(d.expected_close!)}`}</span></div>
              </div>
            ))}
          </div>
        )}
        <form action="/assistente" className="card flex flex-col gap-3">
          <h2 className="h2">Pergunta ao assistente</h2>
          <label htmlFor="aq" className="sr-only">Pergunta</label>
          <input id="aq" name="q" required placeholder="Ex.: Quanto posso pagar-me este mês?" className="input" />
          <button className="btn self-start">Perguntar</button>
        </form>
        <div className="rounded-[20px] bg-ink p-6 text-[#F5F5F7] flex flex-col gap-3">
          <h2 className="h2">Ligações 360°</h2>
          <p className="text-[13px] text-[#AEAEB2]">Quando ganhas uma avença no CRM, a plataforma cria a receita recorrente nas Finanças, atualiza os KRs automáticos e a tesouraria prevista, e cria a tarefa de onboarding.</p>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="rounded-lg bg-[#2C2C2E] px-2.5 py-1.5">Negócio ganho</span><span aria-hidden="true">→</span>
            <span className="rounded-lg bg-[#2C2C2E] px-2.5 py-1.5">Receita recorrente</span><span aria-hidden="true">→</span>
            <span className="rounded-lg bg-[#0A3D73] px-2.5 py-1.5">Objetivo atualizado</span>
          </div>
        </div>
      </section>
    </>
  );
}
