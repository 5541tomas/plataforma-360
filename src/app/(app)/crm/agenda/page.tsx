import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { PageHeader, Empty } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { cfgOf, lisbonLong, lisbonTime, type BookingCfg } from "@/lib/booking";
import { saveBooking, setBookingStatus, syncCalendarNow } from "./actions";
import { googleConfigured } from "@/lib/google";
import { internalSecret } from "@/lib/stripe";

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const ST: Record<string, [string, string]> = { confirmed: ["Marcada", "bg-accent-soft text-accent-ink"], done: ["Realizada", "bg-good-soft text-[#1E6B30]"], no_show: ["Faltou", "bg-warn-soft text-warn"], cancelled: ["Cancelada", "bg-[#F2F2F5] text-muted"] };

export default async function AgendaPage() {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const supabase = await createClient();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: org }, { data: bookings }, { data: integ }, { count: busyCount }] = await Promise.all([
    supabase.from("organizations").select("public_slug, booking").eq("id", ctx.org.id).single(),
    supabase.from("bookings").select("id, starts_at, ends_at, name, email, phone, notes, status, contact_id, deal_id, response_id, google_event_id, meet_url").eq("org_id", ctx.org.id).gte("starts_at", since).order("starts_at"),
    supabase.from("integrations").select("account_email, calendar_synced_at, calendar_error").eq("org_id", ctx.org.id).eq("user_id", ctx.userId).eq("provider", "google").maybeSingle(),
    supabase.from("calendar_busy").select("org_id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
  ]);
  const gReady = googleConfigured() && !!internalSecret();
  const cfg = cfgOf(org?.booking as BookingCfg);
  const now = Date.now();
  const upcoming = (bookings ?? []).filter((b) => new Date(b.ends_at).getTime() >= now && b.status !== "cancelled");
  const past = (bookings ?? []).filter((b) => new Date(b.ends_at).getTime() < now || b.status === "cancelled").reverse();
  const done = past.filter((b) => b.status === "done").length, noShow = past.filter((b) => b.status === "no_show").length;
  const url = org?.public_slug ? `${base}/b/${org.public_slug}` : null;

  const Row = ({ b }: { b: NonNullable<typeof bookings>[number] }) => (
    <div className="flex flex-wrap items-center gap-3 border-b border-[#F0F0F2] py-3 last:border-0">
      <div className="w-[120px] shrink-0"><div className="text-sm font-semibold first-letter:uppercase">{lisbonLong(new Date(b.starts_at)).split(",")[0]}</div><div className="text-xs text-muted">{new Date(b.starts_at).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" })} · {lisbonTime(new Date(b.starts_at))}</div></div>
      <div className="min-w-[160px] flex-1">
        {b.contact_id ? <Link href={`/crm/contactos/${b.contact_id}`} className="font-medium hover:text-accent-ink">{b.name}</Link> : <span className="font-medium">{b.name}</span>}
        <div className="text-xs text-muted">{[b.email, b.phone, b.response_id && "veio de um lead magnet", b.google_event_id && "no Google Calendar"].filter(Boolean).join(" · ")}</div>
        {b.meet_url && b.status === "confirmed" && <a href={b.meet_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-accent-ink">Entrar no Meet ↗</a>}
        {b.notes && <p className="mt-1 text-sm text-ink-2">“{b.notes}”</p>}
      </div>
      <span className={`chip ${ST[b.status][1]}`}>{ST[b.status][0]}</span>
      {b.deal_id && <Link href={`/crm/${b.deal_id}`} className="text-sm font-medium text-accent-ink">Negócio ›</Link>}
      {write && b.status === "confirmed" && (
        <div className="flex gap-1">
          {new Date(b.starts_at).getTime() < now ? (<>
            <form action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="done" /><button className="btn-ghost !min-h-9 text-xs">Realizada</button></form>
            <form action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="no_show" /><button className="btn-ghost !min-h-9 text-xs">Faltou</button></form>
          </>) : <form action={setBookingStatus}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="status" value="cancelled" /><button className="text-xs text-muted hover:text-warn">Cancelar</button></form>}
        </div>
      )}
    </div>
  );

  return (
    <>
      <PageHeader title="Agenda de marcações" />
      <p className="-mt-2 max-w-[720px] text-sm text-muted">A tua página para marcarem reuniões 1:1 contigo. Cada marcação cria (ou atualiza) o contacto e o negócio, passa-o para a etapa de reunião, pára as sequências de nutrição e cria a tarefa de preparação.</p>
      {!org?.public_slug && <p className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Define primeiro o teu endereço público em <Link href="/crm/lead-magnets" className="underline">Lead magnets</Link>.</p>}
      {url && cfg.enabled && <section className="card flex flex-col gap-2"><span className="label">Link para partilhar</span><CopyLink url={url} /></section>}

      <section className="card flex flex-wrap items-center justify-between gap-3 !py-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold">Google Calendar</span>
          <span className="text-xs text-muted">{!googleConfigured() ? "Por configurar no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET)." : !integ ? "Liga a tua conta Google nas Definições para bloquear horários ocupados e criar as reuniões no teu calendário." : !internalSecret() ? "Falta a chave interna (Definições → Pagamentos, email e resumo diário)." : integ.calendar_error ? `⚠ ${integ.calendar_error}` : integ.calendar_synced_at ? `Ligado a ${integ.account_email} · ${busyCount ?? 0} períodos ocupados bloqueados · sincronizado ${new Date(integ.calendar_synced_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" })}` : `Ligado a ${integ.account_email} · ainda não sincronizado`}</span>
        </div>
        {write && gReady && integ && <form action={syncCalendarNow}><button className="btn-ghost !min-h-10">Sincronizar agora</button></form>}
      </section>

      <section className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
        <div className="card !p-5"><div className="text-xs text-muted">Próximas</div><div className="text-[26px] font-semibold">{upcoming.length}</div></div>
        <div className="card !p-5"><div className="text-xs text-muted">Realizadas (30 dias)</div><div className="text-[26px] font-semibold">{done}</div></div>
        <div className="card !p-5"><div className="text-xs text-muted">Faltas</div><div className="text-[26px] font-semibold">{noShow}</div>{done + noShow > 0 && <div className="text-xs text-muted">{Math.round((noShow / (done + noShow)) * 100)}% de faltas</div>}</div>
      </section>

      <section className="card flex flex-col">
        <h2 className="h2 mb-2">Próximas reuniões</h2>
        {upcoming.length ? upcoming.map((b) => <Row key={b.id} b={b} />) : <Empty>Sem reuniões marcadas.</Empty>}
      </section>
      {past.length > 0 && <section className="card flex flex-col"><h2 className="h2 mb-2">Últimos 30 dias</h2>{past.map((b) => <Row key={b.id} b={b} />)}</section>}

      {write && (
        <form action={saveBooking} className="card flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="h2">Disponibilidade</h2>
            <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={cfg.enabled} className="h-4 w-4" /> Agenda ativa</label></div>
          <fieldset className="flex flex-wrap gap-2"><legend className="label mb-1.5">Dias</legend>
            {DAYS.map((d, i) => <label key={d} className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm"><input type="checkbox" name={`d${i + 1}`} defaultChecked={cfg.days.includes(i + 1)} className="h-4 w-4" />{d}</label>)}
          </fieldset>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
            <label className="flex flex-col gap-1.5"><span className="label">Das</span><input name="start" type="time" defaultValue={cfg.start} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Até às</span><input name="end" type="time" defaultValue={cfg.end} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Duração (min)</span><input name="duration" type="number" min="10" max="180" defaultValue={cfg.duration} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Intervalo entre reuniões (min)</span><input name="buffer" type="number" min="0" max="120" defaultValue={cfg.buffer} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Antecedência mínima (horas)</span><input name="notice_hours" type="number" min="0" max="168" defaultValue={cfg.notice_hours} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Até quantos dias à frente</span><input name="horizon_days" type="number" min="1" max="90" defaultValue={cfg.horizon_days} className="input" /></label>
          </div>
          <label className="flex flex-col gap-1.5"><span className="label">Título da página</span><input name="title" defaultValue={cfg.title} className="input" /></label>
          <label className="flex flex-col gap-1.5"><span className="label">Texto de apresentação</span><textarea name="intro" rows={2} defaultValue={cfg.intro} className="input py-2.5" /></label>
          <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            <label className="flex flex-col gap-1.5"><span className="label">Local</span><input name="location" defaultValue={cfg.location} className="input" /></label>
            <label className="flex flex-col gap-1.5"><span className="label">Link fixo da videochamada (opcional)</span><input name="meet_url" type="url" defaultValue={cfg.meet_url} placeholder="https://meet.google.com/…" className="input" /></label>
          </div>
          <p className="text-xs text-muted">Os lead magnets passam a usar esta agenda no botão “Marcar reunião” (a não ser que tenhas definido um link externo). O email de confirmação fica na fila de aprovação.</p>
          <button className="btn self-start">Guardar</button>
        </form>
      )}
    </>
  );
}
