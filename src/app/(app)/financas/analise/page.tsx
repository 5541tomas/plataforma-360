import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { eur, eur2, today, dateShort } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { detectSubscriptions } from "@/lib/subscriptions";
import { markSubscription } from "./actions";

type Rec = { id: string; description: string; amount: number; category_id: string | null; scope: string; starts_on: string; ends_on: string | null };

export default async function AnalisePage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const ctx = await requireModule("finance");
  const sp = await searchParams;
  const key = sp.m && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today().slice(0, 7);
  const [y, mo] = key.split("-").map(Number);
  const start = `${key}-01`, end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7), next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const label = new Date(`${start}T00:00:00Z`).toLocaleDateString("pt-PT", { month: "long", year: "numeric", timeZone: "UTC" });
  const sixAgo = new Date(Date.UTC(y, mo - 7, 1)).toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase.rpc("sync_receivables", { p_org: ctx.org.id });

  const [{ data: recs }, { data: rcv }, { data: accounts }, { data: cats }, { data: marks }] = await Promise.all([
    supabase.from("recurring").select("id, description, amount, category_id, scope, starts_on, ends_on").eq("org_id", ctx.org.id).eq("active", true).lt("amount", 0),
    supabase.from("receivables").select("description, amount, status, received_at").eq("org_id", ctx.org.id).neq("status", "cancelled").gte("due_date", start).lte("due_date", end),
    supabase.from("v_account_balances").select("id, scope").eq("org_id", ctx.org.id),
    supabase.from("categories").select("id, name").eq("org_id", ctx.org.id),
    supabase.from("subscription_marks").select("pattern, status").eq("org_id", ctx.org.id),
  ]);
  const accIds = (accounts ?? []).map((a) => a.id);
  const { data: tx } = accIds.length
    ? await supabase.from("transactions").select("date, description, amount, category_id, is_transfer").in("account_id", accIds).gte("date", sixAgo).lte("date", end)
    : { data: [] };
  const monthTx = (tx ?? []).filter((t) => t.date >= start && !t.is_transfer);
  const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));

  // Despesas previstas (recorrentes ativos neste mês) vs real (mesma categoria)
  const active = ((recs ?? []) as Rec[]).filter((r) => r.starts_on <= end && (!r.ends_on || r.ends_on >= start));
  const recCats = new Set(active.map((r) => r.category_id).filter(Boolean));
  const expRows = active.map((r) => {
    const real = r.category_id ? -monthTx.filter((t) => t.category_id === r.category_id && t.amount < 0).reduce((s, t) => s + Number(t.amount), 0) : null;
    return { label: r.description, planned: -Number(r.amount), real };
  });
  const incPlanned = (rcv ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const incReal = (rcv ?? []).filter((r) => r.status === "received").reduce((s, r) => s + Number(r.amount), 0);
  const allIn = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0);
  const allOut = -monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0);
  const expPlanned = expRows.reduce((s, r) => s + r.planned, 0);
  const expRealPlanned = expRows.reduce((s, r) => s + (r.real ?? 0), 0);
  const unplanned = monthTx.filter((t) => t.amount < 0 && !recCats.has(t.category_id ?? "")).sort((a, b) => a.amount - b.amount);
  const unplannedTotal = -unplanned.reduce((s, t) => s + Number(t.amount), 0);
  // Por categoria (imprevistos)
  const byCat = new Map<string, number>();
  unplanned.forEach((t) => { const k = t.category_id ? catName.get(t.category_id) ?? "Outra" : "Sem categoria"; byCat.set(k, (byCat.get(k) ?? 0) - Number(t.amount)); });

  const subs = detectSubscriptions((tx ?? []).filter((t) => !t.is_transfer));
  const markBy = new Map((marks ?? []).map((m) => [m.pattern, m.status]));
  const visibleSubs = subs.filter((s) => markBy.get(s.pattern) !== "ignore");
  const subsMonthly = visibleSubs.filter((s) => !s.looksCancelled && markBy.get(s.pattern) !== "cancel").reduce((a, s) => a + s.monthly, 0);
  const toCancel = visibleSubs.filter((s) => markBy.get(s.pattern) === "cancel" && !s.looksCancelled);
  const diff = (a: number, b: number) => { const d = a - b; return <span className={d > 0.5 ? "text-warn" : d < -0.5 ? "text-good" : "text-muted"}>{d > 0 ? "+" : ""}{eur2(d)}</span>; };

  return (
    <>
      <PageHeader title="Análise do mês">
        <nav aria-label="Mês" className="flex items-center gap-2">
          <Link href={`/financas/analise?m=${prev}`} className="btn-ghost !min-h-10 !px-3" aria-label="Mês anterior">‹</Link>
          <span className="min-w-[160px] text-center text-[15px] font-semibold first-letter:uppercase">{label}</span>
          <Link href={`/financas/analise?m=${next}`} className="btn-ghost !min-h-10 !px-3" aria-label="Mês seguinte">›</Link>
        </nav>
      </PageHeader>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Recebimentos previstos</span><span className="text-[26px] font-bold tracking-[-0.6px]">{eur(incReal)} <span className="text-sm font-medium text-muted">/ {eur(incPlanned)}</span></span><span className="text-xs text-muted">entradas totais do mês {eur(allIn)}</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Despesas fixas</span><span className="text-[26px] font-bold tracking-[-0.6px]">{eur(expRealPlanned)} <span className="text-sm font-medium text-muted">/ {eur(expPlanned)}</span></span><span className="text-xs text-muted">recorrentes e prestações</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Despesas fora do previsto</span><span className="text-[26px] font-bold tracking-[-0.6px] text-warn">{eur(unplannedTotal)}</span><span className="text-xs text-muted">saídas totais do mês {eur(allOut)}</span></div>
        <div className="card !p-5 flex flex-col gap-1"><span className="text-[13px] text-muted">Subscrições ativas</span><span className="text-[26px] font-bold tracking-[-0.6px]">{eur(subsMonthly)}<span className="text-sm font-medium text-muted">/mês</span></span><span className="text-xs text-muted">{eur(subsMonthly * 12)} por ano</span></div>
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-1">
          <h2 className="h2 mb-2">Previsto vs real</h2>
          {expRows.length === 0 ? <Empty>Sem despesas recorrentes previstas para este mês.</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1.5 font-medium">Despesa</th><th className="py-1.5 text-right font-medium">Previsto</th><th className="py-1.5 text-right font-medium">Real</th><th className="py-1.5 text-right font-medium">Diferença</th></tr></thead>
              <tbody>{expRows.map((r) => (
                <tr key={r.label} className="border-t border-line"><td className="py-2">{r.label}</td><td className="py-2 text-right">{eur2(r.planned)}</td>
                  <td className="py-2 text-right">{r.real === null ? <span className="text-xs text-muted">sem categoria</span> : r.real === 0 ? <span className="text-xs text-warn">ainda não saiu</span> : eur2(r.real)}</td>
                  <td className="py-2 text-right">{r.real ? diff(r.real, r.planned) : "—"}</td></tr>
              ))}</tbody>
            </table>
          )}
          {(rcv ?? []).length > 0 && <Link href="/financas/cobrancas" className="mt-3 text-sm font-medium text-accent-ink">Ver recebimentos previstos em Cobranças ›</Link>}
        </div>

        <div className="card flex flex-col gap-2">
          <h2 className="h2 mb-1">Fora do previsto</h2>
          {unplanned.length === 0 ? <Empty>Sem despesas fora do previsto.</Empty> : (<>
            <div className="flex flex-wrap gap-2">{[...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => <span key={k} className="chip bg-[#F2F2F5] text-ink-2">{k} · {eur(v)}</span>)}</div>
            {unplanned.slice(0, 8).map((t, i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b border-[#F0F0F2] py-2 text-sm last:border-0">
                <span className="min-w-0 truncate">{t.description}<span className="block text-xs text-muted">{dateShort(t.date)}{t.category_id ? ` · ${catName.get(t.category_id)}` : ""}</span></span>
                <span className="font-semibold">{eur2(t.amount)}</span>
              </div>
            ))}
          </>)}
        </div>
      </section>

      <section className="card flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h2">Subscrições detetadas</h2>
          <span className="text-sm text-muted">pagamentos que se repetem todos os meses (últimos 6 meses)</span>
        </div>
        {toCancel.length > 0 && <p className="rounded-xl bg-warn-soft px-4 py-2.5 text-sm text-[#8F4300]">Marcaste para cancelar: {toCancel.map((s) => s.label).join(", ")} — continuam a ser cobradas ({eur2(toCancel.reduce((a, s) => a + s.monthly, 0))}/mês).</p>}
        {visibleSubs.length === 0 ? <Empty>Ainda não há histórico suficiente. Importa 3 ou mais meses de extratos para detetar subscrições.</Empty> : visibleSubs.map((s) => {
          const st = markBy.get(s.pattern);
          return (
            <div key={s.pattern} className="flex flex-wrap items-center gap-3 border-b border-[#F0F0F2] py-2.5 last:border-0">
              <div className="flex min-w-[200px] flex-1 flex-col"><span className="text-sm font-medium">{s.label}</span>
                <span className="text-xs text-muted">{s.months} meses · último {dateShort(s.last)}{s.looksCancelled ? " · parece cancelada" : ""}</span></div>
              <span className="text-sm font-semibold">{eur2(s.monthly)}/mês <span className="text-xs font-normal text-muted">({eur(s.annual)}/ano)</span></span>
              <div className="flex gap-1">
                {[["keep", "Mantenho"], ["cancel", "Cancelar"], ["ignore", "Não é subscrição"]].map(([v, l]) => (
                  <form key={v} action={markSubscription}><input type="hidden" name="pattern" value={s.pattern} /><input type="hidden" name="status" value={v} />
                    <button aria-pressed={st === v} className={`rounded-lg px-2.5 min-h-8 text-xs ${st === v ? (v === "cancel" ? "bg-warn-soft font-semibold text-[#8F4300]" : "bg-good-soft font-semibold text-[#1E6B30]") : "text-muted hover:bg-soft"}`}>{l}</button></form>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
