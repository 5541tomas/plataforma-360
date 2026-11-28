import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireModule, canWrite } from "@/lib/context";
import { Empty, PageHeader } from "@/components/ui";
import { CopyLink } from "@/components/CopyLink";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { lisbonDate, lisbonTime } from "@/lib/booking";
import { deleteEvent, saveEvent, setAttendance } from "./actions";

export const metadata = { title: "Eventos" };
type Ev = { id: string; slug: string; title: string; subtitle: string | null; description: string | null; starts_at: string; ends_at: string; location: string | null; online_url: string | null; capacity: number | null; price_label: string | null; active: boolean };
type Reg = { id: string; event_id: string; contact_id: string | null; deal_id: string | null; name: string; email: string | null; phone: string | null; status: string; created_at: string };
const LONG = (iso: string) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const ST: Record<string, string> = { registered: "Inscrito", attended: "Esteve", no_show: "Faltou", cancelled: "Cancelou" };

function Fields({ e }: { e?: Ev }) {
  const dur = e ? Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000) : 180;
  return (
    <>
      <input type="hidden" name="id" value={e?.id ?? ""} />
      <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <label className="flex flex-col gap-1.5"><span className="label">Título</span><input name="title" defaultValue={e?.title} required placeholder="Imersão VENCER — Porto" className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Endereço (opcional)</span><input name="slug" defaultValue={e?.slug} placeholder="imersao-porto" className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Dia</span><input name="date" type="date" required defaultValue={e ? lisbonDate(new Date(e.starts_at)) : ""} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Hora (Lisboa)</span><input name="time" type="time" required defaultValue={e ? lisbonTime(new Date(e.starts_at)) : "14:30"} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Duração (minutos)</span><input name="duration" type="number" min={15} step={15} defaultValue={dur} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Lugares (vazio = sem limite)</span><input name="capacity" type="number" min={1} defaultValue={e?.capacity ?? ""} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Local</span><input name="location" defaultValue={e?.location ?? ""} placeholder="Santa Maria da Feira" className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Link online (Meet, Zoom…)</span><input name="online_url" type="url" defaultValue={e?.online_url ?? ""} className="input" /></label>
        <label className="flex flex-col gap-1.5"><span className="label">Preço (texto)</span><input name="price_label" defaultValue={e?.price_label ?? ""} placeholder="Gratuito · 49 €" className="input" /></label>
      </div>
      <label className="flex flex-col gap-1.5"><span className="label">Frase de destaque</span><input name="subtitle" defaultValue={e?.subtitle ?? ""} placeholder="Uma tarde para saíres com o plano de vendas dos próximos 90 dias." className="input" /></label>
      <label className="flex flex-col gap-1.5"><span className="label">O que vais aprender (uma linha por ponto)</span><textarea name="description" rows={4} defaultValue={e?.description ?? ""} className="input py-2.5" /></label>
      {e && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={e.active} className="h-4 w-4" /> Inscrições abertas</label>}
    </>
  );
}

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const ctx = await requireModule("crm");
  const write = canWrite(ctx, "crm");
  const sp = await searchParams;
  const supabase = await createClient();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const [{ data: org }, { data: evs }, { data: regs }] = await Promise.all([
    supabase.from("organizations").select("public_slug").eq("id", ctx.org.id).single(),
    supabase.from("events").select("*").eq("org_id", ctx.org.id).order("starts_at", { ascending: false }),
    supabase.from("event_registrations").select("id, event_id, contact_id, deal_id, name, email, phone, status, created_at").eq("org_id", ctx.org.id).order("created_at"),
  ]);
  const events = (evs ?? []) as Ev[], all = (regs ?? []) as Reg[];
  const now = Date.now();
  return (
    <>
      <PageHeader title="Eventos e workshops" />
      <p className="-mt-2 max-w-[720px] text-sm text-muted">Imersões, tardes de formação e webinars: página de inscrição no teu estilo, cada inscrito entra no CRM, recebe o convite para o calendário e o lembrete da véspera fica na fila para aprovares. No dia, marcas quem esteve.</p>
      {sp.erro && <p role="alert" className="rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{sp.erro}</p>}
      {!org?.public_slug && <Empty>Define primeiro o teu endereço público em CRM → Lead magnets.</Empty>}
      {write && org?.public_slug && (
        <details className="card" open={events.length === 0}><summary className="cursor-pointer font-semibold">+ Novo evento</summary>
          <form action={saveEvent} className="mt-3 flex flex-col gap-3"><Fields /><button className="btn self-start">Criar evento</button></form></details>
      )}
      {events.map((e) => {
        const rs = all.filter((r) => r.event_id === e.id && r.status !== "cancelled");
        const past = new Date(e.ends_at).getTime() < now;
        const att = rs.filter((r) => r.status === "attended").length;
        const url = `${base}/ev/${org?.public_slug}/${e.slug}`;
        return (
          <article key={e.id} className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5"><span className="text-xs font-semibold uppercase tracking-[0.6px] text-muted first-letter:uppercase">{LONG(e.starts_at)}</span><h2 className="h2">{e.title}</h2></div>
              <div className="flex items-center gap-3"><span className={`chip ${past ? "bg-[#F2F2F5] text-muted" : e.active ? "bg-good-soft text-[#1E6B30]" : "bg-warn-soft text-warn"}`}>{past ? "Terminado" : e.active ? "Inscrições abertas" : "Fechado"}</span>
                {write && <ConfirmDelete action={deleteEvent} id={e.id} warning={`Apagar «${e.title}»${rs.length ? ` e as ${rs.length} inscrições` : ""}? Os contactos ficam no CRM.`} />}</div>
            </div>
            {org?.public_slug && <CopyLink url={url} />}
            <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
              {[["Inscritos", `${rs.length}${e.capacity ? ` / ${e.capacity}` : ""}`], ["Estiveram", past || att ? `${att}` : "—"], ["Presença", rs.length && (past || att) ? `${Math.round((att / rs.length) * 100)}%` : "—"]].map(([l, v]) => (
                <div key={l} className="rounded-2xl bg-[#F7F7F9] px-3 py-2.5"><div className="text-xs text-muted">{l}</div><div className="text-[20px] font-semibold tabular-nums">{v}</div></div>
              ))}
            </div>
            {rs.length > 0 && (
              <details open={past && rs.some((r) => r.status === "registered")}><summary className="cursor-pointer text-sm font-medium text-accent-ink">Inscritos ({rs.length})</summary>
                <div className="mt-2 flex flex-col">{rs.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F2] py-2 text-sm last:border-0">
                    <span className="flex flex-col">{r.contact_id ? <Link href={`/crm/contactos/${r.contact_id}`} className="font-medium hover:text-accent-ink">{r.name}</Link> : <span className="font-medium">{r.name}</span>}<span className="text-xs text-muted">{[r.email, r.phone].filter(Boolean).join(" · ")}</span></span>
                    {write ? <div className="flex gap-1">{(["attended", "no_show", "registered"] as const).map((s) => (
                      <form key={s} action={setAttendance}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="status" value={s} />
                        <button aria-pressed={r.status === s} className={`min-h-9 rounded-lg px-2.5 text-xs font-medium ${r.status === s ? (s === "attended" ? "bg-good-soft text-[#1E6B30]" : s === "no_show" ? "bg-warn-soft text-warn" : "bg-[#F2F2F5] text-ink") : "text-muted hover:bg-[#F2F2F5]"}`}>{ST[s]}</button></form>
                    ))}</div> : <span className="text-xs text-muted">{ST[r.status]}</span>}
                  </div>
                ))}</div>
              </details>
            )}
            {write && <details><summary className="cursor-pointer text-sm font-medium text-muted">Editar</summary><form action={saveEvent} className="mt-3 flex flex-col gap-3"><Fields e={e} /><button className="btn self-start">Guardar</button></form></details>}
          </article>
        );
      })}
    </>
  );
}
