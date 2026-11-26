import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur2 } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { deleteProposal, saveProposal, saveProposalAndPrint } from "../../../proposal-actions";
import { MAX_ITEMS, type Item } from "@/lib/proposals";

const STATUS: Record<string, string> = { draft: "Rascunho", sent: "Enviada", accepted: "Aceite", rejected: "Recusada" };

export default async function ProposalEditor({ params, searchParams }: { params: Promise<{ id: string; pid: string }>; searchParams: Promise<{ ok?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const { id, pid } = await params;
  const { ok } = await searchParams;
  const supabase = await createClient();
  const { data: p } = await supabase.from("proposals").select("*").eq("id", pid).eq("deal_id", id).maybeSingle();
  if (!p) notFound();
  const items = (p.items ?? []) as Item[];
  const rows = Array.from({ length: Math.max(MAX_ITEMS, items.length) }, (_, i) => items[i] ?? { descricao: "", qtd: 1, preco: 0 });
  const vat = Number(p.total) * Number(p.vat_rate) / 100;

  return (
    <>
      <PageHeader eyebrow={`Proposta ${p.number}`} title={p.title ?? "Proposta"}>
        <Link href={`/crm/${id}`} className="btn-ghost">‹ Negócio</Link>
        <Link href={`/proposta/${p.id}`} className="btn-ghost" target="_blank">Ver / Guardar PDF</Link>
      </PageHeader>
      {ok && <p role="status" className="rounded-xl bg-good-soft px-4 py-3 text-sm text-[#1E6B30]">Proposta guardada.</p>}
      <form action={saveProposal} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="deal_id" value={id} />
        <fieldset disabled={!write} className="card flex flex-col gap-3">
          <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" defaultValue={p.title ?? ""} className="input" required /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Introdução</span><textarea name="intro" rows={3} defaultValue={p.intro ?? ""} className="input py-2.5" /></label>
        </fieldset>
        <fieldset disabled={!write} className="card flex flex-col gap-2">
          <h2 className="h2 mb-1">Serviços</h2>
          <div className="hidden md:grid grid-cols-[1fr_90px_140px] gap-2 text-xs font-medium text-muted"><span>Descrição</span><span>Qtd.</span><span>Preço unit. (€)</span></div>
          {rows.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_110px] md:grid-cols-[1fr_90px_140px] gap-2">
              <label className="sr-only" htmlFor={`d${i}`}>Descrição linha {i + 1}</label>
              <input id={`d${i}`} name={`d${i}`} defaultValue={it.descricao} className="input" placeholder={i === 0 ? "Ex.: Diagnóstico estratégico" : ""} />
              <label className="sr-only" htmlFor={`q${i}`}>Quantidade linha {i + 1}</label>
              <input id={`q${i}`} name={`q${i}`} type="number" step="any" min="0" defaultValue={it.qtd} className="input" />
              <label className="sr-only" htmlFor={`p${i}`}>Preço linha {i + 1}</label>
              <input id={`p${i}`} name={`p${i}`} type="number" step="0.01" defaultValue={it.preco || ""} className="input" />
            </div>
          ))}
          <div className="mt-2 flex flex-col items-end gap-1 text-sm">
            <span>Subtotal <strong className="font-semibold">{eur2(p.total)}</strong>{p.recurring ? " /mês" : ""}</span>
            <span className="text-muted">IVA {Number(p.vat_rate)}% {eur2(vat)} · Total {eur2(Number(p.total) + vat)}</span>
            <span className="text-xs text-muted">Os totais atualizam ao guardar.</span>
          </div>
        </fieldset>
        <fieldset disabled={!write} className="card grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-end">
          <label className="flex flex-col gap-1.5 col-span-full"><span className="label">Condições</span><textarea name="terms" rows={3} defaultValue={p.terms ?? ""} className="input py-2.5" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Válida até</span><input name="valid_until" type="date" defaultValue={p.valid_until ?? ""} className="input" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">IVA (%)</span><input name="vat_rate" type="number" step="0.01" defaultValue={p.vat_rate} className="input" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Estado</span>
            <select name="status" defaultValue={p.status} className="input">{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="flex items-center gap-2 pb-3 text-sm"><input type="checkbox" name="recurring" defaultChecked={p.recurring} className="h-4 w-4" /> Valores mensais (avença)</label>
          <p className="col-span-full text-xs text-muted">Ao marcar como <strong>Aceite</strong>, o negócio passa para “Ganho” (cria a receita recorrente e a tarefa de onboarding). Ao marcar como <strong>Enviada</strong>, fica registado no histórico.</p>
          {write && (
            <div className="col-span-full flex flex-wrap gap-2">
              <button className="btn">Guardar</button>
              <button formAction={saveProposalAndPrint} className="btn-ghost">Guardar e abrir PDF</button>
            </div>
          )}
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
