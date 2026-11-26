import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur2 } from "@/lib/format";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { saveProduct } from "../actions";

function Fields({ p }: { p?: { name: string; description: string | null; kind: string; price: number; duration_months: number; active: boolean; hours_per_unit?: number; delivery_weeks?: number } }) {
  return (
    <>
      <label className="flex flex-col gap-1.5 col-span-2"><span className="label">Nome</span><input name="name" defaultValue={p?.name} className="input" required /></label>
      <label className="flex flex-col gap-1.5 col-span-2"><span className="label">Descrição (aparece nas propostas)</span><input name="description" defaultValue={p?.description ?? ""} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Tipo</span><select name="kind" defaultValue={p?.kind ?? "one_off"} className="input"><option value="one_off">Pontual</option><option value="retainer">Avença mensal</option></select></label>
      <label className="flex flex-col gap-1.5"><span className="label">Preço sem IVA (€)</span><input name="price" type="number" step="0.01" min="0" defaultValue={p?.price} className="input" required /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Duração (meses, avenças)</span><input name="duration_months" type="number" min="1" defaultValue={p?.duration_months ?? 1} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Horas de entrega (por unidade/mês)</span><input name="hours_per_unit" type="number" step="0.5" min="0" defaultValue={p?.hours_per_unit ?? 0} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Duração da entrega (semanas)</span><input name="delivery_weeks" type="number" min="0" defaultValue={p?.delivery_weeks ?? 0} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Estado</span><select name="active" defaultValue={p?.active === false ? "off" : "on"} className="input"><option value="on">Ativo</option><option value="off">Arquivado</option></select></label>
    </>
  );
}

export default async function ProdutosPage() {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const year = new Date().getFullYear();
  const [{ data: products }, { data: deals }] = await Promise.all([
    supabase.from("products").select("*").eq("org_id", ctx.org.id).order("active", { ascending: false }).order("position"),
    supabase.from("v_deals").select("product_id, status, quantity, total_value, won_at").eq("org_id", ctx.org.id).not("product_id", "is", null),
  ]);
  const stat = new Map<string, { won: number; wonValue: number; open: number }>();
  (deals ?? []).forEach((d) => {
    const s = stat.get(d.product_id!) ?? { won: 0, wonValue: 0, open: 0 };
    if (d.status === "won" && d.won_at && new Date(d.won_at).getFullYear() === year) { s.won += Number(d.quantity); s.wonValue += Number(d.total_value); }
    if (d.status === "open") s.open += Number(d.quantity);
    stat.set(d.product_id!, s);
  });

  return (
    <>
      <PageHeader title="Produtos e serviços">
        {write && (
          <Disclosure label="+ Produto" primary>
            <form action={saveProduct} className="grid grid-cols-2 gap-3"><Fields /><button className="btn col-span-2">Criar produto</button></form>
          </Disclosure>
        )}
      </PageHeader>
      <p className="-mt-3 text-sm text-muted">Usados nas oportunidades e nas propostas. Vendas contadas em {year}.</p>
      {(products?.length ?? 0) === 0 ? <Empty>Sem produtos.</Empty> : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {products!.map((p) => {
            const s = stat.get(p.id) ?? { won: 0, wonValue: 0, open: 0 };
            return (
              <article key={p.id} className={`card flex flex-col gap-3 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><h2 className="text-[17px] font-semibold">{p.name}</h2>{p.description && <p className="text-xs text-muted">{p.description}</p>}</div>
                  <span className={`chip ${p.kind === "retainer" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-[#8F4300]"}`}>{p.kind === "retainer" ? "Avença" : "Pontual"}</span>
                </div>
                <div className="text-2xl font-bold tracking-[-0.5px]">{eur2(p.price)}{p.kind === "retainer" ? <span className="text-sm font-medium text-muted">/mês · {p.duration_months} meses</span> : null}</div>
                <div className="flex flex-wrap gap-4 text-xs text-ink-2">{Number(p.hours_per_unit) > 0 && <span>{String(Number(p.hours_per_unit)).replace(".", ",")} h · {eur2(Number(p.price) / Number(p.hours_per_unit))}/h</span>}<span className="text-good font-medium">{s.won} vendidos ({eur2(s.wonValue)})</span><span>{s.open} em negociação</span></div>
                {write && (
                  <details><summary className="cursor-pointer text-sm font-medium text-accent-ink">Editar</summary>
                    <form action={saveProduct} className="mt-3 grid grid-cols-2 gap-2"><input type="hidden" name="id" value={p.id} /><Fields p={p} /><button className="btn-ghost col-span-2">Guardar</button></form>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
