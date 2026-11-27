import type { Landing } from "@/lib/landing";
import { advice, levelOf, type QuizConfig } from "@/lib/magnets";
import { NoirAbout, NoirShell, NoirList } from "./Noir";

type Res = { config: QuizConfig & { landing: Landing }; scores: Record<string, number>; total: number; first_name: string | null; author: string;
  whatsapp: string | null; guide_link: string | null; guide_title: string | null; meeting_url: string | null; booking_url: string | null };

/** "Cometes N dos 7 pecados" — resultado do teste no estilo da marca */
export function NoirResult({ r }: { r: Res }) {
  const cfg = r.config, l = cfg.landing;
  const committed = cfg.areas.map((a) => (r.scores[a.key] ?? 0) < 67);
  const n = committed.filter(Boolean).length;
  const worst = [...cfg.areas].sort((a, b) => (r.scores[a.key] ?? 0) - (r.scores[b.key] ?? 0))[0];
  const level = levelOf(cfg, r.total);
  const meet = r.meeting_url || r.booking_url;
  const me = (l.brand ?? r.author).split(" ")[0].toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const wa = r.whatsapp ? `https://wa.me/${r.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${me}! Fiz o teste e cometo ${n} dos 7 pecados. Quero receber o guia “Os 7 Erros do Freelancer”. GUIA`)}` : null;
  const list = { title: n === 0 ? "ZERO PECADOS" : "OS TEUS PECADOS", accent: "um a um.", intro: "Os riscados estás a fazer bem. Os outros têm correção — e é mais simples do que parece.",
    items: cfg.areas.map((a, i) => ({ t: a.name + ".", d: committed[i] ? advice(a, r.scores[a.key] ?? 0) : "Aqui estás a fazer bem. Mantém." })) };
  return (
    <NoirShell l={{ ...l, edition: "O TEU RESULTADO" }}>
      <section className="nr-hero nr-pad">
        <div className="nr-wrap nr-hero-copy nophoto" style={{ paddingTop: 30, paddingBottom: 90 }}>
          <p className="nr-eyebrow nr-kicker">{(r.first_name ?? "").toUpperCase()}{r.first_name ? ", " : ""}A VERDADE</p>
          <p className="nr-lead" style={{ marginTop: 0, fontSize: "1.3rem" }}>Cometes</p>
          <div className="nr-score">{n}<small> dos 7 pecados.</small></div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", marginTop: 34 }}><span className="nr-chip">{level.name}</span><span style={{ color: "var(--muted)", fontSize: 13, letterSpacing: 2 }}>PONTUAÇÃO {r.total}/100</span></div>
          <p className="nr-lead">{level.text}</p>
          {n > 0 && (
            <div className="nr-card">
              <p className="nr-eyebrow" style={{ marginBottom: 12 }}>COMEÇA POR AQUI</p>
              <h2 className="nr-q-title" style={{ marginBottom: 12 }}>{worst.name}.</h2>
              <p style={{ margin: "0 0 22px", color: "var(--soft)", lineHeight: 1.65 }}>{advice(worst, r.scores[worst.key] ?? 0)}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {r.guide_link ? <a className="nr-cta" href={r.guide_link}><span>QUERO O GUIA COM A CORREÇÃO</span><span className="arw">→</span></a>
                  : wa && <a className="nr-cta" href={wa}><span>QUERO O GUIA NO WHATSAPP</span><span className="arw">→</span></a>}
                {meet && <a className="nr-ghost" id="reuniao" href={meet}><span>CONVERSA DE DIAGNÓSTICO · 30 MIN</span><span>→</span></a>}
              </div>
            </div>
          )}
        </div>
      </section>
      <NoirList l={list} ok={committed.map((c) => !c)} />
      {l.about && <NoirAbout a={l.about} />}
    </NoirShell>
  );
}
