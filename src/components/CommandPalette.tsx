"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, quickTask, type Hit } from "@/app/(app)/search-actions";

type Item = Hit & { run?: () => void };
const PAGES: Item[] = [
  { group: "Ir para", label: "Hoje", href: "/" }, { group: "Ir para", label: "Meta", href: "/meta" }, { group: "Ir para", label: "Objetivos", href: "/objetivos" },
  { group: "Ir para", label: "Finanças", href: "/financas" }, { group: "Ir para", label: "Cobranças", href: "/financas/cobrancas" }, { group: "Ir para", label: "Dívidas", href: "/financas/dividas" },
  { group: "Ir para", label: "Importar extrato", href: "/financas/importar" }, { group: "Ir para", label: "CRM · Pipeline", href: "/crm" }, { group: "Ir para", label: "Contactos", href: "/crm/contactos" },
  { group: "Ir para", label: "Automações · fila de aprovação", href: "/crm/automacoes" }, { group: "Ir para", label: "Lead magnets", href: "/crm/lead-magnets" }, { group: "Ir para", label: "Agenda de marcações", href: "/crm/agenda" },
  { group: "Ir para", label: "Relatórios do CRM", href: "/crm/relatorios" }, { group: "Ir para", label: "Revisão semanal", href: "/revisao" }, { group: "Ir para", label: "Revisão mensal", href: "/revisao/mensal" },
  { group: "Ir para", label: "Assistente IA", href: "/assistente" }, { group: "Ir para", label: "Definições", href: "/definicoes" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); } };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey); window.addEventListener("open-palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("open-palette", onOpen); };
  }, []);
  useEffect(() => { if (!open) { setQ(""); setHits([]); setSel(0); setMsg(""); } }, [open]);
  useEffect(() => {
    const id = ++seq.current;
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => { const r = await globalSearch(q); if (id === seq.current) { setHits(r); setSel(0); } }, 160);
    return () => clearTimeout(t);
  }, [q]);

  const close = useCallback(() => setOpen(false), []);
  const items: Item[] = useMemo(() => {
    const t = q.trim().toLowerCase();
    const pages = PAGES.filter((p) => !t || p.label.toLowerCase().includes(t)).slice(0, t ? 4 : 8);
    const actions: Item[] = t.length >= 2 ? [{ group: "Ações", label: `Criar tarefa para hoje: “${q.trim()}”`, href: "", run: async () => { const e = await quickTask(q.trim()); setMsg(e ?? "Tarefa criada ✓"); if (!e) { router.refresh(); setTimeout(close, 700); } } }] : [
      { group: "Ações", label: "Nova oportunidade", href: "/crm?nova=1" }, { group: "Ações", label: "Registar movimento", href: "/financas?novo=1" },
    ];
    return [...hits, ...actions, ...pages];
  }, [q, hits, router, close]);

  const go = (it: Item) => { if (it.run) { it.run(); return; } setOpen(false); router.push(it.href); };
  if (!open) return null;
  let last = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/25 px-3 pt-[8vh] backdrop-blur-[2px]" onClick={close}>
      <div role="dialog" aria-label="Pesquisar" className="w-full max-w-[600px] overflow-hidden rounded-[18px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.25)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6E6E73" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          <input ref={input} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar contactos, negócios, tarefas… ou escrever uma tarefa"
            aria-label="Pesquisar" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={`pi-${sel}`}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
              else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && items[sel]) { e.preventDefault(); go(items[sel]); }
            }}
            className="min-h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted" />
          <kbd className="hidden rounded-md bg-[#F2F2F5] px-1.5 py-0.5 text-[11px] text-muted sm:block">esc</kbd>
        </div>
        {msg && <p role="status" className="px-4 pt-3 text-sm text-good">{msg}</p>}
        <ul id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {items.map((it, i) => {
            const head = it.group !== last ? (last = it.group) : null;
            return (
              <li key={i} role="none">
                {head && <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-muted">{head}</div>}
                <button id={`pi-${i}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => go(it)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2.5 text-left text-[14.5px] ${i === sel ? "bg-accent text-white" : "text-ink"}`}>
                  <span className="truncate">{it.label}</span>{it.meta && <span className={`shrink-0 truncate text-xs ${i === sel ? "text-white/80" : "text-muted"}`}>{it.meta}</span>}
                </button>
              </li>
            );
          })}
          {q.trim().length >= 2 && hits.length === 0 && <li className="px-3 py-2 text-sm text-muted">Sem resultados para “{q.trim()}”.</li>}
        </ul>
      </div>
    </div>
  );
}
