import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { krProgress, today, eur } from "@/lib/format";
import { Disclosure, Empty, PageHeader, Progress } from "@/components/ui";
import { TaskItem } from "@/components/TaskItem";
import { archiveHabit, createGoal, createHabit, createKeyResult, createTask, deleteGoal, deleteKeyResult, toggleHabit, updateGoal, updateKeyResult } from "./actions";

const AREAS = ["Negócio", "Finanças", "Saúde", "Relações", "Aprendizagem", "Lazer"];
const HORIZON: Record<string, string> = { vision: "Visão", year: "Anual", quarter: "Trimestral", month: "Mensal" };
const SOURCES: Record<string, string> = {
  manual: "Manual", finance_income: "Auto · Receita da empresa (ano)", finance_savings: "Auto · Poupança + investimentos pessoais",
  crm_mrr: "Auto · Receita recorrente (avenças)", crm_product_units: "Auto · Unidades vendidas de um produto (CRM)", crm_won_value: "Auto · Valor ganho no CRM (ano)", crm_won_count: "Auto · Nº de negócios ganhos (ano)", habit: "Auto · Registos de hábito",
};

type KR = { id: string; goal_id: string; label: string; unit: string; start_value: number; target_value: number; computed_value: number; source: string };

function fmtVal(v: number, unit: string, source: string) {
  if (unit === "€" || source.startsWith("finance") || source === "crm_mrr" || source === "crm_won_value") return eur(v);
  return `${Number(v).toLocaleString("pt-PT")}${unit ? " " + unit : ""}`;
}

function lastDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (n - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

export default async function ObjetivosPage({ searchParams }: { searchParams: Promise<{ h?: string }> }) {
  const ctx = await requireModule("goals");
  const write = canWrite(ctx, "goals");
  const sp = await searchParams;
  const h = sp.h && HORIZON[sp.h] ? sp.h : undefined;
  const supabase = await createClient();
  const days = lastDays(21);

  let gq = supabase.from("goals").select("id, title, area, horizon, status, is_private, parent_id").eq("org_id", ctx.org.id).neq("status", "dropped").order("created_at");
  if (h) gq = gq.eq("horizon", h);
  const { data: products } = await supabase.from("products").select("id, name").eq("org_id", ctx.org.id).eq("active", true).order("position");
  const [{ data: goals }, { data: krs }, { data: habits }, { data: logs }, { data: tasks }] = await Promise.all([
    gq,
    supabase.from("v_key_results").select("*").eq("org_id", ctx.org.id).order("position"),
    supabase.from("habits").select("id, name, target_per_week").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("archived", false).order("created_at"),
    supabase.from("habit_logs").select("habit_id, day").gte("day", days[0]),
    supabase.from("tasks").select("id, title, done, due_date, key_result_id").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId).eq("module", "goals")
      .or(`done.eq.false,done_at.gte.${days[14]}`).order("done").order("due_date").limit(20),
  ]);
  const krsBy = new Map<string, KR[]>();
  (krs as KR[] | null ?? []).forEach((k) => krsBy.set(k.goal_id, [...(krsBy.get(k.goal_id) ?? []), k]));
  const krLabel = new Map((krs as KR[] | null ?? []).map((k) => [k.id, k.label]));
  const logSet = new Set((logs ?? []).map((l) => `${l.habit_id}:${l.day}`));
  const t = today();

  return (
    <>
      <PageHeader title="Objetivos">
        <nav className="seg" aria-label="Horizonte">
          <a href="/objetivos" aria-current={!h ? "true" : undefined}>Todos</a>
          {Object.entries(HORIZON).map(([k, v]) => <a key={k} href={`/objetivos?h=${k}`} aria-current={h === k ? "true" : undefined}>{v}</a>)}
        </nav>
        {write && (
          <Disclosure label="+ Objetivo" primary>
            <form action={createGoal} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Objetivo</span><input name="title" className="input" required placeholder="Ex.: Construir receita previsível" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Área</span><select name="area" className="input">{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Horizonte</span><select name="horizon" defaultValue="year" className="input">{Object.entries(HORIZON).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Contribui para (opcional)</span>
                <select name="parent_id" className="input"><option value="">—</option>{(goals ?? []).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shared" className="h-4 w-4" /> Partilhar com a equipa</label>
              <button className="btn">Criar objetivo</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>

      <section aria-label="Método" className="card !py-4 flex flex-wrap items-center gap-2.5 text-[13px]">
        <span className="mr-1.5 font-semibold">Método 360</span>
        {["Visão 3 anos", "Objetivos anuais", "Key Results trimestrais", "Foco mensal", "Tarefas semanais + hábitos diários"].map((s, i, a) => (
          <span key={s} className="flex items-center gap-2.5"><span className="rounded-full bg-[#F2F2F5] px-3 py-1.5">{s}</span>{i < a.length - 1 && <span aria-hidden="true" className="text-[#AEAEB2]">›</span>}</span>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        {(goals?.length ?? 0) === 0 && <Empty>Ainda não tens objetivos{h ? ` com horizonte ${HORIZON[h].toLowerCase()}` : ""}. Começa por um objetivo anual e 2–3 Key Results.</Empty>}
        {(goals ?? []).map((g) => {
          const list = krsBy.get(g.id) ?? [];
          const avg = list.length ? list.reduce((s, k) => s + krProgress(k.start_value, k.target_value, k.computed_value), 0) / list.length : 0;
          return (
            <article key={g.id} className="card flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.5px] text-accent-ink">{g.area} · {HORIZON[g.horizon]}{g.is_private ? " · Privado" : ""}</span>
                  <h2 className="text-xl font-semibold tracking-[-0.3px]">{g.title}</h2>
                </div>
                <span className="text-[26px] font-bold tracking-[-0.6px]">{Math.round(avg)}%</span>
              </div>
              <div className="flex flex-col gap-3">
                {list.length === 0 && <p className="text-sm text-muted">Sem Key Results.</p>}
                {list.map((k) => {
                  const p = krProgress(k.start_value, k.target_value, k.computed_value);
                  return (
                    <div key={k.id} className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap justify-between gap-3 text-sm">
                        <span>{k.label}</span>
                        <span className="flex items-center gap-2">
                          {k.source !== "manual" && <span className="chip bg-accent-soft text-accent-ink">Auto</span>}
                          <span className="text-ink-2">{fmtVal(k.computed_value, k.unit, k.source)} / {fmtVal(k.target_value, k.unit, k.source)}</span>
                        </span>
                      </div>
                      <Progress value={p} />
                      {write && k.source === "manual" && (
                        <form action={updateKeyResult} className="flex items-center gap-2">
                          <input type="hidden" name="id" value={k.id} />
                          <label className="sr-only" htmlFor={`kr-${k.id}`}>Valor atual</label>
                          <input id={`kr-${k.id}`} name="current_value" type="number" step="any" defaultValue={k.computed_value} className="input !min-h-9 !w-32 !text-xs" />
                          <button className="btn-ghost !min-h-9 !px-3 !text-xs">Atualizar</button>
                        </form>
                      )}
                      {write && (
                        <form action={deleteKeyResult}><input type="hidden" name="id" value={k.id} />
                          <button className="min-h-7 text-[11px] text-muted hover:text-warn" aria-label={`Remover KR ${k.label}`}>Remover KR</button></form>
                      )}
                    </div>
                  );
                })}
              </div>
              {write && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-accent-ink">+ Key Result</summary>
                  <form action={createKeyResult} className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end">
                    <input type="hidden" name="goal_id" value={g.id} />
                    <label className="flex flex-col gap-1.5 col-span-full"><span className="label">Key Result</span><input name="label" className="input" required placeholder="Ex.: Chegar a 6 avenças ativas" /></label>
                    <label className="flex flex-col gap-1.5 col-span-full"><span className="label">Fonte do progresso</span>
                      <select name="source" className="input">{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                    {(products?.length ?? 0) > 0 && <label className="flex flex-col gap-1.5 col-span-full"><span className="label">Produto (só para “Unidades vendidas”)</span>
                      <select name="product_id" className="input"><option value="">—</option>{products!.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
                    <label className="flex flex-col gap-1.5"><span className="label">Inicial</span><input name="start_value" type="number" step="any" defaultValue={0} className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Alvo</span><input name="target_value" type="number" step="any" required className="input" /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Unidade</span><input name="unit" className="input" placeholder="€, %, clientes…" /></label>
                    <button className="btn">Adicionar</button>
                  </form>
                </details>
              )}
              {write && (
                <details>
                  <summary className="cursor-pointer text-sm font-medium text-muted">Editar objetivo</summary>
                  <form action={updateGoal} className="mt-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(160px,1fr))] items-end">
                    <input type="hidden" name="id" value={g.id} />
                    <label className="flex flex-col gap-1.5 col-span-full"><span className="label">Objetivo</span><input name="title" defaultValue={g.title} className="input" required /></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Área</span><select name="area" defaultValue={g.area} className="input">{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
                    <label className="flex flex-col gap-1.5"><span className="label">Estado</span><select name="status" defaultValue={g.status} className="input">
                      <option value="active">Ativo</option><option value="done">Concluído</option><option value="paused">Em pausa</option><option value="dropped">Abandonado</option></select></label>
                    <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="shared" defaultChecked={!g.is_private} className="h-4 w-4" /> Partilhado</label>
                    <button className="btn">Guardar</button>
                  </form>
                  <form action={deleteGoal} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    <input type="hidden" name="id" value={g.id} />
                    <label className="flex items-center gap-2"><input type="checkbox" name="confirm" required className="h-4 w-4" /> Confirmo</label>
                    <button className="font-medium text-warn min-h-9">Apagar objetivo e KRs</button>
                  </form>
                </details>
              )}
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">Hábitos · 3 semanas</h2>
            <Disclosure label="+ Hábito">
              <form action={createHabit} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Hábito</span><input name="name" className="input" required placeholder="Ex.: Treino" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Vezes por semana</span><input name="target_per_week" type="number" min="1" max="7" defaultValue={7} className="input" /></label>
                <button className="btn">Criar hábito</button>
              </form>
            </Disclosure>
          </div>
          {(habits?.length ?? 0) === 0 && <Empty>Sem hábitos ainda.</Empty>}
          {(habits ?? []).map((hb) => {
            let streak = 0;
            for (let i = days.length - 1; i >= 0; i--) { if (logSet.has(`${hb.id}:${days[i]}`)) streak++; else if (days[i] !== t) break; }
            const doneToday = logSet.has(`${hb.id}:${t}`);
            return (
              <div key={hb.id} className="flex items-center gap-3">
                <div className="flex w-[130px] flex-col"><span className="text-sm truncate">{hb.name}</span><span className="text-xs text-muted">{hb.target_per_week}× / semana</span></div>
                <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: "repeat(21, minmax(0, 1fr))" }} aria-hidden="true">
                  {days.map((d) => <div key={d} className={`aspect-square rounded-[4px] ${logSet.has(`${hb.id}:${d}`) ? "bg-accent" : "bg-soft"}`} />)}
                </div>
                <form action={toggleHabit}>
                  <input type="hidden" name="habit_id" value={hb.id} />
                  <button className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold ${doneToday ? "bg-accent text-white" : "border border-line"}`} aria-label={`${hb.name}: ${doneToday ? "desmarcar hoje" : "marcar hoje"}`}>
                    {streak}d {doneToday ? "✓" : "+"}
                  </button>
                </form>
                <form action={archiveHabit}><input type="hidden" name="id" value={hb.id} />
                  <button aria-label={`Arquivar hábito ${hb.name}`} className="min-h-9 px-1 text-xs text-muted hover:text-warn">×</button></form>
              </div>
            );
          })}
        </div>

        <div className="card flex flex-col gap-2">
          <h2 className="h2">Tarefas</h2>
          <form action={createTask} className="flex flex-wrap gap-2">
            <label className="sr-only" htmlFor="nt">Nova tarefa</label>
            <input id="nt" name="title" required placeholder="Nova tarefa…" className="input flex-[2_1_180px]" />
            <label className="sr-only" htmlFor="nk">Key Result</label>
            <select id="nk" name="key_result_id" className="input flex-[1_1_140px]"><option value="">Sem KR</option>{(krs as KR[] | null ?? []).map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}</select>
            <button className="btn">Adicionar</button>
          </form>
          <ul className="flex flex-col">
            {(tasks ?? []).map((tk) => <TaskItem key={tk.id} t={tk} meta={tk.key_result_id ? `↳ ${krLabel.get(tk.key_result_id) ?? ""}` : tk.due_date ?? undefined} />)}
          </ul>
          {(tasks?.length ?? 0) === 0 && <Empty>Sem tarefas. Liga cada tarefa a um Key Result para veres o impacto.</Empty>}
        </div>
      </section>
    </>
  );
}
