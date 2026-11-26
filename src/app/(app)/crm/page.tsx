import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur, dateShort } from "@/lib/format";
import { Disclosure, Empty, Kpi, PageHeader } from "@/components/ui";
import { createDeal, createPipeline, logActivity, moveDeal } from "./actions";

type Deal = {
  id: string; title: string; kind: "retainer" | "one_off"; value: number; stage_id: string; status: string;
  eff_probability: number; total_value: number; weighted_value: number; company_name: string | null;
  expected_close: string | null; is_cooling: boolean; last_activity_at: string;
};

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const { data: pipelines = [] } = await supabase.from("pipelines").select("id, name").eq("org_id", ctx.org.id).order("position");
  const sp = await searchParams;
  const pipe = pipelines?.find((p) => p.id === sp.p) ?? pipelines?.[0];

  const [{ data: stages }, { data: deals }] = pipe
    ? await Promise.all([
        supabase.from("stages").select("id, name, probability, is_won, is_lost, position").eq("pipeline_id", pipe.id).order("position"),
        supabase.from("v_deals").select("*").eq("pipeline_id", pipe.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const all = (deals ?? []) as Deal[];
  const open = all.filter((d) => d.status === "open");
  const total = open.reduce((s, d) => s + Number(d.total_value), 0);
  const weighted = open.reduce((s, d) => s + Number(d.weighted_value), 0);
  const mrr = open.filter((d) => d.kind === "retainer").reduce((s, d) => s + Number(d.value), 0);
  const closed = all.filter((d) => d.status !== "open");
  const conv = closed.length ? Math.round((closed.filter((d) => d.status === "won").length / closed.length) * 100) : null;
  const visibleStages = (stages ?? []).filter((s) => !s.is_lost);

  return (
    <>
      <PageHeader title="Oportunidades">
        {(pipelines?.length ?? 0) > 0 && (
          <nav className="seg" aria-label="Pipeline">
            {pipelines!.map((p) => (
              <Link key={p.id} href={`/crm?p=${p.id}`} aria-current={p.id === pipe?.id ? "true" : undefined}>{p.name}</Link>
            ))}
          </nav>
        )}
        {write && (
          <Disclosure label="Novo pipeline">
            <form action={createPipeline} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required placeholder="Ex.: Projetos" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Etapas (separadas por vírgula)</span><input name="stages" className="input" defaultValue="Lead, Proposta, Negociação" /></label>
              <p className="text-xs text-muted">As etapas “Ganho” e “Perdido” são adicionadas automaticamente.</p>
              <button className="btn">Criar pipeline</button>
            </form>
          </Disclosure>
        )}
        {write && pipe && (
          <Disclosure label="+ Oportunidade" primary>
            <form action={createDeal} className="flex flex-col gap-3">
              <input type="hidden" name="pipeline_id" value={pipe.id} />
              <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" className="input" required placeholder="Ex.: Avença estratégia" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Empresa</span><input name="company" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Contacto</span><input name="contact" className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Email do contacto</span><input name="email" type="email" className="input" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Tipo</span>
                  <select name="kind" className="input"><option value="retainer">Avença (mensal)</option><option value="one_off">Serviço pontual</option></select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Valor (€)</span><input name="value" type="number" step="0.01" min="0" className="input" required /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Duração avença (meses)</span><input name="duration" type="number" min="1" defaultValue={12} className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Fecho previsto</span><input name="expected_close" type="date" className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Etapa</span>
                <select name="stage_id" className="input">{visibleStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              <button className="btn">Criar oportunidade</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>

      <section aria-label="Resumo" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <Kpi label="Valor em aberto" value={eur(total)} hint={`${open.length} oportunidades`} />
        <Kpi label="Ponderado (probabilidade)" value={eur(weighted)} />
        <Kpi label="Recorrente potencial" value={`${eur(mrr)}/mês`} />
        <Kpi label="Taxa de conversão" value={conv === null ? "—" : `${conv}%`} hint="Ganhos ÷ fechados" />
      </section>

      {!pipe ? <Empty>Ainda não há pipelines.</Empty> : (
        <div className="overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <div className="grid gap-3.5" style={{ gridTemplateColumns: `repeat(${visibleStages.length}, minmax(250px, 1fr))` }}>
            {visibleStages.map((s) => {
              const col = all.filter((d) => d.stage_id === s.id);
              const v = col.reduce((acc, d) => acc + Number(d.total_value), 0);
              return (
                <section key={s.id} aria-label={s.name} className="flex min-h-[420px] flex-col gap-2.5 rounded-[18px] bg-[#EBEBF0] p-3.5">
                  <div className="flex items-center justify-between px-1.5 pb-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold">{s.name}</h2>
                      <span className="text-xs text-muted">{col.length}</span>
                    </div>
                    <span className="text-xs font-semibold text-ink-2">{eur(v)}</span>
                  </div>
                  {col.length === 0 && <p className="px-1.5 text-xs text-muted">Sem oportunidades.</p>}
                  {col.map((d) => (
                    <article key={d.id} className="flex flex-col gap-2.5 rounded-[14px] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/crm/${d.id}`} className="text-sm font-semibold hover:text-accent-ink">{d.title}</Link>
                          {d.company_name && <div className="text-xs text-muted">{d.company_name}</div>}
                        </div>
                        <span className={`chip ${d.kind === "retainer" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-[#8F4300]"}`}>{d.kind === "retainer" ? "Avença" : "Pontual"}</span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[17px] font-bold tracking-[-0.3px]">{d.kind === "retainer" ? `${eur(d.value)}/mês` : eur(d.value)}</span>
                        <span className="text-xs text-muted">{d.eff_probability}%</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        {d.is_cooling
                          ? <span className="font-medium text-warn">A arrefecer · sem contacto desde {dateShort(d.last_activity_at)}</span>
                          : <span className="text-muted">{d.expected_close ? `Fecho ${dateShort(d.expected_close)}` : "Sem data de fecho"}</span>}
                      </div>
                      {write && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-accent-ink font-medium min-h-6">Atualizar</summary>
                          <div className="mt-2 flex flex-col gap-2">
                            <form action={moveDeal} className="flex gap-2">
                              <input type="hidden" name="deal_id" value={d.id} />
                              <label className="sr-only" htmlFor={`st-${d.id}`}>Etapa</label>
                              <select id={`st-${d.id}`} name="stage_id" defaultValue={d.stage_id} className="input !min-h-9 !text-xs">
                                {(stages ?? []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                              </select>
                              <button className="btn !min-h-9 !px-3 !text-xs">Mover</button>
                            </form>
                            <form action={logActivity} className="flex gap-2">
                              <input type="hidden" name="deal_id" value={d.id} />
                              <label className="sr-only" htmlFor={`ac-${d.id}`}>Registar contacto</label>
                              <input id={`ac-${d.id}`} name="summary" required placeholder="Registar contacto…" className="input !min-h-9 !text-xs" />
                              <button className="btn-ghost !min-h-9 !px-3 !text-xs">OK</button>
                            </form>
                          </div>
                        </details>
                      )}
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      )}
      <p className="text-xs text-muted">Ao mover para “Ganho”: uma avença cria automaticamente a receita recorrente nas Finanças da empresa, atualiza os objetivos ligados e cria a tarefa de onboarding.</p>
    </>
  );
}
