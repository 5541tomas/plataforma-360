import { notFound } from "next/navigation";
import { anonClient } from "@/lib/supabase/anon";
import type { Landing } from "@/lib/landing";
import { NoirAbout, NoirShell } from "@/components/noir/Noir";
import { AutoOpen } from "@/components/noir/AutoOpen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Quase lá", robots: { index: false } };
type G = { kind: string; title: string; config: Landing; first_name: string | null; area: string | null; whatsapp: string | null; keyword: string | null; guide_url: string | null; booking_url: string | null; meeting_url: string | null; quiz_link: string | null; author: string };

export default async function GuideThanks({ params }: { params: Promise<{ rid: string }> }) {
  const { rid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(rid)) notFound();
  const { data } = await anonClient().rpc("public_magnet_result", { p_rid: rid });
  const g = data as G | null;
  if (!g || g.kind !== "guide") notFound();
  const l = g.config;
  const me = (l.brand ?? g.author).split(" ")[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const msg = `Olá ${me}! Sou ${g.first_name ?? ""}${g.area ? `, trabalho em ${g.area.toLowerCase()}` : ""} e quero receber o guia gratuito “${g.title}”.${g.keyword ? ` ${g.keyword}` : ""}`;
  const wa = g.whatsapp ? `https://wa.me/${g.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}` : null;
  const meet = g.meeting_url || g.booking_url;
  return (
    <NoirShell l={l}>
      {wa && <AutoOpen href={wa} id={rid} />}
      <section className="nr-hero nr-pad">
        <div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30 }}>
          <p className="nr-eyebrow nr-kicker">FALTA SÓ UM PASSO</p>
          <h1 className="nr-h1">QUASE LÁ,<br /><span className="nr-accent">{(g.first_name ?? "").toLowerCase() || "tu"}.</span></h1>
          <p className="nr-lead">{wa ? <>Abrimos o teu WhatsApp com a mensagem já escrita. <b className="nr-b">Carrega em enviar</b> e o guia chega em segundos.</> : <>Recebemos o teu pedido. O guia chega ao teu WhatsApp em breve.</>}</p>
          <div className="nr-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {wa && <a className="nr-cta" href={wa}><span>ABRIR O WHATSAPP</span><span className="arw">→</span></a>}
            {g.guide_url && <a className="nr-ghost" href={g.guide_url} target="_blank" rel="noopener noreferrer"><span>OU DESCARREGA JÁ O GUIA</span><span>↓</span></a>}
            <p className="nr-note" style={{ margin: 0 }}>Não abriu? Carrega no botão. No computador, abre o WhatsApp Web.</p>
          </div>
        </div>
      </section>
      <section className="nr-pad" style={{ paddingBottom: 120 }}><div className="nr-wrap">
        <p className="nr-eyebrow" style={{ marginBottom: 28 }}>ENQUANTO ESPERAS</p>
        <div className="nr-ab" style={{ margin: 0, maxWidth: 980 }}>
          {g.quiz_link && <a className="nr-b-opt" href={g.quiz_link}><div><p className="nr-eyebrow">2 MINUTOS</p><h3>Descobre quantos dos 7 pecados estás a cometer.</h3></div><span className="go"><span>FAZER O TESTE</span><span>→</span></span></a>}
          {meet && <a className="nr-a" href={meet} style={{ textDecoration: "none" }}><p className="nr-eyebrow">30 MINUTOS · SEM CUSTOS</p><h3 style={{ color: "#fff", textDecoration: "none", fontStyle: "italic" }}>Conversa de diagnóstico com o {me}.</h3><p>Vemos onde estás a perder dinheiro e sais com 3 prioridades. <span style={{ color: "var(--gold)", fontWeight: 700 }}>Escolher hora →</span></p></a>}
        </div>
      </div></section>
      {l.about && <NoirAbout a={l.about} />}
    </NoirShell>
  );
}
