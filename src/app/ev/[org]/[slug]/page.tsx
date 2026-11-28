import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import { utmFrom } from "@/lib/utm";
import { NoirShell } from "@/components/noir/Noir";
import { StickyCta } from "@/components/noir/StickyCta";
import { MetaPixel } from "@/components/noir/Measure";
import { registerEvent } from "./actions";

export const dynamic = "force-dynamic";
type E = { id: string; title: string; subtitle: string | null; description: string | null; starts_at: string; ends_at: string; location: string | null; capacity: number | null; price_label: string | null; author: string; org: string; taken: number; past: boolean; pixel: string | null };
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", ...o }).format(new Date(iso));

async function load(org: string, slug: string) { const { data } = await anonClient().rpc("public_event", { p_org: org, p_slug: slug }); return data as E | null; }

export async function generateMetadata({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const e = await load(org, slug);
  return e ? { title: `${e.title} · ${e.author}`, description: e.subtitle ?? undefined, openGraph: { title: e.title, description: e.subtitle ?? undefined, locale: "pt_PT" } } : { title: "Evento indisponível" };
}

export default async function EventPage({ params, searchParams }: { params: Promise<{ org: string; slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { org, slug } = await params;
  const sp = await searchParams;
  const e = await load(org, slug);
  if (!e) notFound();
  const left = e.capacity ? Math.max(0, e.capacity - e.taken) : null;
  const closed = e.past || left === 0;
  const words = e.title.split(" ");
  const head = words.slice(0, Math.max(1, words.length - 1)).join(" "), tail = words.length > 1 ? words[words.length - 1] : "";
  const points = (e.description ?? "").split("\n").map((x) => x.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
  return (
    <NoirShell l={{ brand: e.author.toUpperCase(), edition: e.price_label ? e.price_label.toUpperCase() : "EVENTO" }}>
      <section className="nr-hero nr-pad"><div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30 }}>
        <p className="nr-eyebrow nr-kicker">{fmt(e.starts_at, { weekday: "long", day: "numeric", month: "long" }).toUpperCase()} · {fmt(e.starts_at, { hour: "2-digit", minute: "2-digit" })}</p>
        <h1 className="nr-h1" style={{ fontSize: "clamp(3rem,9vw,7.6rem)" }}>{head.toUpperCase()}{tail && <><br /><span className="nr-accent">{tail.toLowerCase()}.</span></>}</h1>
        {e.subtitle && <p className="nr-lead">{e.subtitle}</p>}
        <div className="nr-stats" style={{ marginTop: 30 }}>
          <div><b>{fmt(e.starts_at, { day: "numeric" })}</b><span>{fmt(e.starts_at, { month: "short" })}</span></div>
          <div><b>{Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 3600000 * 10) / 10}h</b><span>duração</span></div>
          {left !== null && <div><b>{left}</b><span>{left === 1 ? "lugar livre" : "lugares livres"}</span></div>}
        </div>
        {e.location && <p className="nr-note" style={{ marginTop: 0 }}>📍 {e.location}</p>}
        <form id="inscricao" action={registerEvent} className="nr-card">
          {sp.erro && <p className="nr-err" role="alert">{sp.erro}</p>}
          {closed ? <p className="nr-lead" style={{ margin: 0 }}>{e.past ? "Este evento já aconteceu." : "Lotação esgotada."} Responde a um dos meus emails para saberes da próxima edição.</p> : (<>
            <input type="hidden" name="org" value={org} /><input type="hidden" name="slug" value={slug} /><input type="hidden" name="utm" value={JSON.stringify(utmFrom(sp) ?? {})} />
            <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}><label>Site <input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <div className="nr-fields">
              <label className="nr-field">O teu nome<input name="name" required autoComplete="name" placeholder="Como te chamas?" /></label>
              <label className="nr-field">O teu email<input name="email" type="email" required autoComplete="email" placeholder="nome@email.com" /></label>
              <label className="nr-field">WhatsApp (opcional)<input name="phone" type="tel" autoComplete="tel" placeholder="912 345 678" /></label>
            </div>
            <label className="nr-check"><input type="checkbox" name="consent" /><span>Quero receber também as novidades e próximos eventos. <a href="#privacidade">Privacidade</a>.</span></label>
            <button className="nr-cta"><span>GUARDAR O MEU LUGAR</span><span className="arw">→</span></button>
            <p className="nr-note">Recebes a confirmação com o convite para o teu calendário.</p>
          </>)}
        </form>
      </div></section>
      {points.length > 0 && (
        <section className="nr-list nr-pad"><div className="nr-wrap">
          <div className="nr-list-head"><h2 className="nr-h2">O QUE<br /><span className="nr-accent">levas daqui.</span></h2></div>
          {points.map((p, i) => <div key={i} className="nr-sin"><span className="num">{String(i + 1).padStart(2, "0")}</span><span className="t">{p}</span></div>)}
        </div></section>
      )}
      {!closed && <StickyCta target="#inscricao" label="GUARDAR O MEU LUGAR" />}
      <MetaPixel id={e.pixel} />
    </NoirShell>
  );
}
