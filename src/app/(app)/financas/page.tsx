import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { eur, eur2, today, dateShort } from "@/lib/format";
import { Disclosure, Empty, Kpi, PageHeader, Progress } from "@/components/ui";
import {
  createAccount, createCategory, createRecurring, createTransaction, deleteRecurring, deleteTransaction,
  setBudget, setInvestmentBalance, updateAccount, updateTransaction,
} from "./actions";

const TYPES: Record<string, string> = { checking: "À ordem", savings: "Poupança", investment: "Investimento", credit_card: "Cartão de crédito", loan: "Crédito / dívida", cash: "Numerário" };
type Scope = "personal" | "business" | "all";
type Cat = { id: string; name: string; kind: string; scope: string };

function monthInfo(m?: string) {
  const base = m && /^\d{4}-\d{2}$/.test(m) ? new Date(`${m}-01T00:00:00Z`) : new Date(`${today().slice(0, 7)}-01T00:00:00Z`);
  const y = base.getUTCFullYear(), mo = base.getUTCMonth();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    key: iso(base).slice(0, 7),
    start: iso(base),
    end: iso(new Date(Date.UTC(y, mo + 1, 0))),
    prev: iso(new Date(Date.UTC(y, mo - 1, 1))).slice(0, 7),
    next: iso(new Date(Date.UTC(y, mo + 1, 1))).slice(0, 7),
    label: base.toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export default async function FinancasPage({ searchParams }: { searchParams: Promise<{ s?: Scope; m?: string; f?: string }> }) {
  const ctx = await requireModule("finance");
  const bizWrite = canWrite(ctx, "finance");
  const sp = await searchParams;
  const scope: Scope = sp.s === "personal" || sp.s === "business" ? sp.s : "all";
  const month = monthInfo(sp.m);
  const onlyUncat = sp.f === "sem";
  const scopes = scope === "all" ? ["personal", "business"] : [scope];
  const budgetScope = scope === "business" ? "business" : "personal";
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams({ s: scope, m: month.key, ...(onlyUncat ? { f: "sem" } : {}) });
    Object.entries(o).forEach(([k, v]) => (v === undefined ? p.delete(k) : p.set(k, v)));
    return `/financas?${p.toString()}`;
  };
  const supabase = await createClient();

  const [{ data: accounts }, { data: catsRaw }, { data: recurring }, { data: budgets }] = await Promise.all([
    supabase.from("v_account_balances").select("*").eq("org_id", ctx.org.id).in("scope", scopes).order("scope").order("name"),
    supabase.from("categories").select("id, name, kind, scope").eq("org_id", ctx.org.id).order("name"),
    supabase.from("recurring").select("id, description, amount, scope, day_of_month, deal_id").eq("org_id", ctx.org.id).eq("active", true).in("scope", scopes).order("amount", { ascending: false }),
    supabase.from("budgets").select("category_id, amount").eq("org_id", ctx.org.id).eq("month", month.start).eq("scope", budgetScope),
  ]);
  const cats = (catsRaw ?? []) as Cat[];
  const accIds = (accounts ?? []).map((a) => a.id);
  let txq = supabase.from("transactions").select("id, date, description, amount, account_id, category_id, is_transfer")
    .in("account_id", accIds.length ? accIds : ["00000000-0000-0000-0000-000000000000"])
    .gte("date", month.start).lte("date", month.end).order("date", { ascending: false }).order("created_at", { ascending: false });
  if (onlyUncat) txq = txq.is("category_id", null).eq("is_transfer", false);
  const { data: tx } = await txq.limit(400);
  const { data: monthAll } = accIds.length
    ? await supabase.from("transactions").select("amount, is_transfer, category_id, account_id").in("account_id", accIds).gte("date", month.start).lte("date", month.end)
    : { data: [] };

  const accById = new Map((accounts ?? []).map((a) => [a.id, a]));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const liquid = (accounts ?? []).filter((a) => ["checking", "savings", "cash"].includes(a.type)).reduce((s, a) => s + Number(a.balance), 0);
  const invest = (accounts ?? []).filter((a) => a.type === "investment").reduce((s, a) => s + Number(a.balance), 0);
  const debt = (accounts ?? []).filter((a) => ["loan", "credit_card"].includes(a.type)).reduce((s, a) => s + Number(a.balance), 0);
  const real = (monthAll ?? []).filter((t) => !t.is_transfer);
  const mIn = real.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const mOut = real.filter((t) => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
  const uncategorized = real.filter((t) => !t.category_id).length;
  const savingsRate = mIn > 0 ? Math.round(((mIn + mOut) / mIn) * 100) : null;

  // Orçamentos: gasto por categoria (apenas contas do âmbito do orçamento)
  const spent = new Map<string, number>();
  (monthAll ?? []).forEach((t) => {
    if (t.is_transfer || !t.category_id || t.amount >= 0) return;
    if (accById.get(t.account_id)?.scope !== budgetScope) return;
    spent.set(t.category_id, (spent.get(t.category_id) ?? 0) - Number(t.amount));
  });
  const budgetMap = new Map((budgets ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const expenseCats = cats.filter((c) => c.scope === budgetScope && c.kind === "expense");
  const budgetRows = expenseCats
    .map((c) => ({ ...c, budget: budgetMap.get(c.id) ?? 0, spent: spent.get(c.id) ?? 0 }))
    .filter((c) => c.budget > 0 || c.spent > 0)
    .sort((a, b) => b.budget - a.budget || b.spent - a.spent);
  const canBudget = budgetScope === "personal" || bizWrite;

  const writableAccounts = (accounts ?? []).filter((a) => a.scope === "personal" || bizWrite);
  const catOptions = (s?: string) => cats.filter((c) => !s || c.scope === s);
  const defaultScope = scope === "business" ? "business" : "personal";

  return (
    <>
      <PageHeader title="Finanças">
        <nav className="seg" aria-label="Contexto">
          <Link href={qs({ s: "personal" })} aria-current={scope === "personal" ? "true" : undefined}>Pessoal</Link>
          <Link href={qs({ s: "business" })} aria-current={scope === "business" ? "true" : undefined}>Empresa</Link>
          <Link href={qs({ s: "all" })} aria-current={scope === "all" ? "true" : undefined}>Consolidado</Link>
        </nav>
        <Link href="/financas/importar" className="btn-ghost">Importar extrato</Link>
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
            <p className="text-xs text-muted">Dica: se vais importar extratos, põe o saldo que a conta tinha <em>antes</em> do primeiro movimento importado. Para créditos, usa um valor negativo.</p>
            <button className="btn">Criar conta</button>
          </form>
        </Disclosure>
        {writableAccounts.length > 0 && (
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
                  <select name="account_id" className="input">{writableAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="label">Data</span><input name="date" type="date" defaultValue={today()} className="input" /></label>
              </div>
              <label className="flex flex-col gap-1.5"><span className="label">Categoria</span>
                <select name="category_id" className="input"><option value="">Sem categoria</option>
                  {catOptions(scope === "all" ? undefined : scope).map((c) => <option key={c.id} value={c.id}>{c.scope === "business" ? "Empresa · " : "Pessoal · "}{c.name}</option>)}
                </select></label>
              <button className="btn">Guardar</button>
            </form>
          </Disclosure>
        )}
      </PageHeader>

      <nav aria-label="Mês" className="flex items-center gap-2">
        <Link href={qs({ m: month.prev })} className="btn-ghost !min-h-10 !px-3" aria-label="Mês anterior">‹</Link>
        <span className="min-w-[170px] text-center text-[17px] font-semibold first-letter:uppercase">{month.label}</span>
        <Link href={qs({ m: month.next })} className="btn-ghost !min-h-10 !px-3" aria-label="Mês seguinte">›</Link>
        {month.key !== today().slice(0, 7) && <Link href={qs({ m: today().slice(0, 7) })} className="text-sm font-medium text-accent-ink ml-2">Hoje</Link>}
      </nav>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(210px,1fr))]">
        <Kpi label="Património líquido (hoje)" value={eur(liquid + invest + debt)} hint={`Liquidez ${eur(liquid)} · Investido ${eur(invest)}`} />
        <Kpi label="Dívidas" value={eur(debt)} tone={debt < 0 ? "warn" : undefined} hint={debt < 0 ? "Créditos e cartões" : "Sem dívidas registadas"} />
        <Kpi label="Resultado do mês" value={eur(mIn + mOut)} hint={`Entradas ${eur(mIn)} · Saídas ${eur(-mOut)}`} tone={mIn + mOut >= 0 ? "good" : "warn"} />
        <Kpi label={scope === "business" ? "Margem do mês" : "Taxa de poupança"} value={savingsRate === null ? "—" : `${savingsRate}%`}
          hint={uncategorized > 0 ? <Link href={qs({ f: "sem" })} className="text-warn font-medium">{uncategorized} por categorizar</Link> : "Tudo categorizado"} />
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-1">
          <h2 className="h2 mb-2">Contas</h2>
          {(accounts?.length ?? 0) === 0 && <Empty>Cria a tua primeira conta (ex.: Santander, ActivoBank, ABANCA).</Empty>}
          {(accounts ?? []).map((a) => {
            const editable = a.scope === "personal" || bizWrite;
            return (
              <div key={a.id} className="border-b border-[#F0F0F2] py-2.5 last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-bold ${a.scope === "business" ? "bg-accent-soft text-accent-ink" : "bg-good-soft text-[#1E6B30]"}`}>{(a.bank ?? a.name).slice(0, 2).toUpperCase()}</div>
                  <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm font-medium truncate">{a.name}</span><span className="text-xs text-muted">{a.scope === "business" ? "Empresa" : "Pessoal"} · {TYPES[a.type]}</span></div>
                  <span className={`text-sm font-semibold ${Number(a.balance) < 0 ? "text-warn" : ""}`}>{eur2(a.balance)}</span>
                </div>
                {editable && (
                  <details className="mt-1 pl-12 text-xs">
                    <summary className="cursor-pointer font-medium text-accent-ink">Editar</summary>
                    <form action={updateAccount} className="mt-2 grid grid-cols-2 gap-2">
                      <input type="hidden" name="id" value={a.id} />
                      <label className="flex flex-col gap-1"><span className="label">Nome</span><input name="name" defaultValue={a.name} className="input !min-h-9 !text-xs" required /></label>
                      <label className="flex flex-col gap-1"><span className="label">Banco</span><input name="bank" defaultValue={a.bank ?? ""} className="input !min-h-9 !text-xs" /></label>
                      <label className="flex flex-col gap-1"><span className="label">Saldo inicial</span><input name="opening_balance" type="number" step="0.01" defaultValue={a.opening_balance} className="input !min-h-9 !text-xs" /></label>
                      <label className="flex items-end gap-2 pb-2"><input type="checkbox" name="archived" className="h-4 w-4" /> Arquivar conta</label>
                      <button className="btn !min-h-9 !text-xs col-span-2">Guardar</button>
                    </form>
                    {a.type === "investment" && (
                      <form action={setInvestmentBalance} className="mt-2 flex gap-2">
                        <input type="hidden" name="id" value={a.id} />
                        <label className="sr-only" htmlFor={`bal-${a.id}`}>Valor atual</label>
                        <input id={`bal-${a.id}`} name="balance" type="number" step="0.01" placeholder="Valor atual da carteira" className="input !min-h-9 !text-xs" required />
                        <button className="btn-ghost !min-h-9 !px-3 !text-xs whitespace-nowrap">Atualizar valor</button>
                      </form>
                    )}
                  </details>
                )}
              </div>
            );
          })}
        </div>

        <div className="card flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h2">Orçamento · {budgetScope === "business" ? "Empresa" : "Pessoal"}</h2>
            {canBudget && (
              <Disclosure label="Definir">
                <form action={setBudget} className="flex flex-col gap-3">
                  <input type="hidden" name="month" value={month.start} />
                  <input type="hidden" name="scope" value={budgetScope} />
                  <label className="flex flex-col gap-1.5"><span className="label">Categoria</span>
                    <select name="category_id" className="input">{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Limite mensal (€) · 0 remove</span><input name="amount" type="number" step="1" min="0" className="input" required /></label>
                  <button className="btn">Guardar para {month.label}</button>
                </form>
              </Disclosure>
            )}
          </div>
          {budgetRows.length === 0 && <Empty>Sem orçamento para este mês. Define limites por categoria.</Empty>}
          {budgetRows.map((b) => {
            const over = b.budget > 0 && b.spent > b.budget;
            return (
              <div key={b.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm"><span>{b.name}</span>
                  <span className={over ? "text-warn" : "text-ink-2"}><strong className="font-semibold">{eur(b.spent)}</strong>{b.budget > 0 ? ` / ${eur(b.budget)}` : " · sem limite"}</span></div>
                {b.budget > 0 && <Progress value={(b.spent / b.budget) * 100} className={over ? "[&>div]:!bg-[#C25E00]" : ""} />}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card flex flex-col gap-1">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="h2">{onlyUncat ? "Por categorizar" : "Movimentos"} · {month.label}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {onlyUncat ? <Link href={qs({ f: undefined })} className="font-medium text-accent-ink">Ver todos</Link>
              : uncategorized > 0 && <Link href={qs({ f: "sem" })} className="font-medium text-accent-ink">Só por categorizar ({uncategorized})</Link>}
            <Disclosure label="+ Categoria">
              <form action={createCategory} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5"><span className="label">Nome</span><input name="name" className="input" required /></label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5"><span className="label">Tipo</span><select name="kind" className="input"><option value="expense">Despesa</option><option value="income">Receita</option></select></label>
                  <label className="flex flex-col gap-1.5"><span className="label">Contexto</span><select name="scope" defaultValue={defaultScope} className="input"><option value="personal">Pessoal</option>{bizWrite && <option value="business">Empresa</option>}</select></label>
                </div>
                <button className="btn">Criar categoria</button>
              </form>
            </Disclosure>
          </div>
        </div>
        {(tx?.length ?? 0) === 0 && <Empty>{onlyUncat ? "Tudo categorizado neste mês." : <>Sem movimentos neste mês. <Link href="/financas/importar" className="font-medium text-accent-ink">Importar extrato</Link></>}</Empty>}
        {(tx ?? []).map((t) => {
          const acc = accById.get(t.account_id);
          const editable = acc && (acc.scope === "personal" || bizWrite);
          return (
            <div key={t.id} className="border-b border-[#F0F0F2] py-2.5 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm truncate">{t.description}</span><span className="text-xs text-muted">{acc?.name} · {dateShort(t.date)}</span></div>
                {t.is_transfer ? <span className="chip bg-[#F2F2F5] text-muted">Transferência</span>
                  : t.category_id ? <span className="chip bg-[#F2F2F5] text-ink-2">{catName.get(t.category_id)}</span>
                  : <span className="chip bg-warn-soft text-[#8F4300]">Sem categoria</span>}
                <span className={`min-w-[96px] text-right text-sm font-semibold ${t.amount > 0 ? "text-good" : ""}`}>{t.amount > 0 ? "+" : ""}{eur2(t.amount)}</span>
              </div>
              {editable && (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer font-medium text-accent-ink">Editar</summary>
                  <form action={updateTransaction} className="mt-2 grid gap-2 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-end">
                    <input type="hidden" name="id" value={t.id} />
                    <label className="flex flex-col gap-1 col-span-full"><span className="label">Descrição</span><input name="description" defaultValue={t.description} className="input !min-h-9 !text-xs" required /></label>
                    <label className="flex flex-col gap-1"><span className="label">Categoria</span>
                      <select name="category_id" defaultValue={t.category_id ?? ""} className="input !min-h-9 !text-xs"><option value="">Sem categoria</option>
                        {catOptions(acc!.scope).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label className="flex flex-col gap-1"><span className="label">Valor (− saída)</span><input name="amount" type="number" step="0.01" defaultValue={t.amount} className="input !min-h-9 !text-xs" required /></label>
                    <label className="flex flex-col gap-1"><span className="label">Data</span><input name="date" type="date" defaultValue={t.date} className="input !min-h-9 !text-xs" required /></label>
                    <label className="flex items-center gap-2 pb-2"><input type="checkbox" name="is_transfer" defaultChecked={t.is_transfer} className="h-4 w-4" /> Transferência entre contas</label>
                    <label className="flex items-center gap-2 pb-2 col-span-full"><input type="checkbox" name="apply_all" defaultChecked className="h-4 w-4" /> Aplicar a categoria a movimentos iguais sem categoria (e lembrar para o futuro)</label>
                    <button className="btn !min-h-9 !text-xs">Guardar</button>
                  </form>
                  <form action={deleteTransaction} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-warn font-medium min-h-8">Apagar movimento</button>
                  </form>
                </details>
              )}
            </div>
          );
        })}
      </section>

      <section className="card flex flex-col gap-1">
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
            {(r.scope === "personal" || bizWrite) && (
              <form action={deleteRecurring}><input type="hidden" name="id" value={r.id} />
                <button aria-label={`Terminar recorrente ${r.description}`} className="min-h-8 rounded-lg px-2 text-xs text-muted hover:text-warn">Terminar</button></form>
            )}
          </div>
        ))}
      </section>
    </>
  );
}
