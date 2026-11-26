import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/context";
import { eur } from "@/lib/format";
import { Empty, Kpi, PageHeader, Progress } from "@/components/ui";

type D = { id: string; status: string; stage_id: string; pipeline_id: string; source: string | null; product_id: string | null; product_name: string | null; quantity: number; total_value: number; weighted_value: number; created_at: string; won_at: string | null; expected_close: string | null; kind: string; value: number };

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const ctx = await requireModule("crm");
  const sp = await searchParams;
  const year = Number(sp.y) || new Date().getFullYear();
  const supabase = await createClient();
  const [{ data: dealsRaw }, { data: stages }, { data: acts }, { data: krs }] = await Promise.all([
    supabase.from("v_deals").select("id, status, stage_id, pipeline_id, source, product_id, product_name, quantity, total_value, weighted_value, created_at, won_at, expected_close, kind, value").eq("org_id", ctx.org.id),
    supabase.from("stages").select("id, name, position, is_won, is_lost, pipeline_id").eq("org_id", ctx.org.id).order("position"),
    supabase.from("activities").select("deal_id, summary").eq("org_id", ctx.org.id).like("summary", "Proposta enviada%"),
    supabase.from("key_results").select("label, target_value, goals!inner(horizon, period_start)").eq("org_id", ctx.org.id),
  ]);
  const deals = (dealsRaw ?? []) as D[];
  const inYear = (s?: string | null) => !!s && new Date(s).getFullYear() === year;
  const won = deals.filter((d) => d.status === "won" && inYear(d.won_at));
  const lost = deals.filter((d) => d.status === "lost" && inYear(d.created_at));
  const wonValue = won.reduce((s, d) => s + Number(d.total_value), 0);
  const winRate = won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null;
  const cycle = won.length ? Math.round(won.reduce((s, d) => s + (new Date(d.won_at!).getTime() - new Date(d.created_at).getTime()) / 864e5, 0) / won.length) : null;
  const avgTicket = won.length ? wonValue / won.length : 0;

  // Funil: quantos negócios chegaram a cada etapa (ou além), no 1.º pipeline
  const pipe = stages?.[0]?.pipeline_id;
  const pStages = (stages ?? []).filter((s) => s.pipeline_id === pipe && !s.is_lost);
  const pos = new Map((stages ?? []).map((s) => [s.id, s]));
  const pDeals = deals.filter((d) => d.pipeline_id === pipe);
  const funnel = pStages.map((s) => ({
    name: s.name,
    count: pDeals.filter((d) => { const st = pos.get(d.stage_id); return st && !st.is_lost ? st.position >= s.position : false; }).length
      + (s.position === 0 ? pDeals.filter((d) => pos.get(d.stage_id)?.is_lost).length : 0),
  }));
  const top = Math.max(1, ...funnel.map((f) => f.count));

  // Por origem
  const bySource = new Map<string, { n: number; won: number; value: number }>();
  deals.forEach((d) => {
    const k = d.source || "Sem origem";
    const s = bySource.get(k) ?? { n: 0, won: 0, value: 0 };
    s.n++; if (d.status === "won") { s.won++; s.value += Number(d.total_value); }
    bySource.set(k, s);
  });

  // Produtos vendidos vs objetivos anuais (KR com o mesmo nome base)
  const annualKr = (krs ?? []).filter((k) => {
    const g = k.goals as unknown as { horizon: string; period_start: string };
    return g.horizon === "year" && new Date(g.period_start).getFullYear() === year;
  });
  const byProduct = new Map<string, { qty: number; value: number }>();
  won.forEach((d) => { if (!d.product_name) return; const s = byProduct.get(d.product_name) ?? { qty: 0, value: 0 }; s.qty += Number(d.quantity); s.value += Number(d.total_value); byProduct.set(d.product_name, s); });
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const keyOf = (n: string) => { const x = norm(n); return x.includes("8 sess") ? "program" : x.includes("tarde") ? "tarde" : x.includes("1:1") ? "1:1" : x.includes("imers") ? "imers" : x.includes("continuidade") || x.includes("avenca") ? "contin" : x; };
  const targets = [...byProduct.keys(), ...annualKr.map((k) => k.label)].map(keyOf);
  const rows = [...new Set(targets)].map((key) => {
    const prod = [...byProduct.entries()].find(([n]) => keyOf(n) === key);
    const kr = annualKr.find((k) => keyOf(k.label) === key);
    return { name: prod?.[0] ?? kr?.label ?? key, qty: prod?.[1].qty ?? 0, value: prod?.[1].value ?? 0, target: kr ? Number(kr.target_value) : null };
  }).filter((r) => r.qty > 0 || r.target);

  // Previsão por mês de fecho (ponderado)
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() + i, 1); return d.toISOString().slice(0, 7); });
  const forecast = months.map((m) => ({ m, v: deals.filter((d) => d.status === "open" && d.expected_close?.startsWith(m)).reduce((s, d) => s + Number(d.weighted_value), 0) }));
  const fmax = Math.max(1, ...forecast.map((f) => f.v));
  const sentProposals = new Set((acts ?? []).map((a) => a.deal_id)).size;

  return (
    <>
      <PageHeader eyebrow="CRM" title={`Relatórios ${year}`}>
        <nav className="seg" aria-label="Ano">{[year - 1, year, year + 1].map((y) => <a key={y} href={`/crm/relatorios?y=${y}`} aria-current={y === year ? "true" : undefined}>{y}</a>)}</nav>
      </PageHeader>
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
        <Kpi label="Vendido no ano" value={eur(wonValue)} hint={`${won.length} negócios ganhos`} tone={wonValue > 0 ? "good" : undefined} />
        <Kpi label="Taxa de ganho" value={winRate === null ? "—" : `${winRate}%`} hint={`${won.length} ganhos · ${lost.length} perdidos`} />
        <Kpi label="Ticket médio" value={eur(avgTicket)} />
        <Kpi label="Ciclo médio de venda" value={cycle === null ? "—" : `${cycle} dias`} hint={`${sentProposals} propostas enviadas`} />
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Funil de vendas</h2>
          {pDeals.length === 0 ? <Empty>Sem negócios ainda.</Empty> : funnel.map((f, i) => (
            <div key={f.name} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm">{f.name}</span>
              <div className="flex-1"><div className="h-7 rounded-lg bg-accent" style={{ width: `${Math.max(4, (f.count / top) * 100)}%`, opacity: 1 - i * 0.12 }} /></div>
              <span className="w-20 text-right text-sm font-semibold">{f.count}{i > 0 && funnel[i - 1].count ? <span className="ml-1 text-xs font-normal text-muted">{Math.round((f.count / funnel[i - 1].count) * 100)}%</span> : null}</span>
            </div>
          ))}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="h2">Vendas por produto vs objetivos {year}</h2>
          {rows.length === 0 ? <Empty>Sem vendas nem objetivos por produto neste ano.</Empty> : rows.map((r) => (
            <div key={r.name} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-3 text-sm"><span>{r.name}</span><span className="text-ink-2"><strong className="font-semibold">{r.qty}</strong>{r.target ? ` / ${r.target}` : ""} · {eur(r.value)}</span></div>
              {r.target ? <Progress value={(r.qty / r.target) * 100} /> : null}
            </div>
          ))}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="h2">Origem dos negócios</h2>
          {bySource.size === 0 ? <Empty>Sem dados.</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1.5 font-medium">Origem</th><th className="py-1.5 text-right font-medium">Negócios</th><th className="py-1.5 text-right font-medium">Ganhos</th><th className="py-1.5 text-right font-medium">Valor ganho</th></tr></thead>
              <tbody>{[...bySource.entries()].sort((a, b) => b[1].value - a[1].value).map(([k, s]) => (
                <tr key={k} className="border-t border-line"><td className="py-2">{k}</td><td className="py-2 text-right">{s.n}</td><td className="py-2 text-right">{s.won} <span className="text-xs text-muted">({Math.round((s.won / s.n) * 100)}%)</span></td><td className="py-2 text-right">{eur(s.value)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <div className="card flex flex-col gap-3">
          <h2 className="h2">Previsão de fecho (ponderada)</h2>
          <div role="img" aria-label="Valor ponderado por mês de fecho previsto, próximos 6 meses" className="flex h-44 items-end gap-3 border-b border-line">
            {forecast.map((f) => <div key={f.m} className="flex h-full flex-1 flex-col justify-end"><div className="rounded-t-md bg-accent" style={{ height: `${(f.v / fmax) * 100}%`, minHeight: f.v ? 4 : 0 }} title={eur(f.v)} /></div>)}
          </div>
          <div className="-mt-1 flex gap-3">{forecast.map((f) => <div key={f.m} className="flex-1 text-center text-[11px] text-muted">{new Date(f.m + "-01").toLocaleDateString("pt-PT", { month: "short" })}<div className="font-medium text-ink-2">{f.v ? eur(f.v) : "—"}</div></div>)}</div>
        </div>
      </section>
    </>
  );
}
