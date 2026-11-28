import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { ObjectionList, type Obj } from "@/components/ObjectionList";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { deleteObjection, markObjectionUsed, saveObjection, seedObjections } from "./actions";

export const metadata = { title: "Objeções" };

function Fields({ o }: { o?: Obj }) {
  return (
    <>
      <input type="hidden" name="id" value={o?.id ?? ""} />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <label className="flex flex-col gap-1.5"><span className="label">O que o cliente diz</span><input name="title" defaultValue={o?.title} required placeholder="«É muito caro.»" className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Categoria</span><input name="category" defaultValue={o?.category ?? "Preço"} list="obj-cats" className="input" /></label>
      </div>
      <label className="flex flex-col gap-1.5"><span className="label">O que costuma querer dizer</span><input name="meaning" defaultValue={o?.meaning ?? ""} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Resposta</span><textarea name="response" rows={4} defaultValue={o?.response} required className="input py-2.5" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Pergunta para fechar</span><input name="question" defaultValue={o?.question ?? ""} className="input" /></label>
    </>
  );
}

export default async function ObjectionsPage() {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const { data } = await supabase.from("objections").select("id, category, title, meaning, response, question, used").eq("org_id", ctx.org.id).order("used", { ascending: false }).order("position");
  const items = (data ?? []) as Obj[];
  return (
    <>
      <PageHeader title="Objeções" />
      <p className="-mt-2 max-w-[720px] text-sm text-muted">As respostas para os momentos difíceis da venda: acolher, perguntar, responder e pedir a decisão. Também as encontras dentro de cada negócio e na pesquisa (⌘K). As mais usadas sobem para o topo.</p>
      {items.length === 0 ? (
        <section className="card flex flex-wrap items-center justify-between gap-4">
          <div className="flex max-w-[560px] flex-col gap-1"><h2 className="text-[17px] font-semibold">Começa com 12 respostas prontas</h2><p className="text-sm text-muted">Preço, «vou pensar», «não tenho tempo», «tenho de falar com o sócio», «encontrei mais barato»… Todas editáveis.</p></div>
          {write && <form action={seedObjections}><button className="btn">Criar biblioteca</button></form>}
        </section>
      ) : <ObjectionList items={items} onUse={write ? markObjectionUsed : undefined} />}
      {write && (
        <section className="flex flex-col gap-3">
          <details className="card"><summary className="cursor-pointer font-semibold">+ Nova objeção</summary>
            <form action={saveObjection} className="mt-3 flex flex-col gap-3"><Fields /><button className="btn self-start">Guardar</button></form></details>
          {items.length > 0 && (
            <details className="card"><summary className="cursor-pointer font-semibold">Editar respostas</summary>
              <div className="mt-3 flex flex-col gap-2">{items.map((o) => (
                <details key={o.id} className="rounded-xl border border-line p-3"><summary className="cursor-pointer text-sm font-medium">{o.title}</summary>
                  <form action={saveObjection} className="mt-3 flex flex-col gap-3"><Fields o={o} /><div className="flex items-center gap-3"><button className="btn">Guardar</button></div></form>
                  <div className="mt-2"><ConfirmDelete action={deleteObjection} id={o.id} warning={`Apagar «${o.title}»?`} /></div>
                </details>))}</div>
            </details>
          )}
          <datalist id="obj-cats">{["Preço", "Timing", "Confiança", "Decisão", "Concorrência", "Necessidade"].map((c) => <option key={c} value={c} />)}</datalist>
        </section>
      )}
    </>
  );
}
