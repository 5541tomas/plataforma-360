import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getContext, canRead, canWrite } from "@/lib/context";
import { dateLong, eur, today, dateShort } from "@/lib/format";
import { Empty } from "@/components/ui";
import { TaskCheck, TaskItem } from "@/components/TaskItem";
import { Ring } from "@/components/Ring";
import { createTask } from "./objetivos/actions";
import { waLink } from "@/lib/whatsapp";
import { goalEngine } from "@/lib/goal-engine";
import { WaIcon } from "@/components/WhatsAppMenu";

type Task = { id: string; title: string; done: boolean; due_date: string | null; module: string; deal_id: string | null };
type Prio = { key: string; kind: "task" | "deal" | "money" | "client"; title: string; meta: string; href?: string; task?: Task; tone: "warn" | "accent" | "good" };

export default async function HojePage() {
  const ctx = await getContext();
  const supabase = await createClient();
  const fin = canRead(ctx, "finance"), crm = canRead(ctx, "crm"), goals = canRead(ctx, "goals");
  const t = today();
  const now = new Date();
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const monthStart = t.slice(0, 8) + "01";
  const sixAgo = new Date(); sixAgo.setMonth(sixAgo.getMonth() - 5, 1);
  const none = Promise.resolve({ data: null });
  if (fin) await supabase.rpc("sync_receivables", { p_org: ctx.org.id });
  const crmWrite = crm && canWrite(ctx, "crm");
  if (crmWrite) await supabase.rpc("run_automations", { p_org: ctx.org.id });
  const [queueQ, hotQ] = crm ? await Promise.all([
    supabase.from("outbox").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("status", "pending").is("campaign_id", null),
    supabase.from("contacts").select("id, name, score").eq("org_id", ctx.org.id).gte("score", 60).is("unsubscribed_at", null).order("score", { ascending: false }).limit(2),
  ]) : [{ count: 0 }, { data: [] }];

  const [bal, rec, cooling, ending, tasks, tx, rcv, debts, me] = await Promise.all([
    fin ? supabase.from("v_account_balances").select("scope, type, balance").eq("org_id", ctx.org.id) : none,
    fin ? supabase.from("recurring").select("description, amount, scope, day_of_month, starts_on, ends_on").eq("org_id", ctx.org.id).eq("active", true) : none,
    crm ? supabase.from("v_deals").select("id, title, company_name, total_value, last_activity_at, contact_phone").eq("org_id", ctx.org.id).eq("is_cooling", true).order("total_value", { ascending: false }).limit(5) : none,
    crm ? supabase.from("v_deals").select("id, title, company_name, delivery_end, contact_name, contact_phone").eq("org_id", ctx.org.id).eq("status", "won").gte("delivery_end", t).lte("delivery_end", in30).order("delivery_end") : none,
    supabase.from("tasks").select("id, title, done, due_date, module, deal_id").eq("org_id", ctx.org.id).eq("owner_id", ctx.userId)
      .or(`and(done.eq.false,due_date.lte.${t}),and(done.eq.false,due_date.is.null),and(done.eq.true,done_at.gte.${t})`).order("done").order("due_date").limit(40),
    fin ? supabase.from("transactions").select("date, amount, is_transfer").eq("org_id", ctx.org.id).gte("date", sixAgo.toISOString().slice(0, 10)) : none,
    fin ? supabase.from("receivables").select("id, description, amount, due_date, status").eq("org_id", ctx.org.id).eq("status", "open").lte("due_date", in30).order("due_date") : none,
    fin ? supabase.from("v_debts").select("name, monthly_payment, day_of_month, remaining, paid_this_month").eq("org_id", ctx.org.id).eq("archived", false) : none,
    supabase.from("profiles").select("phone").eq("id", ctx.userId).maybeSingle(),
  ]);
  const engine = goals ? await goalEngine(supabase, ctx.org.id) : null;

  const balances = (bal.data ?? []) as { scope: string; type: string; balance: number }[];
  const liquid = balances.filter((b) => ["checking", "savings", "cash"].includes(b.type)).reduce((a, b) => a + Number(b.balance), 0);
  const recurring = (rec.data ?? []) as { description: string; amount: number; scope: string; day_of_month: number; starts_on: string; ends_on: string | null }[];
  const mrr = recurring.filter((r) => r.scope === "business" && r.amount > 0).reduce((a, r) => a + Number(r.amount), 0);
  const allTasks = (tasks.data ?? []) as Task[];
  const open = allTasks.filter((x) => !x.done), doneToday = allTasks.filter((x) => x.done);
  const receivables = (rcv.data ?? []) as { id: string; description: string; amount: number; due_date: string }[];
  const overdueRcv = receivables.filter((r) => r.due_date < t);
  const txs = (tx.data ?? []) as { date: string; amount: number; is_transfer: boolean }[];
  const monthIn = txs.filter((x) => !x.is_transfer && x.date >= monthStart && x.amount > 0).reduce((a, x) => a + Number(x.amount), 0);
  const monthOut = -txs.filter((x) => !x.is_transfer && x.date >= monthStart && x.amount < 0).reduce((a, x) => a + Number(x.amount), 0);

  // Próximos pagamentos (7 dias): recorrentes de saída + prestações
  const dayOf = (d: number) => { const x = new Date(now.getFullYear(), now.getMonth(), Math.min(d, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())); if (x.toISOString().slice(0, 10) < t) x.setMonth(x.getMonth() + 1); return x.toISOString().slice(0, 10); };
  const upcomingOut = recurring.filter((r) => r.amount < 0 && r.starts_on <= in7 && (!r.ends_on || r.ends_on >= t))
    .map((r) => ({ label: r.description, amount: -Number(r.amount), date: dayOf(r.day_of_month) })).filter((x) => x.date <= in7).sort((a, b) => a.date.localeCompare(b.date));

  // As 3 prioridades: atrasado primeiro, depois dinheiro por receber, negócios a arrefecer, tarefas de hoje, programas a terminar
  const prios: Prio[] = [];
  open.filter((x) => x.due_date && x.due_date < t).forEach((x) => prios.push({ key: x.id, kind: "task", title: x.title, meta: `Atrasada desde ${dateShort(x.due_date!)}`, task: x, tone: "warn" }));
  if (crmWrite && (queueQ.count ?? 0) > 0) prios.push({ key: "queue", kind: "deal", title: `Aprovar ${queueQ.count} mensagem(ns) automática(s)`, meta: "Sequências de nutrição · nada sai sem ti", href: "/crm/automacoes", tone: "warn" });
  ((hotQ.data ?? []) as { id: string; name: string; score: number }[]).forEach((c) => prios.push({ key: "hot" + c.id, kind: "deal", title: `Lead quente: ${c.name}`, meta: `Pontuação ${c.score} · liga hoje`, href: `/crm/contactos/${c.id}`, tone: "accent" }));
  overdueRcv.slice(0, 2).forEach((r) => prios.push({ key: r.id, kind: "money", title: `Cobrar: ${r.description}`, meta: `${eur(r.amount)} · venceu a ${dateShort(r.due_date)}`, href: "/financas/cobrancas", tone: "warn" }));
  ((cooling.data ?? []) as { id: string; title: string; company_name: string | null; total_value: number; last_activity_at: string }[]).slice(0, 2).forEach((d) =>
    prios.push({ key: d.id, kind: "deal", title: `Retomar contacto: ${d.company_name ?? d.title}`, meta: `${eur(d.total_value)} · parado desde ${dateShort(d.last_activity_at)}`, href: `/crm/${d.id}`, tone: "accent" }));
  open.filter((x) => !x.due_date || x.due_date === t).forEach((x) => prios.push({ key: x.id, kind: "task", title: x.title, meta: x.module === "crm" ? "CRM · hoje" : "Hoje", task: x, tone: "accent" }));
  const endingList = (ending.data ?? []) as { id: string; title: string; company_name: string | null; delivery_end: string; contact_name: string | null; contact_phone: string | null }[];
  const top = prios.slice(0, 3);
  const rest = prios.length - top.length;

  // Fluxo: 6 meses reais + 3 previstos
  const months: { key: string; label: string; inV: number; outV: number; forecast: boolean }[] = [];
  for (let i = 0; i < 9; i++) { const d = new Date(sixAgo); d.setMonth(sixAgo.getMonth() + i); months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("pt-PT", { month: "short" }).replace(".", ""), inV: 0, outV: 0, forecast: i >= 6 }); }
  txs.forEach((r) => { if (r.is_transfer) return; const m = months.find((x) => x.key === r.date.slice(0, 7)); if (m) { if (r.amount > 0) m.inV += Number(r.amount); else m.outV -= Number(r.amount); } });
  const recIn = recurring.filter((r) => r.amount > 0).reduce((a, r) => a + Number(r.amount), 0), recOut = -recurring.filter((r) => r.amount < 0).reduce((a, r) => a + Number(r.amount), 0);
  months.filter((m) => m.forecast).forEach((m) => { m.inV = recIn; m.outV = recOut; });
  const maxV = Math.max(1, ...months.map((m) => Math.max(m.inV, m.outV)));

  const hour = Number(new Intl.DateTimeFormat("pt-PT", { hour: "numeric", hour12: false, timeZone: "Europe/Lisbon" }).format(now));
  const hello = hour < 13 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";
  const resumo = [`*O meu dia · ${dateLong()}*`, "", ...top.map((p, i) => `${i + 1}. ${p.title}`),
    engine && engine.target ? `\nMeta ${engine.year}: ${eur(engine.sold)} de ${eur(engine.target)}` : "", fin ? `Liquidez: ${eur(liquid)}` : ""].filter(Boolean).join("\n");
  const toneDot = { warn: "bg-[#C25E00]", accent: "bg-accent", good: "bg-good" };

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-[13px] font-medium uppercase tracking-[0.6px] text-muted">{dateLong()}</div>
          <h1 className="text-[34px] font-bold leading-tight tracking-[-0.8px]">{hello}, {ctx.name.split(" ")[0]}.</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <form action={createTask} className="flex gap-2">
            <label className="sr-only" htmlFor="qc">Captura rápida</label>
            <input id="qc" name="title" required placeholder="Captura rápida: nova tarefa para hoje" className="input min-w-[240px]" />
            <button className="btn whitespace-nowrap">+ Adicionar</button>
          </form>
          <a href={waLink(me.data?.phone, resumo)} target="_blank" rel="noopener noreferrer" aria-label="Enviar o resumo do dia para o meu WhatsApp" title={me.data?.phone ? "Resumo do dia no WhatsApp" : "Define o teu telemóvel em Definições"} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#128C4A] text-white hover:brightness-110"><WaIcon size={20} /></a>
        </div>
      </header>

      {/* Prioridades + meta */}
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        <div className="card flex flex-col gap-4">
          <div className="flex items-baseline justify-between"><h2 className="text-[19px] font-semibold tracking-[-0.3px]">As 3 prioridades de hoje</h2><span className="text-[13px] text-muted">{doneToday.length} feita(s) hoje</span></div>
          {top.length === 0 ? <Empty>Nada urgente. Bom dia para avançar na meta: inicia uma conversa nova.</Empty> : (
            <ol className="flex flex-col gap-2.5">
              {top.map((p, i) => (
                <li key={p.key} className="flex items-center gap-3.5 rounded-2xl bg-[#F7F7F9] px-4 py-3.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold shadow-sm">{i + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {p.href ? <Link href={p.href} className="text-[15px] font-medium hover:text-accent-ink">{p.title}</Link> : <span className="text-[15px] font-medium">{p.title}</span>}
                    <span className="flex items-center gap-1.5 text-xs text-muted"><span className={`h-1.5 w-1.5 rounded-full ${toneDot[p.tone]}`} />{p.meta}</span>
                  </div>
                  {p.task && <TaskCheck t={p.task} />}
                </li>
              ))}
            </ol>
          )}
          {(rest > 0 || doneToday.length > 0) && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-accent-ink">{rest > 0 ? `Mais ${rest} para hoje` : "Ver o que já fizeste"}</summary>
              <ul className="mt-2 flex flex-col">{[...prios.slice(3).filter((p) => p.task).map((p) => p.task!), ...doneToday].map((x) => <TaskItem key={x.id} t={x} meta={x.due_date && x.due_date < t ? `Atrasada · ${dateShort(x.due_date)}` : undefined} />)}</ul>
              {prios.slice(3).filter((p) => !p.task).map((p) => <Link key={p.key} href={p.href!} className="block py-1.5 text-sm text-ink-2 hover:text-accent-ink">{p.title} <span className="text-xs text-muted">· {p.meta}</span></Link>)}
            </details>
          )}
        </div>

        {engine && engine.target > 0 ? (
          <Link href="/meta" className="card flex flex-col gap-4 hover:ring-2 hover:ring-accent/20">
            <div className="flex items-baseline justify-between"><h2 className="text-[19px] font-semibold tracking-[-0.3px]">Meta {engine.year}</h2><span className="text-sm font-medium text-accent-ink">Abrir ›</span></div>
            <div className="flex items-center gap-5">
              <Ring value={engine.target ? engine.sold / engine.target : 0} marker={engine.started ? engine.expectedNow / engine.target : undefined} size={120} stroke={12} label={`${Math.round((engine.sold / engine.target) * 100)}% da meta`}>
                <text x="60" y="66" textAnchor="middle" fontSize="24" fontWeight="700" fill="#1D1D1F">{Math.round((engine.sold / engine.target) * 100)}%</text>
              </Ring>
              <div className="flex flex-col gap-1">
                <span className="text-2xl font-bold tracking-[-0.5px]">{eur(engine.sold)}</span>
                <span className="text-[13px] text-muted">de {eur(engine.target)}</span>
                {engine.started ? <span className={`chip mt-1 self-start ${engine.pace < -0.02 * engine.target ? "bg-warn-soft text-[#8F4300]" : "bg-good-soft text-[#1E6B30]"}`}>{engine.pace < -0.02 * engine.target ? `${eur(-engine.pace)} abaixo do ritmo` : "No ritmo"}</span>
                  : <span className="chip mt-1 self-start bg-accent-soft text-accent-ink">Começa a 1 de janeiro</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
              {[["Conversas", engine.actual.newWeek, Math.ceil(engine.perWeek.conversations)], ["Propostas", engine.actual.sentWeek, Math.ceil(engine.perWeek.proposals)], ["Vendas", engine.actual.winsWeek, Math.max(1, Math.round(engine.perWeek.wins))]].map(([l, d, n]) => (
                <div key={l as string} className="flex items-center gap-2">
                  <Ring value={Number(n) ? Number(d) / Number(n) : 0} size={34} stroke={4} color={Number(d) >= Number(n) ? "#1E7B34" : "#0071E3"} />
                  <div className="flex flex-col leading-tight"><span className="text-sm font-semibold">{engine.started ? `${d}/${n}` : n}</span><span className="text-[11px] text-muted">{l}{engine.started ? "" : "/sem."}</span></div>
                </div>
              ))}
            </div>
          </Link>
        ) : (
          <div className="card flex flex-col justify-center gap-2"><h2 className="text-[19px] font-semibold">Meta</h2><p className="text-sm text-muted">Define o teu objetivo anual de faturação em <Link href="/objetivos" className="text-accent-ink">Objetivos</Link> para veres aqui o ritmo de cada semana.</p></div>
        )}
      </section>

      {/* Dinheiro, pagamentos, clientes */}
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {fin && (
          <Link href="/financas/analise" className="card flex flex-col gap-3 hover:ring-2 hover:ring-accent/20">
            <h2 className="text-[17px] font-semibold">Dinheiro</h2>
            <div className="flex flex-col"><span className="text-[13px] text-muted">Liquidez</span><span className="text-[28px] font-bold tracking-[-0.7px]">{eur(liquid)}</span></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex flex-col"><span className="text-xs text-muted">Entrou este mês</span><span className="font-semibold text-good">{eur(monthIn)}</span></div>
              <div className="flex flex-col"><span className="text-xs text-muted">Saiu este mês</span><span className="font-semibold">{eur(monthOut)}</span></div>
              <div className="flex flex-col"><span className="text-xs text-muted">A receber · 30 dias</span><span className="font-semibold">{eur(receivables.reduce((a, r) => a + Number(r.amount), 0))}</span></div>
              <div className="flex flex-col"><span className="text-xs text-muted">Avenças</span><span className="font-semibold">{eur(mrr)}/mês</span></div>
            </div>
            {overdueRcv.length > 0 && <span className="rounded-lg bg-warn-soft px-3 py-1.5 text-xs font-medium text-[#8F4300]">{overdueRcv.length} pagamento(s) em atraso · {eur(overdueRcv.reduce((a, r) => a + Number(r.amount), 0))}</span>}
          </Link>
        )}
        {fin && (
          <div className="card flex flex-col gap-2.5">
            <h2 className="text-[17px] font-semibold">A pagar esta semana</h2>
            {upcomingOut.length === 0 ? <Empty>Nada a pagar nos próximos 7 dias.</Empty> : upcomingOut.slice(0, 5).map((u, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{u.label}<span className="block text-xs text-muted">{dateShort(u.date)}</span></span><span className="font-semibold">{eur(u.amount)}</span></div>
            ))}
            {((debts.data ?? []) as { remaining: number }[]).some((d) => Number(d.remaining) > 0) && <Link href="/financas/dividas" className="mt-auto text-sm font-medium text-accent-ink">Ver dívidas ›</Link>}
          </div>
        )}
        {crm && (
          <div className="card flex flex-col gap-2.5">
            <h2 className="text-[17px] font-semibold">Clientes</h2>
            {endingList.length === 0 && ((cooling.data ?? []) as unknown[]).length === 0 ? <Empty>Sem programas a terminar nem negócios parados.</Empty> : null}
            {endingList.map((d) => (
              <div key={d.id} className="flex items-center gap-3 text-sm">
                <div className="flex min-w-0 flex-1 flex-col"><Link href={`/crm/${d.id}`} className="truncate font-medium hover:text-accent-ink">{d.company_name ?? d.contact_name ?? d.title}</Link><span className="text-xs text-good">Termina a {dateShort(d.delivery_end)} · propor continuidade</span></div>
                <a href={waLink(d.contact_phone, `Olá${d.contact_name ? ` ${d.contact_name.split(" ")[0]}` : ""}! Estamos a chegar ao fim do programa e gostava de marcar 20 minutos para fazermos o balanço e vermos como dar continuidade aos resultados. Que dia lhe dá jeito? ${ctx.name.split(" ")[0]}`)} target="_blank" rel="noopener noreferrer" aria-label="Propor continuidade por WhatsApp" className="flex h-9 w-9 items-center justify-center rounded-lg text-[#128C4A] hover:bg-good-soft"><WaIcon size={18} /></a>
              </div>
            ))}
            {((cooling.data ?? []) as { id: string; title: string; company_name: string | null; last_activity_at: string }[]).slice(0, 3).map((d) => (
              <div key={d.id} className="flex flex-col text-sm"><Link href={`/crm/${d.id}`} className="font-medium hover:text-accent-ink">{d.company_name ?? d.title}</Link><span className="text-xs text-warn">A arrefecer · último contacto {dateShort(d.last_activity_at)}</span></div>
            ))}
            <Link href="/crm" className="mt-auto text-sm font-medium text-accent-ink">Abrir pipeline ›</Link>
          </div>
        )}
      </section>

      {/* Fluxo + assistente */}
      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
        {fin && (
          <div className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[17px] font-semibold">Fluxo de caixa</h2>
              <div className="flex gap-3.5 text-xs text-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />Entradas</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#C7C7CC]" />Saídas</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-[1.5px] border-dashed border-accent" />Previsto</span>
              </div>
            </div>
            <div role="img" aria-label="Entradas e saídas dos últimos 6 meses e previsão para 3 meses" className="flex h-[180px] items-end gap-3 border-b border-line">
              {months.map((m) => (
                <div key={m.key} className="flex h-full flex-1 items-end justify-center gap-[3px]">
                  <div className={`w-[40%] max-w-4 rounded-t-[5px] ${m.forecast ? "border-[1.5px] border-dashed border-accent" : "bg-accent"}`} style={{ height: `${(m.inV / maxV) * 100}%` }} />
                  <div className={`w-[40%] max-w-4 rounded-t-[5px] bg-[#C7C7CC] ${m.forecast ? "opacity-50" : ""}`} style={{ height: `${(m.outV / maxV) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="-mt-2 flex gap-3">{months.map((m) => <div key={m.key} className="flex-1 text-center text-[11px] text-muted">{m.label}</div>)}</div>
          </div>
        )}
        <form action="/assistente" className="card flex flex-col gap-3">
          <h2 className="text-[17px] font-semibold">Pergunta ao assistente</h2>
          <label htmlFor="aq" className="sr-only">Pergunta</label>
          <input id="aq" name="q" required placeholder="Ex.: Quanto posso pagar-me este mês?" className="input" />
          <div className="flex flex-wrap gap-2">
            {["Que negócios devo atacar esta semana?", "Onde estou a gastar demasiado?"].map((q) => <Link key={q} href={`/assistente?q=${encodeURIComponent(q)}`} className="rounded-full border border-line px-3 py-1.5 text-xs hover:bg-soft">{q}</Link>)}
          </div>
          <button className="btn self-start">Perguntar</button>
        </form>
      </section>
    </>
  );
}
