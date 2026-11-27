"use client";
import { useState } from "react";
import { CHANNELS } from "@/lib/utm";

/** Cria o link do lead magnet com a origem (para saberes que canal traz clientes). */
export function LinkBuilder({ url }: { url: string }) {
  const [ch, setCh] = useState("instagram"), [camp, setCamp] = useState(""), [done, setDone] = useState(false);
  const slug = camp.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const link = `${url}${url.includes("?") ? "&" : "?"}origem=${ch}${slug ? `&campanha=${slug}` : ""}`;
  return (
    <details className="text-sm"><summary className="cursor-pointer font-medium text-accent-ink">Criar link por canal</summary>
      <div className="mt-2 flex flex-col gap-2 rounded-xl bg-[#F7F7F9] p-3">
        <div className="flex flex-wrap gap-2">
          <select value={ch} onChange={(e) => setCh(e.target.value)} aria-label="Canal" className="input !min-h-10 !w-auto">{CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
          <input value={camp} onChange={(e) => setCamp(e.target.value)} placeholder="Campanha (opcional): ex. bio, anúncio janeiro" aria-label="Campanha" className="input !min-h-10 min-w-0 flex-1" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-xs">{link}</code>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* sem acesso */ } }} className="font-medium text-accent-ink">{done ? "Copiado ✓" : "Copiar"}</button>
        </div>
        <span className="text-xs text-muted">Usa um link diferente em cada sítio (bio, anúncio, newsletter). Em Relatórios vês quantas leads, reuniões e clientes cada um trouxe.</span>
      </div>
    </details>
  );
}
