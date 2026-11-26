import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur } from "@/lib/format";
import { Disclosure, Empty, Kpi, PageHeader } from "@/components/ui";
import { KanbanBoard, type BoardDeal } from "@/components/KanbanBoard";
import { createDeal, createPipeline } from "./actions";

const SOURCES = ["Referência", "LinkedIn", "Site", "Instagram", "Evento", "Cliente antigo", "Outro"];

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const [{ data: pipelines }, { data: products }] = await Promise.all([
    supabase.from("pipelines").select("id, name").eq("org_id", ctx.org.id).order("position"),
    supabase.from("products").select("id, name, price, kind").eq("org_id", ctx.org.id).eq("active", true).order("position"),
  ]);
  const sp = await searchParams;
  const pipe = pipelines?.find((p) => p.id === sp.p) ?? pipelines?.[0];

  const [{ data: stages }, { data: deals }] = pipe
    ? await Promise.all([
        supabase.from("stages").select("id, name, probability, is_won, is_lost, position").eq("pipeline_id", pipe.id).order("position"),
        supabase.from("v_deals").select("*").eq("pipeline_id", pipe.id).order("created_at", { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];

  const all = (deals ?? []) as BoardDeal[];
  const open = all.filter((d) => d.status === "open");
  const total = open.reduce((s, d) => s + Number(d.total_value), 0);
  const weighted = open.reduce((s, d) => s + Number(d.weighted_value), 0);
  const mrr = open.filter((d) => d.kind === "retainer").reduce((s, d) => s + Number(d.value), 0);
  const closed = all.filter((d) => d.status !== "open");
  const conv = closed.length ? Math.round((closed.filter((d) => d.status === "won").length / closed.length) * 100) : null;
  const openStages = (stages ?? []).filter((s) => !s.is_won && !s.is_lost);

  return (
    <>
      <PageHeader title="Oportunidades">
        {(pipelines?.length ?? 0) > 1 && (
          <nav className="seg" aria-label="Pipeline">
            {pipelines!.map((p) => <Link key={p.id} href={`/crm?p=${p.id}`} aria-current={p.id === pipe?.id ? "true" : undefined}>{p.name}</Link>)}
          </nav>
        )}
        {write && (
          <Disclosure label="Novo pipeline">
            <form action={createPipeline} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required placeholder="Ex.: Empresas" /></label>
              <label className="flex flex-col gap-1.5"><span className="label">Etapas (separadas por vírgula)</span><input name="stages" className="input" defaultValue="Lead, Proposta, Negociação" /></label>
              <p className="text-xs text-muted">“Ganho” e “Perdido” são adicionadas automaticamente.</p>
              <button className="btn">Criar pipeline</button>
            </form>
          </Disclosure>
        )}
        {write && pipe && (
          <Disclosure label="+ Oportunidade" primary>
            <form action={createDeal} className="flex flex-col gap-3">
              <input type="hidden" name="pipeline_id" value={pipe.id} />
              <input type="hidden" name="open" value="1" />
              <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" className="input" required placeholder="Ex.: Programa 8 sessões — Ana" /></label>
              <div className="grid grid-cols-[1fr_80px] gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Produto</span>
                  <select name="product_id" className="input"><option value="">Outro / personalizado</option>
                    {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} · {eur(p.price)}{p.kind === "retainer" ? "/mês" : ""}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Qtd.</span><input name="quantity" type="number" min="1" step="1" defaultValue={1} className="input" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Empresa</span><input name="company" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Contacto</span><input name="contact" className="input" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Email</span><input name="email" type="email" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Telemóvel</span><input name="phone" type="tel" className="input" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Valor (€) · vazio = preço do produto</span><input name="value" type="number" step="0.01" min="0" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Tipo (se sem produto)</span>
                  <select name="kind" className="input"><option value="one_off">Pontual</option><option value="retainer">Avença mensal</option></select></label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Etapa</span>
                  <select name="stage_id" className="input">{openStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Fecho previsto</span><input name="expected_close" type="date" className="input" /></label>
                <label className="flex flex-col gap-1.5"><span className="label">Origem</span>
                  <select name="source" className="input"><option value="">—</option>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></label>
              </div>
              <button className="btn">Criar e abrir</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>

      <section aria-label="Resumo" className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <Kpi label="Valor em aberto" value={eur(total)} hint={`${open.length} oportunidades`} />
        <Kpi label="Ponderado (probabilidade)" value={eur(weighted)} />
        <Kpi label="Recorrente potencial" value={`${eur(mrr)}/mês`} />
        <Kpi label="Taxa de conversão" value={conv === null ? "—" : `${conv}%`} hint={<Link href="/crm/relatorios" className="text-accent-ink">Ver relatórios</Link>} />
      </section>

      {!pipe ? <Empty>Ainda não há pipelines.</Empty> : (
        <KanbanBoard stages={stages ?? []} deals={all} products={(products ?? []).map((p) => ({ id: p.id, name: p.name }))} write={write} />
      )}
      <p className="text-xs text-muted">Ao largar em “Ganho”: uma avença cria a receita recorrente nas Finanças, atualiza os objetivos e cria a tarefa de onboarding.</p>
    </>
  );
}
