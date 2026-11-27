import { ImageResponse } from "next/og";
import { anonClient } from "@/lib/supabase/anon";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Diagnóstico gratuito";

export default async function OG({ params }: { params: Promise<{ org: string; slug: string }> }) {
  const { org, slug } = await params;
  const { data } = await anonClient().rpc("public_magnet_peek", { p_org: org, p_slug: slug });
  const m = (data ?? { kind: "quiz", title: "Diagnóstico gratuito", author: "" }) as { kind: string; title: string; author: string; config?: { questions?: unknown[]; minutes?: number } };
  const quiz = m.kind === "quiz";
  const land = (m.kind === "guide" ? m.config : (m.config as { landing?: unknown } | undefined)?.landing) as { theme?: string; brand?: string; hero?: { lines: string[]; accent: string; eyebrow: string; cta?: string } } | undefined;
  if (land?.theme === "noir" && land.hero) {
    const h = land.hero;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#080808", color: "white", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, letterSpacing: 6, fontWeight: 800 }}><span>{land.brand}<span style={{ color: "#C9A55C" }}>.</span></span><span style={{ color: "#8A8A8A", fontWeight: 500, fontSize: 18 }}>{quiz ? "TESTE GRATUITO" : "GUIA GRATUITO"}</span></div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 20, letterSpacing: 6, color: "#C9A55C", marginBottom: 24 }}>{h.eyebrow}</div>
            {h.lines.map((l) => <div key={l} style={{ display: "flex", fontSize: 118, fontWeight: 900, lineHeight: 0.9, letterSpacing: -4 }}>{l}</div>)}
            <div style={{ display: "flex", fontSize: 110, fontStyle: "italic", fontWeight: 800, color: "#C9A55C", lineHeight: 1 }}>{h.accent}</div>
          </div>
          <div style={{ display: "flex", alignSelf: "flex-start", background: "#C9A55C", color: "#080808", padding: "18px 30px", fontSize: 26, fontWeight: 800, letterSpacing: 3 }}>{(h.cta ?? "QUERO") + " →"}</div>
        </div>
      ),
      size,
    );
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0B1B33 0%, #0A3B7A 55%, #0071E3 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 4, textTransform: "uppercase", opacity: 0.75 }}>{quiz ? "Diagnóstico gratuito" : "Ebook gratuito"}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 1000 }}>{m.title}</div>
          <div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>{quiz ? `${m.config?.questions?.length ?? 13} perguntas · ${m.config?.minutes ?? 3} minutos · resultado imediato` : "Guia prático com plano de 30 dias"}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 600 }}>{m.author}</div>
          <div style={{ display: "flex", background: "white", color: "#0B1B33", borderRadius: 18, padding: "16px 30px", fontSize: 30, fontWeight: 700 }}>{quiz ? "Fazer o diagnóstico →" : "Ler agora →"}</div>
        </div>
      </div>
    ),
    size,
  );
}
