import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import type { Landing } from "@/lib/landing";
import { cfgOf, freeSlots, type BookingCfg } from "@/lib/booking";
import { NoirAbout, NoirShell } from "@/components/noir/Noir";
import { MetaPixel } from "@/components/noir/Measure";

export const dynamic = "force-dynamic";
export const metadata = { title: "Está no teu email", robots: { index: false } };
type G = { kind: string; title: string; config: Landing; first_name: string | null; area: string | null; whatsapp: string | null; keyword: string | null; guide_url: string | null; booking_url: string | null; meeting_url: string | null; quiz_link: string | null; author: string; pixel?: string | null };
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", ...o }).format(new Date(iso));

export default async function GuideThanks({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const sb = anonClient();
  const { data } = await sb.rpc("public_magnet_result", { p_rid: rid });
  const g = data as G | null;
  if (!g || g.kind !== "guide") notFound();
  const l = g.config;
  const me = (l.brand ?? g.author).split(" ")[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const msg = `Olá ${me}! Sou ${g.first_name ?? ""}${g.area ? `, trabalho em ${g.area.toLowerCase()}` : ""} e pedi o guia “${g.title}”.${g.keyword ? ` ${g.keyword}` : ""}`;
  const wa = g.whatsapp ? `https://wa.me/${g.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}` : null;

  // Próximas vagas livres da agenda (um clique e fica escolhida)
  let slots: { iso: string; href: string }[] = [], duration = 30;
  const bslug = g.booking_url?.match(/^\/b\/([^?]+)/)?.[1];
  if (bslug) {
    const { data: info } = await sb.rpc("public_booking_info", { p_org: bslug });
    const i = info as { booking: BookingCfg; busy: [string, string][] } | null;
    if (i) {
      const cfg = cfgOf(i.booking); duration = cfg.duration;
      const days = freeSlots(cfg, i.busy);
      // uma vaga por dia, nos 3 primeiros dias com vagas (manhã se houver)
      slots = days.slice(0, 3).map((d) => d.slots[Math.min(1, d.slots.length - 1)]).filter(Boolean).map((iso) => ({ iso, href: `/b/${bslug}?r=${rid}&h=${encodeURIComponent(iso)}` }));
    }
  }
  const meet = g.meeting_url || g.booking_url;

  return (
    <NoirShell l={l}>
      <section className="nr-hero nr-pad">
        <div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30, paddingBottom: 70 }}>
          <p className="nr-eyebrow nr-kicker">PEDIDO RECEBIDO</p>
          <h1 className="nr-h1">ESTÁ NO TEU<br /><span className="nr-accent">email, {(g.first_name ?? "").toLowerCase() || "tu"}.</span></h1>
          <p className="nr-lead">Enviei-te agora o guia. Se não o vires em 2 minutos, <b className="nr-b">espreita a pasta Promoções ou Spam</b> e arrasta-o para a caixa principal.</p>
          <div className="nr-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {g.guide_url && <a className="nr-cta" href={g.guide_url} target="_blank" rel="noopener noreferrer"><span>LER O GUIA JÁ</span><span className="arw">↓</span></a>}
            {wa && <a className="nr-ghost" href={wa}><span>RECEBER TAMBÉM NO WHATSAPP</span><span>→</span></a>}
          </div>
        </div>
      </section>

      {slots.length > 0 && (
        <section className="nr-pad" style={{ paddingBottom: 90 }}><div className="nr-wrap" style={{ maxWidth: 980 }}>
          <p className="nr-eyebrow" style={{ marginBottom: 18 }}>QUERES IR MAIS RÁPIDO?</p>
          <h2 className="nr-h2" style={{ fontSize: "clamp(2rem,5vw,3.8rem)" }}>{duration} minutos com o {me}.<br /><span className="nr-accent">Sem custos.</span></h2>
          <p className="nr-after" style={{ marginTop: 22 }}>Olhamos para o teu negócio, vemos qual dos 7 erros te está a custar mais e sais com 3 prioridades claras. Escolhe uma hora:</p>
          <div className="nr-ab" style={{ margin: "28px 0 0", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", maxWidth: "none" }}>
            {slots.map((s) => (
              <a key={s.iso} href={s.href} className="nr-a" style={{ textDecoration: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="nr-eyebrow" style={{ textTransform: "uppercase" }}>{fmt(s.iso, { weekday: "long" })}</span>
                <span style={{ fontWeight: 900, fontSize: "2.2rem", color: "#fff", lineHeight: 1 }}>{fmt(s.iso, { hour: "2-digit", minute: "2-digit" })}</span>
                <span style={{ color: "var(--muted)", fontSize: 13 }}>{fmt(s.iso, { day: "numeric", month: "long" })} · <span style={{ color: "var(--gold)", fontWeight: 700 }}>Marcar →</span></span>
              </a>
            ))}
          </div>
          <p className="nr-note" style={{ marginTop: 18 }}><a href={g.booking_url!}>Ver todos os horários →</a></p>
        </div></section>
      )}

      <section className="nr-pad" style={{ paddingBottom: 120 }}><div className="nr-wrap">
        <p className="nr-eyebrow" style={{ marginBottom: 28 }}>ENQUANTO LÊS</p>
        <div className="nr-ab" style={{ margin: 0, maxWidth: 980 }}>
          {g.quiz_link && <a className="nr-b-opt" href={g.quiz_link}><div><p className="nr-eyebrow">2 MINUTOS</p><h3>Descobre quantos dos 7 pecados estás a cometer.</h3></div><span className="go"><span>FAZER O TESTE</span><span>→</span></span></a>}
          {meet && !slots.length && <a className="nr-a" href={meet} style={{ textDecoration: "none" }}><p className="nr-eyebrow">30 MINUTOS · SEM CUSTOS</p><h3 style={{ color: "#fff", textDecoration: "none", fontStyle: "italic" }}>Conversa de diagnóstico com o {me}.</h3><p>Vemos onde estás a perder dinheiro e sais com 3 prioridades. <span style={{ color: "var(--gold)", fontWeight: 700 }}>Escolher hora →</span></p></a>}
        </div>
      </div></section>
      {l.about && <NoirAbout a={l.about} />}
      <MetaPixel id={g.pixel} event="Lead" />
    </NoirShell>
  );
}
