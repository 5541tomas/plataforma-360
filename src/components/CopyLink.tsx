"use client";
import { useState } from "react";
export function CopyLink({ url }: { url: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <code className="min-w-0 truncate rounded-lg bg-[#F2F2F5] px-2.5 py-1.5 text-xs text-ink-2">{url}</code>
      <button type="button" onClick={async () => { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1800); }} className="text-sm font-medium text-accent-ink">{ok ? "Copiado ✓" : "Copiar"}</button>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-muted hover:text-ink">Abrir ↗</a>
    </div>
  );
}
