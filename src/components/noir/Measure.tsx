"use client";
import { useEffect, useState } from "react";

/** Guarda a versão do teste A/B que esta pessoa viu, para ver sempre a mesma. */
export function AbCookie({ name, value }: { name: string; value: string }) {
  useEffect(() => { try { document.cookie = `${name}=${value}; path=/; max-age=${60 * 60 * 24 * 60}; samesite=lax`; } catch { /* sem cookies */ } }, [name, value]);
  return null;
}

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

function loadPixel(id: string, event?: string) {
  if (!window.fbq) {
    const f = function (...a: unknown[]) { if (f.callMethod) f.callMethod(...a); else f.queue!.push(a); } as Fbq;
    f.queue = []; f.loaded = true; f.version = "2.0"; f.push = f;
    window.fbq = f; window._fbq = f;
    const s = document.createElement("script"); s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js"; document.head.appendChild(s);
    window.fbq("init", id);
  }
  window.fbq("track", "PageView");
  if (event) window.fbq("track", event);
}

const KEY = "nr-cookies";
/** Meta Pixel só depois de a pessoa aceitar (RGPD). Sem ID configurado, não mostra nada. */
export function MetaPixel({ id, event }: { id?: string | null; event?: "Lead" | "Schedule" | "CompleteRegistration" }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    if (!id) return;
    let v: string | null = null;
    try { v = localStorage.getItem(KEY); } catch { /* privado */ }
    if (v === "yes") loadPixel(id, event); else if (v !== "no") setAsk(true);
  }, [id, event]);
  if (!id || !ask) return null;
  const choose = (yes: boolean) => { try { localStorage.setItem(KEY, yes ? "yes" : "no"); } catch { /* */ } setAsk(false); if (yes) loadPixel(id, event); };
  return (
    <div role="dialog" aria-label="Cookies" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(84px + env(safe-area-inset-bottom,0px))", zIndex: 70, maxWidth: 520, margin: "0 auto", background: "#111", border: "1px solid #333", padding: "16px 18px", color: "#CFCFCF", fontSize: 13, lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 12 }}>
      <span>Uso cookies de medição (Meta) para saber que anúncios funcionam. Nada é vendido. <a href="#privacidade">Saber mais</a>.</span>
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={() => choose(true)} style={{ flex: 1, minHeight: 42, background: "#C9A55C", color: "#080808", border: 0, fontWeight: 800, letterSpacing: 1.5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>ACEITAR</button>
        <button onClick={() => choose(false)} style={{ flex: 1, minHeight: 42, background: "transparent", color: "#CFCFCF", border: "1px solid #444", fontWeight: 700, letterSpacing: 1.5, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>RECUSAR</button>
      </div>
    </div>
  );
}
