import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur2 } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { deleteProposal, saveProposal, saveProposalAndPrint } from "../../../proposal-actions";
import { MAX_ITEMS, MAX_PHASES, type Item, type Phase } from "@/lib/proposals";

const STATUS: Record<string, string> = { draft: "Rascunho", sent: "Enviada", accepted: "Aceite", rejected: "Recusada" };

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-ink">{n}</span>
        <div><h2 className="h2">{title}</h2>{hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

export default async function ProposalEditor({ params, searchParams }: { params: Promise<{ id: string; pid: string }>; searchParams: Promise<{ ok?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { id, pid } = await params;
  const { ok } = await searchParams;
  const supabase = await createClient();
  const [{ data: p }, { data: products }] = await Promise.all([
    supabase.from("proposals").select("*").eq("id", pid).eq("deal_id", id).maybeSingle(),
    supabase.from("products").select("name, price, kind").eq("org_id", ctx.org.id).eq("active", true).order("position"),
  ]);
  if (!p) notFound();
  const items = (p.items ?? []) as Item[];
  const phases = (p.phases ?? []) as Phase[];
  const rows = Array.from({ length: MAX_ITEMS }, (_, i) => items[i] ?? { descricao: "", qtd: 1, preco: 0 });
  const prow = Array.from({ length: MAX_PHASES }, (_, i) => phases[i] ?? { nome: "", duracao: "", descricao: "" });
  const vat = Number(p.total) * Number(p.vat_rate) / 100;
  const ta = "input py-2.5 leading-relaxed";

  return (
    <>
      <PageHeader eyebrow={`Proposta ${p.number} · ${STATUS[p.status]}`} title={p.title ?? "Proposta"}>
        <Link href={`/crm/${id}`} className="btn-ghost">‹ Negócio</Link>
        <Link href={`/proposta/${p.id}`} className="btn-ghost" target="_blank">Pré-visualizar</Link>
      </PageHeader>
      {ok && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm text-[#1E6B30]">Proposta guardada.</p>}

      <form action={saveProposal} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="deal_id" value={id} />
        <fieldset disabled={!write} className="contents">
          <Section n={1} title="Capa e abertura">
            <label className="flex flex-col gap-1.5"><span className="label">Título da proposta</span><input name="title" defaultValue={p.title ?? ""} className="input" required /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Mensagem de abertura</span><textarea name="intro" rows={3} defaultValue={p.intro ?? ""} className={ta} /></label>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm"><span className="label">Cor de destaque</span><input type="color" name="accent" defaultValue={p.accent ?? "#0071E3"} className="h-9 w-14 rounded-lg border border-line" /></label>
            </div>
          </Section>

          <Section n={2} title="O vosso contexto" hint="O que percebeste do cliente: situação atual, desafios, o que está em jogo. É a secção que mais convence — escreve com as palavras do cliente.">
            <textarea name="context" rows={6} defaultValue={p.context ?? ""} className={ta} placeholder="Ex.: A Atlântico cresceu 40% nos últimos dois anos, mas a equipa de gestão continua a decidir tudo… O principal desafio é…" />
          </Section>

          <Section n={3} title="Objetivos" hint="Um objetivo por linha.">
            <textarea name="objectives" rows={5} defaultValue={p.objectives ?? ""} className={ta} />
          </Section>

          <Section n={4} title="Abordagem e cronograma" hint="As fases do trabalho, pela ordem. Deixa o nome vazio para remover uma fase.">
            <div className="flex flex-col gap-3">
              {prow.map((f, i) => (
                <div key={i} className="grid gap-2 grid-cols-1 md:grid-cols-[1fr_180px] rounded-xl border border-line p-3">
                  <label className="flex flex-col gap-1"><span className="label">Fase {i + 1}</span><input name={`fn${i}`} defaultValue={f.nome} className="input" placeholder={i === 0 ? "Ex.: Diagnóstico" : ""} /></label>
                  <label className="flex flex-col gap-1"><span className="label">Duração / quando</span><input name={`fd${i}`} defaultValue={f.duracao} className="input" placeholder="Ex.: Semana 1" /></label>
                  <label className="flex flex-col gap-1 md:col-span-2"><span className="label">O que acontece</span><textarea name={`fx${i}`} rows={2} defaultValue={f.descricao} className={ta} /></label>
                </div>
              ))}
            </div>
          </Section>

          <Section n={5} title="Investimento" hint="Valores sem IVA. Escreve o nome de um produto do catálogo para o reconhecer.">
            <datalist id="produtos">{(products ?? []).map((pr) => <option key={pr.name} value={pr.name}>{eur2(pr.price)}{pr.kind === "retainer" ? "/mês" : ""}</option>)}</datalist>
            <div className="hidden md:grid grid-cols-[1fr_90px_140px] gap-2 text-xs font-medium text-muted"><span>Descrição</span><span>Qtd.</span><span>Preço unit. (€)</span></div>
            {rows.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_110px] md:grid-cols-[1fr_90px_140px] gap-2">
                <label className="sr-only" htmlFor={`d${i}`}>Descrição linha {i + 1}</label>
                <input id={`d${i}`} name={`d${i}`} list="produtos" defaultValue={it.descricao} className="input" />
                <label className="sr-only" htmlFor={`q${i}`}>Quantidade linha {i + 1}</label>
                <input id={`q${i}`} name={`q${i}`} type="number" step="any" min="0" defaultValue={it.qtd} className="input" />
                <label className="sr-only" htmlFor={`p${i}`}>Preço linha {i + 1}</label>
                <input id={`p${i}`} name={`p${i}`} type="number" step="0.01" defaultValue={it.preco || ""} className="input" />
              </div>
            ))}
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1"><span className="label">IVA (%)</span><input name="vat_rate" type="number" step="0.01" defaultValue={p.vat_rate} className="input !w-24" /></label>
                <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="recurring" defaultChecked={p.recurring} className="h-4 w-4" /> Valores mensais (avença)</label>
              </div>
              <div className="flex flex-col items-end gap-0.5 text-sm">
                <span>Subtotal <strong className="font-semibold">{eur2(p.total)}</strong>{p.recurring ? " /mês" : ""}</span>
                <span className="text-muted">Com IVA {eur2(Number(p.total) + vat)} · atualiza ao guardar</span>
              </div>
            </div>
          </Section>

          <Section n={6} title="Próximos passos, condições e sobre ti">
            <label className="flex flex-col gap-1.5"><span className="label">Próximos passos (um por linha)</span><textarea name="next_steps" rows={3} defaultValue={p.next_steps ?? ""} className={ta} /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Condições</span><textarea name="terms" rows={3} defaultValue={p.terms ?? ""} className={ta} /></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="show_about" defaultChecked={p.show_about} className="h-4 w-4" /> Incluir “Sobre” e testemunhos (editáveis em <Link href="/definicoes" className="text-accent-ink">Definições → Empresa</Link>)</label>
          </Section>

          <section className="card grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end">
            <label className="flex flex-col gap-1.5"><span className="label">Válida até</span><input name="valid_until" type="date" defaultValue={p.valid_until ?? ""} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Estado</span>
              <select name="status" defaultValue={p.status} className="input">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <p className="col-span-full text-xs text-muted"><strong>Enviada</strong>: regista no histórico e cria follow-ups a 3 e 7 dias. <strong>Aceite</strong>: o negócio passa a “Ganho” (receita recorrente e onboarding automáticos).</p>
            {write && (
              <div className="col-span-full flex flex-wrap gap-2">
                <button className="btn">Guardar</button>
                <button formAction={saveProposalAndPrint} className="btn-ghost">Guardar e abrir PDF</button>
              </div>
            )}
          </section>
        </fieldset>
      </form>
      {write && (
        <form action={deleteProposal} className="text-sm">
          <input type="hidden" name="id" value={p.id} /><input type="hidden" name="deal_id" value={id} />
          <button className="font-medium text-warn min-h-9">Apagar proposta</button>
        </form>
      )}
    </>
  );
}
