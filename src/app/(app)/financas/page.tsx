import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canRead, canWrite } from "@/lib/context";
import { eur, eur2, today, dateShort } from "@/lib/format";
import { Disclosure, Empty, Kpi, PageHeader } from "@/components/ui";
import { createAccount, createRecurring, createTransaction } from "./actions";

const TYPES: Record<string, string> = { checking: "À ordem", savings: "Poupança", investment: "Investimento", credit_card: "Cartão de crédito", loan: "Crédito / dívida", cash: "Numerário" };
type Scope = "personal" | "business" | "all";

export default async function FinancasPage({ searchParams }: { searchParams: Promise<{ s?: Scope }> }) {
  const ctx = await requireModule("finance");
  // As contas pessoais são sempre privadas (RLS); as da empresa dependem da permissão.
  const biz = canRead(ctx, "finance");
  const bizWrite = canWrite(ctx, "finance");
  const sp = await searchParams;
  const scope: Scope = !biz ? "personal" : sp.s ?? "all";
  const supabase = await createClient();

  const scopes = scope === "all" ? ["personal", "business"] : [scope];
  const monthStart = today().slice(0, 8) + "01";

  const [{ data: accounts }, { data: categories }, { data: recurring }] = await Promise.all([
    supabase.from("v_account_balances").select("*").eq("org_id", ctx.org.id).in("scope", scopes).order("scope"),
    supabase.from("categories").select("id, name, kind, scope").eq("org_id", ctx.org.id).order("name"),
    supabase.from("recurring").select("id, description, amount, scope, day_of_month, deal_id").eq("org_id", ctx.org.id).eq("active", true).in("scope", scopes).order("amount", { ascending: false }),
  ]);
  const accIds = (accounts ?? []).map((a) => a.id);
  const { data: tx } = accIds.length
    ? await supabase.from("transactions").select("id, date, description, amount, account_id, categories(name)").in("account_id", accIds).order("date", { ascending: false }).limit(25)
    : { data: [] };
  const { data: monthTx } = accIds.length
    ? await supabase.from("transactions").select("amount, is_transfer").in("account_id", accIds).gte("date", monthStart)
    : { data: [] };

  const accName = new Map((accounts ?? []).map((a) => [a.id, a.name]));
  const liquid = (accounts ?? []).filter((a) => ["checking", "savings", "cash"].includes(a.type)).reduce((s, a) => s + Number(a.balance), 0);
  const invest = (accounts ?? []).filter((a) => a.type === "investment").reduce((s, a) => s + Number(a.balance), 0);
  const debt = (accounts ?? []).filter((a) => ["loan", "credit_card"].includes(a.type)).reduce((s, a) => s + Number(a.balance), 0);
  const netWorth = liquid + invest + debt;
  const mIn = (monthTx ?? []).filter((t) => !t.is_transfer && t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const mOut = (monthTx ?? []).filter((t) => !t.is_transfer && t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
  const recIn = (recurring ?? []).filter((r) => r.amount > 0).reduce((s, r) => s + Number(r.amount), 0);
  const recOut = (recurring ?? []).filter((r) => r.amount < 0).reduce((s, r) => s + Number(r.amount), 0);
  const savingsRate = mIn > 0 ? Math.round(((mIn + mOut) / mIn) * 100) : null;
  const canAddScope = (s: "personal" | "business") => s === "personal" || bizWrite;
  const defaultScope = scope === "business" ? "business" : "personal";

  return (
    <>
      <PageHeader title="Finanças">
        {biz && (
          <nav className="seg" aria-label="Contexto">
            <Link href="/financas?s=personal" aria-current={scope === "personal" ? "true" : undefined}>Pessoal</Link>
            <Link href="/financas?s=business" aria-current={scope === "business" ? "true" : undefined}>Empresa</Link>
            <Link href="/financas?s=all" aria-current={scope === "all" ? "true" : undefined}>Consolidado</Link>
          </nav>
        )}
        <Disclosure label="Nova conta">
          <form action={createAccount} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required placeholder="Ex.: Santander ordenado" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Banco</span>
                <input name="bank" list="banks" className="input" /><datalist id="banks"><option value="Santander" /><option value="ActivoBank" /><option value="ABANCA" /></datalist></label>
              <label className="flex flex-col gap-1.5"><span className="label">Tipo</span>
                <select name="type" className="input">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Contexto</span>
                <select name="scope" defaultValue={defaultScope} className="input"><option value="personal">Pessoal</option>{bizWrite && <option value="business">Empresa</option>}</select></label>
              <label className="flex flex-col gap-1.5"><span className="label">Saldo inicial (€)</span><input name="opening_balance" type="number" step="0.01" className="input" defaultValue={0} /></label>
            </div>
            <p className="text-xs text-muted">Para créditos, usa um saldo negativo (ex.: −9000).</p>
            <button className="btn">Criar conta</button>
          </form>
        </Disclosure>
        {(accounts?.length ?? 0) > 0 && (
          <Disclosure label="+ Movimento" primary>
            <form action={createTransaction} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5"><span className="label">Descrição</span><input name="description" className="input" required /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Tipo</span>
                  <select name="direction" className="input"><option value="out">Saída</option><option value="in">Entrada</option></select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Valor (€)</span><input name="amount" type="number" step="0.01" min="0" className="input" required /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Conta</span>
                  <select name="account_id" className="input">{accounts!.filter((a) => canAddScope(a.scope)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Data</span><input name="date" type="date" defaultValue={today()} className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Categoria</span>
                <select name="category_id" className="input"><option value="">Sem categoria</option>
                  {(categories ?? []).filter((c) => scope === "all" || c.scope === scope).map((c) => <option key={c.id} value={c.id}>{c.scope === "business" ? "Empresa · " : "Pessoal · "}{c.name}</option>)}
                </select></label>
              <button className="btn">Guardar</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        <Kpi label="Património líquido" value={eur(netWorth)} hint={`Liquidez ${eur(liquid)} · Investido ${eur(invest)}`} />
        <Kpi label="Dívidas" value={eur(debt)} tone={debt < 0 ? "warn" : undefined} hint={debt < 0 ? "Créditos e cartões" : "Sem dívidas registadas"} />
        <Kpi label="Este mês" value={eur(mIn + mOut)} hint={`Entradas ${eur(mIn)} · Saídas ${eur(-mOut)}`} tone={mIn + mOut >= 0 ? "good" : "warn"} />
        <Kpi label={scope === "business" ? "Margem do mês" : "Taxa de poupança"} value={savingsRate === null ? "—" : `${savingsRate}%`} hint={`Recorrente: +${eur(recIn)} / ${eur(recOut)} por mês`} />
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-1">
          <h2 className="h2 mb-2">Contas</h2>
          {(accounts?.length ?? 0) === 0 && <Empty>Cria a tua primeira conta (ex.: Santander, ActivoBank, ABANCA).</Empty>}
          {(accounts ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 border-b border-[#F0F0F2] py-2.5 last:border-0">
              <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-xs font-bold ${a.scope === "business" ? "bg-accent-soft text-accent-ink" : "bg-good-soft text-[#1E6B30]"}`}>{(a.bank ?? a.name).slice(0, 2).toUpperCase()}</div>
              <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{a.name}</span><span className="text-xs text-muted">{a.scope === "business" ? "Empresa" : "Pessoal"} · {TYPES[a.type]}</span></div>
              <span className={`text-sm font-semibold ${Number(a.balance) < 0 ? "text-warn" : ""}`}>{eur2(a.balance)}</span>
            </div>
          ))}
        </div>

        <div className="card flex flex-col gap-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="h2">Recorrentes</h2>
            <Disclosure label="+ Recorrente">
              <form action={createRecurring} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Descrição</span><input name="description" className="input" required placeholder="Ex.: Renda, Adobe, Avença X" /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5"><span className="label">Tipo</span><select name="direction" className="input"><option value="out">Despesa</option><option value="in">Receita</option></select></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Valor mensal (€)</span><input name="amount" type="number" step="0.01" min="0" className="input" required /></label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5"><span className="label">Contexto</span><select name="scope" defaultValue={defaultScope} className="input"><option value="personal">Pessoal</option>{bizWrite && <option value="business">Empresa</option>}</select></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Dia do mês</span><input name="day" type="number" min="1" max="31" defaultValue={1} className="input" /></label>
                </div>
                <button className="btn">Guardar</button>
              </form>
            </Disclosure>
          </div>
          {(recurring?.length ?? 0) === 0 && <Empty>Sem recorrentes. As avenças ganhas no CRM aparecem aqui automaticamente.</Empty>}
          {(recurring ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 border-b border-[#F0F0F2] py-2.5 last:border-0">
              <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm truncate">{r.description}</span><span className="text-xs text-muted">Dia {r.day_of_month} · {r.scope === "business" ? "Empresa" : "Pessoal"}{r.deal_id ? " · via CRM" : ""}</span></div>
              <span className={`text-sm font-semibold ${r.amount > 0 ? "text-good" : ""}`}>{r.amount > 0 ? "+" : ""}{eur2(r.amount)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card flex flex-col gap-1">
        <h2 className="h2 mb-2">Movimentos recentes</h2>
        {(tx?.length ?? 0) === 0 && <Empty>Sem movimentos. Em breve: importação de extratos CSV do Santander, ActivoBank e ABANCA.</Empty>}
        {(tx ?? []).map((t) => (
          <div key={t.id} className="flex items-center gap-3 border-b border-[#F0F0F2] py-2.5 last:border-0">
            <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm truncate">{t.description}</span><span className="text-xs text-muted">{accName.get(t.account_id)} · {dateShort(t.date)}</span></div>
            {(t.categories as unknown as { name: string } | null)?.name && <span className="chip bg-[#F2F2F5] text-ink-2">{(t.categories as unknown as { name: string }).name}</span>}
            <span className={`min-w-[96px] text-right text-sm font-semibold ${t.amount > 0 ? "text-good" : ""}`}>{t.amount > 0 ? "+" : ""}{eur2(t.amount)}</span>
          </div>
        ))}
      </section>
    </>
  );
}
