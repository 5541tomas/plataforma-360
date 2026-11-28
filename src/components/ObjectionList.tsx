"use client";
import { useMemo, useState } from "react";

export type Obj = { id: string; category: string; title: string; meaning: string | null; response: string; question: string | null; used: number };

/** Pesquisa rápida nas objeções, com botão para copiar a resposta. Usado na página e dentro dos negócios. */
export function ObjectionList({ items, compact, onUse }: { items: Obj[]; compact?: boolean; onUse?: (id: string) => Promise<void> }) {
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [copied, setCopied] = useState<string | null>(null);
  const cats = useMemo(() => [...new Set(items.map((o) => o.category))], [items]);
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const list = items.filter((o) => (!cat || o.category === cat) && (!q.trim() || norm(`${o.title} ${o.response} ${o.meaning ?? ""}`).includes(norm(q.trim()))));
  const copy = async (o: Obj) => {
    try { await navigator.clipboard.writeText([o.response, o.question].filter(Boolean).join("\n\n")); } catch { /* sem permissão */ }
    setCopied(o.id); setTimeout(() => setCopied(null), 1500); onUse?.(o.id).catch(() => {});
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="O que é que o cliente disse? (ex.: caro, pensar, sócio)" className="input min-w-[220px] flex-1" aria-label="Pesquisar objeções" />
        {!compact && <select value={cat} onChange={(e) => setCat(e.target.value)} className="input w-auto" aria-label="Categoria"><option value="">Todas</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>}
      </div>
      {list.length === 0 && <p className="text-sm text-muted">Nada encontrado. Tenta outra palavra.</p>}
      {list.map((o) => (
        <details key={o.id} id={o.id} className={compact ? "rounded-xl border border-line px-3 py-2" : "card !p-4"}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2"><span className="chip bg-[#F2F2F5] text-ink-2">{o.category}</span><span className="font-semibold">{o.title}</span>{o.used > 0 && <span className="text-xs text-muted">usada {o.used}×</span>}</summary>
          <div className="mt-3 flex flex-col gap-2.5 text-sm">
            {o.meaning && <p className="text-muted"><strong className="font-semibold text-ink-2">O que costuma querer dizer:</strong> {o.meaning}</p>}
            <p className="whitespace-pre-line rounded-xl bg-accent-soft px-3 py-2.5 leading-relaxed text-ink">{o.response}</p>
            {o.question && <p><strong className="font-semibold">Pergunta para fechar:</strong> {o.question}</p>}
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => copy(o)} className="btn-ghost">{copied === o.id ? "Copiado ✓" : "Copiar resposta"}</button></div>
          </div>
        </details>
      ))}
    </div>
  );
}
