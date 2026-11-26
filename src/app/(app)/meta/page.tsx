import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext, canRead } from "@/lib/context";
import { goalEngine } from "@/lib/goal-engine";
import { eur } from "@/lib/format";
import { Disclosure, Empty, PageHeader, Progress } from "@/components/ui";
import { saveGoalSettings } from "./actions";
import { capacityAndProfit } from "@/lib/capacity";

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" }) {
  return (
    <div className="card !p-5 flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={`text-[28px] font-bold tracking-[-0.7px] ${tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : ""}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export default async function MetaPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const supabase = await createClient();
  const g = await goalEngine(supabase, ctx.org.id, sp.ano ? Number(sp.ano) : undefined);
  const crm = canRead(ctx, "crm");
  const pct = g.target ? (g.sold / g.target) * 100 : 0;
  const cp = await capacityAndProfit(supabase, ctx.org.id, g.year);

  return (
    <>
      <PageHeader eyebrow="Motor da meta" title={g.target ? `${eur(g.target)} em ${g.year}` : `Meta ${g.year}`}>
        <nav className="seg" aria-label="Ano">{g.years.map((y) => <Link key={y} href={`/meta?ano=${y}`} aria-current={y === g.year ? "true" : undefined}>{y}</Link>)}</nav>
        <Disclosure label="Pressupostos">
          <form action={saveGoalSettings} className="flex flex-col gap-3">
            <p className="text-xs text-muted">Usados enquanto não há histórico suficiente. Quando houver, o motor passa a usar as tuas taxas reais.</p>
            <label className="flex flex-col gap-1.5"><span className="label">Taxa de ganho das propostas (%)</span><input name="win_rate" type="number" min="1" max="100" defaultValue={g.settings.win_rate} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Conversas que chegam a proposta (%)</span><input name="lead_to_proposal" type="number" min="1" max="100" defaultValue={g.settings.lead_to_proposal} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Capacidade (horas de entrega por semana)</span><input name="capacity_hours_week" type="number" min="1" defaultValue={g.settings.capacity_hours_week} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Semanas de férias por ano</span><input name="weeks_off" type="number" min="0" max="20" defaultValue={g.settings.weeks_off} className="input" /></label>
            <button className="btn">Guardar</button>
          </form>
        </Disclosure>
      </PageHeader>

      {g.alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          {g.alerts.map((a, i) => (
            <p key={i} className={`rounded-xl px-4 py-3 text-sm ${a.tone === "warn" ? "bg-warn-soft text-[#8F4300]" : a.tone === "good" ? "bg-good-soft text-[#1E6B30]" : "bg-accent-soft text-accent-ink"}`}>{a.text}</p>
          ))}
        </section>
      )}

      {!g.target ? <Empty>Define um objetivo anual com um KR de faturação em <Link className="text-accent-ink" href="/objetivos">Objetivos</Link> para ativar o motor.</Empty> : (<>
        <section className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="h2">Onde estás</h2>
            <span className="text-sm text-muted">{g.annualTitle}</span>
          </div>
          <div className="flex items-baseline gap-3"><span className="text-[34px] font-bold tracking-[-1px]">{eur(g.sold)}</span><span className="text-muted">vendidos de {eur(g.target)} · {Math.round(pct)}%</span></div>
          <div className="relative">
            <Progress value={pct} className="!h-3" />
            {g.started && <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${Math.min(100, (g.expectedNow / g.target) * 100)}%` }} title="Onde devias estar hoje" />}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-2">
            <span>Faturado (Finanças): <strong className="font-semibold">{eur(g.invoiced)}</strong></span>
            <span>Pipeline ponderado: <strong className="font-semibold">{eur(g.pipelineYear)}</strong></span>
            {g.started && <span>Devias estar em: <strong className="font-semibold">{eur(g.expectedNow)}</strong> <span className={g.pace >= 0 ? "text-good" : "text-warn"}>({g.pace >= 0 ? "+" : ""}{eur(g.pace)})</span></span>}
          </div>
        </section>

        <section>
          <h2 className="h2 mb-3">O que é preciso para lá chegar</h2>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
            <Big label="Falta vender (depois do pipeline)" value={eur(g.gap)} sub={`${eur(g.remaining)} em falta − ${eur(g.pipelineYear)} já em pipeline`} />
            <Big label="Vendas consultivas a ganhar" value={String(g.winsNeeded)} sub={`ticket médio ${eur(g.ticket)} (${g.ticketSource})${g.consultiveShare < 1 ? ` · mais ${eur(g.directGap)} em vendas diretas (1:1, imersão…)` : ""}`} />
            <Big label="Propostas a enviar" value={String(g.proposalsNeeded)} sub={`taxa de ganho ${g.winRate}% (${g.winSource})`} />
            <Big label="Conversas a iniciar" value={String(g.convNeeded)} sub={`${g.l2p}% chegam a proposta (${g.l2pSource})`} />
          </div>
        </section>

        <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Ritmo por semana</h2>
            <p className="text-xs text-muted">{g.weeksLeft} semanas de trabalho {g.started ? "até ao fim do ano" : "no ano"} (já descontadas as férias).</p>
            {[
              ["Conversas novas", g.perWeek.conversations, g.actual.newWeek],
              ["Propostas enviadas", g.perWeek.proposals, g.actual.sentWeek],
              ["Negócios ganhos", g.perWeek.wins, null],
            ].map(([l, need, done]) => (
              <div key={l as string} className="flex flex-col gap-1">
                <div className="flex justify-between text-sm"><span>{l}</span><span><strong className="font-semibold">{String(need).replace(".", ",")}</strong>/semana{done !== null && g.started ? <span className={Number(done) >= Number(need) ? "text-good" : "text-warn"}> · esta semana {done}</span> : null}</span></div>
                {done !== null && g.started && <Progress value={(Number(done) / Math.max(0.1, Number(need))) * 100} />}
              </div>
            ))}
          </div>
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Ritmo por mês</h2>
            {[
              ["Conversas novas", g.perMonth.conversations, g.actual.newMonth],
              ["Propostas enviadas", g.perMonth.proposals, g.actual.sentMonth],
              ["Negócios ganhos", g.perMonth.wins, null],
            ].map(([l, need, done]) => (
              <div key={l as string} className="flex justify-between text-sm"><span>{l}</span><span><strong className="font-semibold">{String(need).replace(".", ",")}</strong>/mês{done !== null && g.started ? ` · este mês ${done}` : ""}</span></div>
            ))}
            {crm && <Link href="/crm" className="mt-1 text-sm font-medium text-accent-ink">Abrir pipeline</Link>}
          </div>
        </section>

        {g.mix.length > 0 && (
          <section className="card flex flex-col gap-3">
            <h2 className="h2">Plano por produto</h2>
            {g.mix.map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5">
                <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{m.label}</span>
                  <span className="text-ink-2"><strong className="font-semibold">{m.sold}</strong> / {m.target}{m.left ? <span className="text-muted"> · faltam {m.left}{m.unitPrice ? ` (${eur(m.left * m.unitPrice * (m.kind === "retainer" ? 1 : 1))}${m.kind === "retainer" ? "/mês" : ""})` : ""}</span> : <span className="text-good"> · concluído</span>}</span></div>
                <Progress value={(m.sold / Math.max(1, m.target)) * 100} />
              </div>
            ))}
          </section>
        )}

        {g.quarters.length > 0 && (
          <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {g.quarters.map((q) => (
              <div key={q.start} className={`card !p-5 flex flex-col gap-2 ${q.current ? "ring-2 ring-accent/40" : ""}`}>
                <span className="text-xs font-semibold uppercase tracking-[0.5px] text-muted">{q.title.split(":")[0]}{q.current ? " · em curso" : ""}</span>
                <span className="text-xl font-bold">{eur(q.sold)} <span className="text-sm font-medium text-muted">/ {eur(q.target)}</span></span>
                <Progress value={q.target ? (q.sold / q.target) * 100 : 0} />
                <span className="text-xs text-muted">Faturado: {eur(q.invoiced)}</span>
              </div>
            ))}
          </section>
        )}
      </>)}

      {cp.quarters.some((q) => q.total > 0) && (
        <section className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="h2">Capacidade de entrega</h2><span className="text-sm text-muted">Capacidade: {cp.cap} h/semana · horas por produto no catálogo</span></div>
          {cp.quarters.map((q) => (
            <div key={q.title} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{q.title}</span>
                <span className={q.load > 1 ? "font-semibold text-warn" : q.load > 0.85 ? "font-medium text-[#8F4300]" : "text-ink-2"}>{Math.round(q.perWeek)} h/semana · {Math.round(q.load * 100)}% da capacidade{q.load > 1 ? " — acima do possível" : q.load > 0.85 ? " — apertado" : ""}</span></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${q.load > 1 ? "bg-[#C25E00]" : "bg-accent"}`} style={{ width: `${Math.min(100, q.load * 100)}%` }} /></div>
              <span className="text-xs text-muted">{q.lines.map((l) => `${l.label}: ${Math.round(l.hours)} h`).join(" · ")}</span>
            </div>
          ))}
        </section>
      )}

      {cp.profit.length > 0 && (
        <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Rentabilidade por produto</h2>
            {cp.profit.map((p) => (
              <div key={p.name} className="flex items-center justify-between gap-3 text-sm">
                <span>{p.name}<span className="block text-xs text-muted">{eur(p.price)}{p.kind === "retainer" ? "/mês" : ""} · {String(p.hours).replace(".", ",")} h</span></span>
                <span className={`font-semibold ${p.perHour < cp.avgPerHour * 0.75 ? "text-warn" : ""}`}>{eur(p.perHour)}/h</span>
              </div>
            ))}
            {(() => { const low = cp.profit[cp.profit.length - 1]; return low && low.perHour < cp.avgPerHour * 0.75 ? (
              <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-[#8F4300]">“{low.name}” rende {eur(low.perHour)}/h, abaixo da tua média de {eur(cp.avgPerHour)}/h. Para chegar à média, o preço seria {eur(cp.avgPerHour * low.hours)} — ou reduz as horas de entrega.</p>
            ) : null; })()}
          </div>
          <div className="card flex flex-col gap-3">
            <h2 className="h2">Rentabilidade por cliente</h2>
            {cp.clients.length === 0 ? <Empty>Aparece quando tiveres negócios ganhos com produtos do catálogo.</Empty> : cp.clients.map((c) => (
              <div key={c.name} className="flex justify-between text-sm"><span>{c.name}<span className="block text-xs text-muted">{eur(c.value)} · {Math.round(c.hours)} h</span></span><span className="font-semibold">{eur(c.perHour)}/h</span></div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
