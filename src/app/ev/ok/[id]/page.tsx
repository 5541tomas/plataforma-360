import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { NoirShell } from "@/components/noir/Noir";
import { MetaPixel } from "@/components/noir/Measure";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lugar guardado", robots: { index: false } };
type R = { id: string; name: string; title: string; starts_at: string; ends_at: string; location: string | null; online_url: string | null; author: string; pixel: string | null };
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", ...o }).format(new Date(iso));
const g = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export default async function EventOk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data } = await anonClient().rpc("public_event_registration", { p_id: id });
  const r = data as R | null;
  if (!r) notFound();
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(r.title)}&dates=${g(r.starts_at)}/${g(r.ends_at)}&details=${encodeURIComponent(r.online_url ? `Link: ${r.online_url}` : `Com ${r.author}`)}&location=${encodeURIComponent(r.online_url || r.location || "")}`;
  return (
    <NoirShell l={{ brand: r.author.toUpperCase(), edition: "INSCRIÇÃO CONFIRMADA" }}>
      <section className="nr-hero nr-pad"><div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30 }}>
        <p className="nr-eyebrow nr-kicker">LUGAR GUARDADO</p>
        <h1 className="nr-h1">ATÉ JÁ,<br /><span className="nr-accent">{r.name.split(" ")[0].toLowerCase()}.</span></h1>
        <p className="nr-lead"><b className="nr-b">{r.title}</b><br />{fmt(r.starts_at, { weekday: "long", day: "numeric", month: "long" })}, às {fmt(r.starts_at, { hour: "2-digit", minute: "2-digit" })}{r.location ? ` · ${r.location}` : ""}</p>
        <div className="nr-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <a className="nr-cta" href={gcal} target="_blank" rel="noopener noreferrer"><span>ADICIONAR AO GOOGLE CALENDAR</span><span className="arw">→</span></a>
          <a className="nr-ghost" href={`/api/ics/e/${r.id}`}><span>APPLE / OUTLOOK (.ICS)</span><span>↓</span></a>
          {r.online_url && <p className="nr-note" style={{ margin: 0 }}>Link para entrar: <a href={r.online_url}>{r.online_url}</a></p>}
          <p className="nr-note" style={{ margin: 0 }}>Na véspera envio-te um lembrete por email.</p>
        </div>
      </div></section>
      <MetaPixel id={r.pixel} event="CompleteRegistration" />
    </NoirShell>
  );
}
