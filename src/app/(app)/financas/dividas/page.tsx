import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur, eur2 } from "@/lib/format";
import { Disclosure, Empty, PageHeader, Progress } from "@/components/ui";
import { archiveDebt, payInstallment, saveDebt } from "./actions";
import { DebtPlanner } from "@/components/DebtPlanner";

type Debt = {
  id: string; name: string; lender: string | null; kind: string; scope: string; balance_start: number; start_date: string;
  monthly_payment: number | null; end_date: string | null; day_of_month: number; account_id: string | null; notes: string | null; archived: boolean;
  paid: number; remaining: number; progress: number; months_left: number | null; projected_end: string | null; expected_paid: number | null; paid_this_month: boolean;
};
const KIND: Record<string, string> = { loan: "Crédito", credit_card: "Cartão de crédito", other: "Outra dívida" };
const monthYear = (s: string) => new Date(s).toLocaleDateString("pt-PT", { month: "long", year: "numeric" });

function DebtFields({ d, accounts, bizWrite }: { d?: Debt; accounts: { id: string; name: string }[]; bizWrite: boolean }) {
  return (
    <>
      <label className="flex flex-col gap-1.5 col-span-2"><span className="label">Nome</span><input name="name" defaultValue={d?.name} required placeholder="Ex.: Crédito automóvel" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Credor</span><input name="lender" defaultValue={d?.lender ?? ""} placeholder="Ex.: ActivoBank" className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Tipo</span>
        <select name="kind" defaultValue={d?.kind ?? "loan"} className="input">{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {!d && (
        <label className="flex flex-col gap-1.5"><span className="label">Âmbito</span>
          <select name="scope" className="input"><option value="personal">Pessoal</option>{bizWrite && <option value="business">Empresa</option>}</select></label>
      )}
      <label className="flex flex-col gap-1.5"><span className="label">{d ? "Valor em dívida hoje (€)" : "Quanto deves hoje (€)"}</span><input name="balance" type="number" step="0.01" min="0" defaultValue={d ? Math.round(d.remaining * 100) / 100 : undefined} required={!d} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Prestação mensal (€)</span><input name="monthly_payment" type="number" step="0.01" min="0" defaultValue={d?.monthly_payment ?? undefined} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Fica liquidada em</span><input name="end_date" type="date" defaultValue={d?.end_date ?? undefined} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Dia do débito</span><input name="day_of_month" type="number" min="1" max="31" defaultValue={d?.day_of_month ?? 1} className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">Sai da conta</span>
        <select name="account_id" defaultValue={d?.account_id ?? ""} className="input"><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {d && <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" name="reset_balance" className="h-4 w-4" /> Corrigir o valor em dívida para o indicado acima (recomeça a contagem hoje)</label>}
      <p className="col-span-2 text-xs text-muted">Se só souberes a prestação ou a data de fim, preenche uma delas e a outra é calculada.</p>
    </>
  );
}

export default async function DividasPage() {
  const ctx = await requireModule("finance");
  const bizWrite = canWrite(ctx, "finance");
  const supabase = await createClient();
  const [{ data: debtsRaw }, { data: accounts }] = await Promise.all([
    supabase.from("v_debts").select("*").eq("org_id", ctx.org.id).eq("archived", false).order("created_at"),
    supabase.from("v_account_balances").select("id, name, type, balance, scope").eq("org_id", ctx.org.id),
  ]);
  const debts = (debtsRaw ?? []) as Debt[];
  const payAccounts = (accounts ?? []).filter((a) => ["checking", "savings", "cash"].includes(a.type));
  const total = debts.reduce((s, d) => s + Number(d.remaining), 0);
  const monthly = debts.filter((d) => Number(d.remaining) > 0).reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0);
  const ends = debts.filter((d) => Number(d.remaining) > 0).map((d) => d.end_date ?? d.projected_end).filter(Boolean) as string[];
  const freedom = ends.sort().pop();
  const liquid = payAccounts.reduce((s, a) => s + Number(a.balance), 0);
  const invest = (accounts ?? []).filter((a) => a.type === "investment").reduce((s, a) => s + Number(a.balance), 0);
  const incomplete = debts.filter((d) => !d.monthly_payment || !d.end_date);

  return (
    <>
      <PageHeader title="Dívidas">
        <Disclosure label="+ Dívida" primary>
          <form action={saveDebt} className="grid grid-cols-2 gap-3">
            <DebtFields accounts={payAccounts} bizWrite={bizWrite} />
            <button className="btn col-span-2">Guardar dívida</button>
          </form>
        </Disclosure>
      </PageHeader>
      <p className="-mt-3 text-sm text-muted">No dia a dia, só a prestação conta — como despesa do mês. Tudo o que pagares na categoria de cada dívida (importado do banco ou registado aqui) abate automaticamente ao valor em falta.</p>

      {debts.length === 0 ? <Empty>Sem dívidas registadas. Bom sinal!</Empty> : (<>
        <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Total em dívida</span><span className="text-[28px] font-bold tracking-[-0.7px]">{eur(total)}</span><span className="text-xs text-muted">{debts.length} dívida(s)</span></div>
          <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Prestações por mês</span><span className="text-[28px] font-bold tracking-[-0.7px]">{eur(monthly)}</span><span className="text-xs text-muted">entram nas despesas de cada mês</span></div>
          <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Livre de dívidas em</span><span className="text-[28px] font-bold tracking-[-0.7px] first-letter:uppercase">{freedom ? monthYear(freedom) : "—"}</span><span className="text-xs text-muted">{freedom ? "última dívida liquidada" : "completa as prestações para calcular"}</span></div>
          <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Património líquido</span><span className="text-[28px] font-bold tracking-[-0.7px]">{eur(liquid + invest - total)}</span><span className="text-xs text-muted">liquidez {eur(liquid)} + investido {eur(invest)} − dívidas</span></div>
        </section>

        {incomplete.length > 0 && (
          <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-ink">Completa a prestação mensal e a data de fim de: <strong className="font-semibold">{incomplete.map((d) => d.name).join(", ")}</strong> (botão “Editar” no cartão).</p>
        )}

        {debts.filter((d) => Number(d.remaining) > 0).length > 0 && (
          <section className="card flex flex-col gap-3">
            <h2 className="h2">Estratégia: livra-te das dívidas mais cedo</h2>
            <DebtPlanner debts={debts.map((d) => ({ id: d.id, name: d.name, remaining: Number(d.remaining), payment: Number(d.monthly_payment ?? 0) }))} />
          </section>
        )}

        <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
          {debts.map((d) => {
            const remaining = Number(d.remaining);
            const behind = d.expected_paid !== null && Number(d.expected_paid) - Number(d.paid) >= Number(d.monthly_payment ?? Infinity) - 0.01;
            const behindN = behind && d.monthly_payment ? Math.floor((Number(d.expected_paid) - Number(d.paid)) / Number(d.monthly_payment) + 0.01) : 0;
            const status = remaining <= 0 ? { t: "Liquidada", c: "bg-good-soft text-[#1E6B30]" }
              : !d.monthly_payment ? { t: "Por completar", c: "bg-accent-soft text-accent-ink" }
              : d.paid_this_month ? { t: "Paga este mês", c: "bg-good-soft text-[#1E6B30]" }
              : behind ? { t: `${behindN} prestação(ões) em atraso`, c: "bg-warn-soft text-[#8F4300]" }
              : { t: "Em dia", c: "bg-[#F2F2F5] text-ink-2" };
            const lateEnd = d.end_date && d.projected_end && d.projected_end > d.end_date;
            return (
              <article key={d.id} className="card flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div><span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted">{KIND[d.kind]}{d.lender ? ` · ${d.lender}` : ""} · {d.scope === "business" ? "Empresa" : "Pessoal"}</span>
                    <h2 className="text-[18px] font-semibold">{d.name}</h2></div>
                  <span className={`chip ${status.c}`}>{status.t}</span>
                </div>
                <div className="flex items-baseline gap-2"><span className="text-[28px] font-bold tracking-[-0.7px]">{eur2(remaining)}</span><span className="text-sm text-muted">em falta</span></div>
                <Progress value={Number(d.progress) * 100} className="!h-2.5" />
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted"><span>Pago {eur2(d.paid)} de {eur2(d.balance_start)} ({Math.round(Number(d.progress) * 100)}%)</span>
                  {d.months_left !== null && remaining > 0 && <span>{d.months_left} prestação(ões) em falta</span>}</div>
                <div className="flex flex-col gap-1 border-t border-line pt-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted">Prestação</span><span className="font-medium">{d.monthly_payment ? `${eur2(d.monthly_payment)} · dia ${d.day_of_month}` : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted">Fica liquidada em</span><span className="font-medium first-letter:uppercase">{d.end_date ? monthYear(d.end_date) : d.projected_end ? monthYear(d.projected_end) : "—"}</span></div>
                  {lateEnd && <p className="text-xs text-warn">Ao ritmo atual só acaba em {monthYear(d.projected_end!)}.</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {remaining > 0 && d.monthly_payment && !d.paid_this_month && (
                    <form action={payInstallment} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={d.id} />
                      {!d.account_id && <select name="account_id" aria-label="Conta" required className="input !min-h-10 !w-auto"><option value="">Conta…</option>{payAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
                      <button className="btn !min-h-10">Registar prestação deste mês</button>
                    </form>
                  )}
                  <details className="w-full">
                    <summary className="cursor-pointer text-sm font-medium text-accent-ink min-h-8">Editar</summary>
                    <form action={saveDebt} className="mt-3 grid grid-cols-2 gap-3">
                      <input type="hidden" name="id" value={d.id} />
                      <DebtFields d={d} accounts={payAccounts} bizWrite={bizWrite} />
                      <button className="btn-ghost col-span-2">Guardar</button>
                    </form>
                    <form action={archiveDebt} className="mt-2"><input type="hidden" name="id" value={d.id} /><button className="text-sm font-medium text-warn min-h-9">{remaining <= 0 ? "Arquivar (liquidada)" : "Remover dívida"}</button></form>
                  </details>
                </div>
              </article>
            );
          })}
        </section>
      </>)}
    </>
  );
}
