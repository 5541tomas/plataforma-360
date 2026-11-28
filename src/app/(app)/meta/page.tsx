import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext, canRead } from "@/lib/context";
import { goalEngine } from "@/lib/goal-engine";
import { capacityAndProfit } from "@/lib/capacity";
import { eur, dateShort } from "@/lib/format";
import { Disclosure, Empty, PageHeader } from "@/components/ui";
import { Ring } from "@/components/Ring";
import { saveGoalSettings } from "./actions";

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

import { funnelForecast } from "@/lib/growth";
import { channelLabel } from "@/lib/utm";
export default async function MetaPage({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const ctx = await getContext();
  const sp = await searchParams;
  const supabase = await createClient();
  const g = await goalEngine(supabase, ctx.org.id, sp.ano ? Number(sp.ano) : undefined);
  const cp = await capacityAndProfit(supabase, ctx.org.id, g.year);
  const crm = canRead(ctx, "crm");
  const fc = crm && g.target > 0 ? await funnelForecast(supabase, ctx.org.id, g.started ? g.perWeek.conversations : g.convNeeded / 46) : null;
  const now = new Date();
  const soldPct = g.target ? g.sold / g.target : 0;
  const expectedPct = g.target && g.started ? g.expectedNow / g.target : 0;
  const behind = g.started && g.pace < -0.02 * g.target, ahead = g.started && g.pace > 0.02 * g.target;

  // Próximo passo: negócio a arrefecer mais valioso → proposta por enviar → conversas em falta
  let next: { text: React.ReactNode; href: string; cta: string } | null = null;
  if (crm) {
    const { data: cooling } = await supabase.from("v_deals").select("id, title, company_name, weighted_value, total_value, last_activity_at").eq("org_id", ctx.org.id).eq("is_cooling", true).order("total_value", { ascending: false }).limit(1);
    const { data: inProposal } = await supabase.from("v_deals").select("id, title, company_name, total_value, stage_name").eq("org_id", ctx.org.id).eq("status", "open").ilike("stage_name", "%proposta%").order("total_value", { ascending: false }).limit(5);
    const ids = (inProposal ?? []).map((d) => d.id);
    const { data: withProp } = ids.length ? await supabase.from("proposals").select("deal_id").in("deal_id", ids) : { data: [] };
    const noProp = (inProposal ?? []).find((d) => !(withProp ?? []).some((p) => p.deal_id === d.id));
    const c = cooling?.[0];
    if (c) {
      const days = Math.round((now.getTime() - new Date(c.last_activity_at).getTime()) / 864e5);
      next = { text: <>Retoma o contacto com <strong className="font-semibold">{c.company_name ?? c.title}</strong> — parado há {days} dias e vale {eur(c.total_value)}.</>, href: `/crm/${c.id}`, cta: "Abrir negócio" };
    } else if (noProp) {
      next = { text: <>Envia a proposta a <strong className="font-semibold">{noProp.company_name ?? noProp.title}</strong> — vale {eur(noProp.total_value)}.</>, href: `/crm/${noProp.id}`, cta: "Abrir negócio" };
    } else if (g.started && g.actual.newWeek < Math.ceil(g.perWeek.conversations)) {
      next = { text: <>Inicia <strong className="font-semibold">{Math.ceil(g.perWeek.conversations) - g.actual.newWeek} conversa(s)</strong> esta semana — pede recomendações aos clientes satisfeitos.</>, href: "/crm/contactos", cta: "Ver contactos" };
    }
  }

  // Gráfico acumulado (600×220, área útil x 40–590, y 20–200)
  const X = (m: number) => 40 + (550 * m) / 12, Y = (v: number) => 200 - (180 * v) / Math.max(1, g.target, g.projection);
  const qTargets = g.quarters.length === 4 ? g.quarters.map((q) => q.target) : [0.25, 0.25, 0.25, 0.25].map((f) => f * g.target);
  let acc = 0;
  const planPts = [[0, 0], ...qTargets.map((t, i) => { acc += t; return [(i + 1) * 3, acc]; })];
  const curMonth = g.started ? (now.getFullYear() > g.year ? 12 : now.getMonth() + now.getDate() / 31) : 0;
  const actualPts: number[][] = [[0, 0]];
  for (let m = 0; m < Math.floor(curMonth); m++) actualPts.push([m + 1, g.soldByMonth[m]]);
  if (g.started && curMonth < 12) actualPts.push([curMonth, g.sold]);
  const path = (pts: number[][]) => pts.map(([m, v], i) => `${i ? "L" : "M"}${X(m).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const last = actualPts[actualPts.length - 1];

  const steps = [
    { label: "Conversas novas", done: g.actual.newWeek, need: Math.ceil(g.perWeek.conversations) },
    { label: "Propostas enviadas", done: g.actual.sentWeek, need: Math.ceil(g.perWeek.proposals) },
    { label: "Vendas fechadas", done: g.actual.winsWeek, need: Math.max(1, Math.round(g.perWeek.wins)) },
  ];
  const weekNo = Math.ceil(((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / 864e5 + new Date(now.getFullYear(), 0, 1).getDay() + 1) / 7);
  const worstCap = cp.quarters.reduce<(typeof cp.quarters)[number] | null>((w, q) => (!w || q.load > w.load ? q : w), null);
  const bestProfit = cp.profit[0], worstProfit = cp.profit[cp.profit.length - 1];
  const infoAlerts = g.alerts.filter((a) => a.tone === "info");

  return (
    <>
      <PageHeader eyebrow={`Meta ${g.year}${g.started ? ` · ${dateShort(now.toISOString())}` : " · ainda não começou"}`} title={g.target ? `${eur(g.target)} de faturação` : `Meta ${g.year}`}>
        <nav className="seg" aria-label="Ano">{g.years.map((y) => <Link key={y} href={`/meta?ano=${y}`} aria-current={y === g.year ? "true" : undefined}>{y}</Link>)}</nav>
        <Disclosure label="Pressupostos">
          <form action={saveGoalSettings} className="flex flex-col gap-3">
            <p className="text-xs text-muted">Usados enquanto não há histórico suficiente; depois o motor usa as tuas taxas reais.</p>
            <label className="flex flex-col gap-1.5"><span className="label">Taxa de ganho das propostas (%)</span><input name="win_rate" type="number" min="1" max="100" defaultValue={g.settings.win_rate} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Conversas que chegam a proposta (%)</span><input name="lead_to_proposal" type="number" min="1" max="100" defaultValue={g.settings.lead_to_proposal} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Capacidade (horas de entrega por semana)</span><input name="capacity_hours_week" type="number" min="1" defaultValue={g.settings.capacity_hours_week} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Semanas de férias por ano</span><input name="weeks_off" type="number" min="0" max="20" defaultValue={g.settings.weeks_off} className="input" /></label>
            <button className="btn">Guardar</button>
          </form>
        </Disclosure>
      </PageHeader>

      {!g.target ? <Empty>Define um objetivo anual com um KR de faturação em <Link className="text-accent-ink" href="/objetivos">Objetivos</Link> para ativar o motor da meta.</Empty> : (<>
        {/* Estado + gráfico */}
        <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
          <div className="card !p-7 flex flex-wrap items-center gap-7">
            <Ring value={soldPct} marker={expectedPct} size={190} stroke={16} label={`${Math.round(soldPct * 100)}% da meta vendida${g.started ? `; devias estar em ${Math.round(expectedPct * 100)}%` : ""}`}>
              <text x="95" y="92" textAnchor="middle" fontSize="38" fontWeight="700" fill="#1D1D1F">{Math.round(soldPct * 100)}%</text>
              <text x="95" y="116" textAnchor="middle" fontSize="12" fill="#6E6E73">da meta vendida</text>
            </Ring>
            <div className="flex min-w-[200px] flex-1 flex-col gap-3.5">
              <span className={`chip self-start !text-xs !px-3 !py-1.5 ${behind ? "bg-warn-soft text-[#8F4300]" : ahead ? "bg-good-soft text-[#1E6B30]" : "bg-accent-soft text-accent-ink"}`}>
                {!g.started ? `Começa a 1 de janeiro` : behind ? `${eur(-g.pace)} abaixo do ritmo` : ahead ? `${eur(g.pace)} acima do ritmo` : "No ritmo"}
              </span>
              <div className="flex flex-col"><span className="text-[30px] font-bold tracking-[-0.8px]">{eur(g.sold)}</span><span className="text-[13px] text-muted">vendidos{g.started ? ` · devias estar em ${eur(g.expectedNow)}` : ""}</span></div>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <div className="flex flex-col"><span className="text-muted">Faturado</span><strong className="text-[15px] font-semibold">{eur(g.invoiced)}</strong></div>
                <div className="flex flex-col"><span className="text-muted">Pipeline ponderado</span><strong className="text-[15px] font-semibold">{eur(g.pipelineYear)}</strong></div>
                <div className="col-span-2 flex flex-col"><span className="text-muted">Projeção para dezembro</span>
                  <strong className="text-[15px] font-semibold">{eur(g.projection)} {g.projection < g.target ? <span className="text-[13px] font-medium text-warn">· faltam {eur(g.target - g.projection)}</span> : <span className="text-[13px] font-medium text-good">· meta atingida</span>}</strong></div>
              </div>
            </div>
          </div>

          <div className="card flex flex-col gap-3 !pb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-semibold">Acumulado vs plano</h2>
              <div className="flex gap-3.5 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dashed border-[#AEAEB2]" />Plano</span>
                <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-accent" />Vendido</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dotted border-accent" />Projeção</span>
              </div>
            </div>
            <svg role="img" aria-label={`Vendido acumulado ${eur(g.sold)} contra o plano; projeção de ${eur(g.projection)} em dezembro`} viewBox="0 0 600 222" className="h-[220px] w-full">
              {[0, 1 / 3, 2 / 3, 1].map((f) => <line key={f} x1="40" x2="590" y1={20 + 180 * f} y2={20 + 180 * f} stroke={f === 1 ? "#E5E5EA" : "#F0F0F2"} />)}
              {[1, 2 / 3, 1 / 3].map((f) => <text key={f} x="32" y={24 + 180 * (1 - f)} textAnchor="end" fontSize="10" fill="#6E6E73">{k(Math.max(g.target, g.projection) * f)}</text>)}
              <path d={path(planPts)} fill="none" stroke="#AEAEB2" strokeWidth="2" strokeDasharray="6 5" />
              {g.started && <path d={`${path(actualPts)} L${X(last[0]).toFixed(1)} 200 L40 200 Z`} fill="#0071E3" fillOpacity="0.1" />}
              {g.started && <path d={path(actualPts)} fill="none" stroke="#0071E3" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
              {g.started && curMonth < 12 && <path d={`M${X(last[0]).toFixed(1)} ${Y(last[1]).toFixed(1)} L590 ${Y(g.projection).toFixed(1)}`} fill="none" stroke="#0071E3" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />}
              {g.started && <circle cx={X(last[0])} cy={Y(last[1])} r="5" fill="#0071E3" />}
              {["jan", "abr", "jul", "out", "dez"].map((m, i) => <text key={m} x={i === 4 ? 590 : X(i * 3)} y="216" textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="10" fill="#6E6E73">{m}</text>)}
            </svg>
          </div>
        </section>

        {/* Esta semana */}
        {g.started && (
          <section className="flex flex-col gap-4 rounded-[22px] bg-ink px-7 py-6 text-[#F5F5F7]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-semibold">Esta semana, para ficares no ritmo</h2>
              <span className="text-[13px] text-[#AEAEB2]">semana {weekNo} · {g.weeksLeft} semanas de trabalho até ao fim do ano</span>
            </div>
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
              {steps.map((s) => (
                <div key={s.label} className="flex items-center gap-4 rounded-2xl bg-[#2C2C2E] px-4.5 py-4 px-[18px]">
                  <Ring value={s.need ? s.done / s.need : 1} size={56} stroke={6} track="#3A3A3C" color={s.done >= s.need ? "#30D158" : "#7FB2F0"} />
                  <div className="flex flex-col">
                    <span className="text-[26px] font-bold tracking-[-0.5px]">{s.done}<span className="text-base font-medium text-[#AEAEB2]"> / {s.need}</span></span>
                    <span className="text-[13px] text-[#D1D1D6]">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
            {next && (
              <div className="flex flex-wrap items-center gap-3 border-t border-[#3A3A3C] pt-4 text-sm">
                <span className="text-[11px] font-bold uppercase tracking-[0.6px] text-[#7FB2F0]">Próximo passo</span>
                <span>{next.text}</span>
                <Link href={next.href} className="ml-auto font-semibold text-[#7FB2F0]">{next.cta} ›</Link>
              </div>
            )}
          </section>
        )}
        {fc && (
          <section className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[17px] font-semibold">Previsão pelo funil</h2><span className="text-[13px] text-muted">lead → conversa: {Math.round(fc.rate * 100)}% ({fc.rateSource === "real" ? "a tua conversão real" : "estimativa até haver dados"})</span></div>
            <p className="text-[15px] leading-relaxed">Para chegares aos <strong className="font-semibold">{eur(g.target)}</strong> precisas de cerca de <strong className="font-semibold">{fc.needPerWeek} leads por semana</strong>{fc.totalLeads > 0 ? <> — nas últimas 4 semanas tiveste <strong className={`font-semibold ${fc.nowPerWeek >= fc.needPerWeek ? "text-good" : "text-warn"}`}>{String(fc.nowPerWeek).replace(".", ",")}</strong>/semana.</> : "."}</p>
            <div className="h-2 overflow-hidden rounded-full bg-[#F2F2F5]" role="img" aria-label={`${Math.round(Math.min(1, fc.nowPerWeek / Math.max(1, fc.needPerWeek)) * 100)}% das leads necessárias`}><div className={`h-full rounded-full ${fc.nowPerWeek >= fc.needPerWeek ? "bg-good" : "bg-accent"}`} style={{ width: `${Math.min(100, (fc.nowPerWeek / Math.max(1, fc.needPerWeek)) * 100)}%` }} /></div>
            <p className="text-sm text-muted">{fc.nowPerWeek >= fc.needPerWeek ? "Estás a gerar leads suficientes: o foco agora é transformar conversas em propostas." : `Faltam ${Math.max(1, Math.ceil(fc.needPerWeek - fc.nowPerWeek))} leads por semana.`}{fc.bestChannel ? ` O canal que mais leads te traz é ${channelLabel(fc.bestChannel)} — reforça-o primeiro.` : " Partilha o guia nos teus canais com o gerador de links (CRM → Lead magnets) para saberes qual funciona melhor."} <Link href="/crm/lead-magnets" className="font-medium text-accent-ink">Lead magnets ›</Link></p>
          </section>
        )}
        {!g.started && (
          <section className="card flex flex-wrap items-center gap-x-8 gap-y-2">
            <span className="text-sm font-semibold">Ritmo a partir de janeiro</span>
            <span className="text-sm text-ink-2"><strong className="font-semibold">{Math.ceil(g.perWeek.conversations)}</strong> conversas · <strong className="font-semibold">{Math.ceil(g.perWeek.proposals)}</strong> propostas · <strong className="font-semibold">{String(g.perWeek.wins).replace(".", ",")}</strong> vendas por semana</span>
            <span className="text-sm text-muted">{g.winsNeeded} vendas consultivas · {g.proposalsNeeded} propostas · {g.convNeeded} conversas no ano</span>
          </section>
        )}

        {/* Trimestres */}
        {g.quarters.length > 0 && (
          <section className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {g.quarters.map((q) => {
              const qs = new Date(q.start), qe = new Date(qs); qe.setMonth(qe.getMonth() + 3);
              const done = q.sold >= q.target && q.target > 0;
              const status = q.past ? (done ? "Concluído" : "Fechado") : q.current ? "Em curso" : "A seguir";
              const weeksLeftQ = Math.max(0, Math.ceil((qe.getTime() - now.getTime()) / (7 * 864e5)));
              const note = q.past ? (q.sold >= q.target ? `+${eur(q.sold - q.target)} acima do objetivo` : `${eur(q.target - q.sold)} abaixo do objetivo`)
                : q.current ? `faltam ${eur(Math.max(0, q.target - q.sold))} em ${weeksLeftQ} semanas` : q.title.split(":").slice(1).join(":").replace(/^\s*[\d\s€.,]+\(?/, "").replace(/\)$/, "").trim() || `${dateShort(q.start)} a ${dateShort(new Date(qe.getTime() - 864e5).toISOString())}`;
              return (
                <div key={q.start} className={`card !p-5 flex flex-col gap-2.5 ${q.current ? "ring-2 ring-accent" : ""}`}>
                  <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">{q.title.split(":")[0]}</span>
                    <span className={`chip ${q.past ? (done ? "bg-good-soft text-[#1E6B30]" : "bg-warn-soft text-[#8F4300]") : q.current ? "bg-accent-soft text-accent-ink" : "bg-[#F2F2F5] text-ink-2"}`}>{status}</span></div>
                  <div className="text-[22px] font-bold tracking-[-0.4px]">{eur(q.sold)} <span className="text-[13px] font-medium text-muted">/ {eur(q.target)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-soft"><div className={`h-full rounded-full ${q.past && done ? "bg-good" : "bg-accent"}`} style={{ width: `${q.target ? Math.min(100, (q.sold / q.target) * 100) : 0}%` }} /></div>
                  <span className="text-xs text-muted">{note}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* Produtos */}
        {g.mix.length > 0 && (
          <section className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-[17px] font-semibold">Plano por produto</h2><span className="text-[13px] text-muted">atualiza com cada negócio ganho no CRM</span></div>
            <div className="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(190px,1fr))]">
              {g.mix.map((m) => {
                const f = m.target ? m.sold / m.target : 0;
                const late = g.started && f < g.elapsed - 0.15;
                const note = m.sold >= m.target ? "concluído" : !g.started ? `${m.target} no ano` : late ? `atrasado · faltam ${m.left}` : "no ritmo";
                return (
                  <div key={m.label} className="flex items-center gap-3.5 rounded-2xl bg-[#F7F7F9] p-3.5">
                    <Ring value={f} size={52} stroke={6} track="#E5E5EA" color={m.sold >= m.target ? "#1E7B34" : "#0071E3"} />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-xl font-bold">{m.sold}<span className="text-[13px] font-medium text-muted"> / {m.target}</span></span>
                      <span className="text-xs text-ink-2 leading-tight">{m.label.replace(/\s*\(.*\)\s*$/, "")}</span>
                      <span className={`text-[11px] ${late ? "text-warn" : m.sold >= m.target ? "text-good" : "text-muted"}`}>{note}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Capacidade e rentabilidade (resumo) */}
        {(worstCap || bestProfit) && (
          <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
            {worstCap && worstCap.total > 0 && (
              <Link href={`/meta/detalhe?ano=${g.year}`} className="card !py-5 flex items-center gap-4.5 gap-[18px] hover:ring-2 hover:ring-accent/20">
                <div className={`flex h-12 w-12 items-center justify-center rounded-[14px] ${worstCap.load > 0.85 ? "bg-warn-soft" : "bg-good-soft"}`}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={worstCap.load > 0.85 ? "#8F4300" : "#1E6B30"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></div>
                <div className="flex flex-1 flex-col"><span className="text-[13px] text-muted">Capacidade</span><span className="text-base font-semibold">{worstCap.title} a {Math.round(worstCap.load * 100)}%{worstCap.load > 1 ? " · acima do possível" : worstCap.load > 0.85 ? " · apertado" : " · confortável"}</span><span className="text-xs text-muted">{Math.round(worstCap.perWeek)} h/semana de entrega para {cp.cap} h disponíveis</span></div>
                <span className="text-sm font-semibold text-accent-ink">Ver ›</span>
              </Link>
            )}
            {bestProfit && (
              <Link href={`/meta/detalhe?ano=${g.year}`} className="card !py-5 flex items-center gap-[18px] hover:ring-2 hover:ring-accent/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-good-soft"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1E6B30" strokeWidth="2" strokeLinecap="round"><path d="M4 20l5-6 4 3 7-9" /></svg></div>
                <div className="flex flex-1 flex-col"><span className="text-[13px] text-muted">Rentabilidade</span><span className="text-base font-semibold">{bestProfit.name}: {eur(bestProfit.perHour)}/h</span>
                  <span className="text-xs text-muted">{worstProfit && worstProfit.perHour < cp.avgPerHour * 0.75 ? `${worstProfit.name} rende ${eur(worstProfit.perHour)}/h — candidato a subir preço` : `média de ${eur(cp.avgPerHour)}/h nos teus produtos`}</span></div>
                <span className="text-sm font-semibold text-accent-ink">Ver ›</span>
              </Link>
            )}
          </section>
        )}
        {infoAlerts.length > 0 && <p className="text-xs text-muted">{infoAlerts.map((a) => a.text).join(" ")}</p>}
      </>)}
    </>
  );
}
