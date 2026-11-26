import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { capacityAndProfit } from "@/lib/capacity";
import { eur } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export default async function MetaDetalhe({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await getContext();
  const year = Number((await searchParams).ano) || new Date().getFullYear();
  const supabase = await createClient();
  const cp = await capacityAndProfit(supabase, ctx.org.id, year);
  return (
    <>
      <PageHeader eyebrow={`Meta ${year}`} title="Capacidade e rentabilidade"><Link href={`/meta?ano=${year}`} className="btn-ghost">‹ Meta</Link></PageHeader>
      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="h2">Capacidade de entrega</h2><span className="text-sm text-muted">{cp.cap} h/semana · horas por produto definidas no <Link href="/crm/produtos" className="text-accent-ink">catálogo</Link></span></div>
        {!cp.quarters.some((q) => q.total > 0) ? <Empty>Define horas de entrega nos produtos e objetivos trimestrais por produto.</Empty> : cp.quarters.map((q) => (
          <div key={q.title} className="flex flex-col gap-1.5">
            <div className="flex flex-wrap justify-between gap-2 text-sm"><span className="font-medium">{q.title}</span>
              <span className={q.load > 1 ? "font-semibold text-warn" : q.load > 0.85 ? "font-medium text-[#8F4300]" : "text-ink-2"}>{Math.round(q.perWeek)} h/semana · {Math.round(q.load * 100)}%{q.load > 1 ? " — acima do possível" : q.load > 0.85 ? " — apertado" : ""}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${q.load > 1 ? "bg-[#C25E00]" : "bg-accent"}`} style={{ width: `${Math.min(100, q.load * 100)}%` }} /></div>
            <span className="text-xs text-muted">{q.lines.map((l) => `${l.label}: ${Math.round(l.hours)} h`).join(" · ")}</span>
          </div>
        ))}
      </section>
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Rentabilidade por produto</h2>
          {cp.profit.length === 0 ? <Empty>Define horas de entrega nos produtos.</Empty> : cp.profit.map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-3 text-sm">
              <span>{p.name}<span className="block text-xs text-muted">{eur(p.price)}{p.kind === "retainer" ? "/mês" : ""} · {String(p.hours).replace(".", ",")} h</span></span>
              <span className={`font-semibold ${p.perHour < cp.avgPerHour * 0.75 ? "text-warn" : ""}`}>{eur(p.perHour)}/h</span>
            </div>
          ))}
          {(() => { const low = cp.profit[cp.profit.length - 1]; return low && low.perHour < cp.avgPerHour * 0.75 ? (
            <p className="rounded-xl bg-warn-soft px-3 py-2 text-xs text-[#8F4300]">“{low.name}” rende {eur(low.perHour)}/h, abaixo da média de {eur(cp.avgPerHour)}/h. Para chegar à média, o preço seria {eur(cp.avgPerHour * low.hours)} — ou reduz as horas de entrega.</p>
          ) : null; })()}
        </div>
        <div className="card flex flex-col gap-3">
          <h2 className="h2">Rentabilidade por cliente</h2>
          {cp.clients.length === 0 ? <Empty>Aparece quando tiveres negócios ganhos com produtos do catálogo.</Empty> : cp.clients.map((c) => (
            <div key={c.name} className="flex justify-between text-sm"><span>{c.name}<span className="block text-xs text-muted">{eur(c.value)} · {Math.round(c.hours)} h</span></span><span className="font-semibold">{eur(c.perHour)}/h</span></div>
          ))}
        </div>
      </section>
    </>
  );
}
